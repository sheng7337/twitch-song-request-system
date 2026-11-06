// server/stream-app.js
// Controls the streaming app on this PC for the dashboard's modes (modes.js): Streamlabs Desktop
// through its Remote Control API (JSON-RPC on ws://127.0.0.1:59650/api/websocket, token from its
// Settings → Remote Control) or OBS Studio 30+ through obs-websocket 5 (ws://127.0.0.1:4455,
// optional password). Both look the same from outside: read() gives every scene with its items, the
// audio sources and the canvas; the set*() calls take what read() gave. Things are named by their IDs,
// which stay the same when they're renamed in the streaming app.
// Streamlabs' Dual Output gives each source one item per canvas: `display` = horizontal | vertical.
//
// .env: STREAM_APP (streamlabs | obs), STREAMLABS_TOKEN, STREAMLABS_PORT, OBS_WS_PORT, OBS_WS_PASSWORD.

const WebSocket = require('ws');
const crypto = require('crypto');
const { UserError } = require('./messages');

const TIMEOUT_MS = 5000;
const APPS = { streamlabs: 'Streamlabs Desktop', obs: 'OBS Studio' };

function settings() {
  const app = APPS[process.env.STREAM_APP] ? process.env.STREAM_APP : null;
  const port = Number(app === 'obs' ? process.env.OBS_WS_PORT || 4455 : process.env.STREAMLABS_PORT || 59650);
  const secret = (app === 'obs' ? process.env.OBS_WS_PASSWORD : process.env.STREAMLABS_TOKEN) || '';
  return { app, port, secret };
}

// What the dashboard may know: no token or password
function status() {
  const { app, port, secret } = settings();
  return { app, port, hasSecret: !!secret, connected: !!(conn && conn.open && conn.key === key()) };
}

let conn = null;   // { key, open, call, close } for the settings in `key`
const key = () => JSON.stringify(settings());

function offline(app) {
  return new UserError('streamAppOffline', { app: APPS[app] }, `${APPS[app]} isn't reachable: is it running, with remote control on?`);
}

// A WebSocket, open. `onMessage` gets each parsed message from the start: OBS greets right on opening.
function socket(url, app, onMessage) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { handshakeTimeout: TIMEOUT_MS });
    ws.on('message', (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      onMessage(msg, ws);
    });
    ws.once('open', () => resolve(ws));
    ws.once('error', () => reject(offline(app)));
  });
}

// Requests waiting for their answers; all fail when the connection closes
function pendingCalls(ws, app) {
  const pending = new Map();
  let nextId = 0;
  ws.on('close', () => {
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(offline(app)); }
    pending.clear();
  });
  ws.on('error', () => {});
  return {
    add(send) {
      const id = String(++nextId);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new UserError('streamAppTimeout', { app: APPS[app] }, `${APPS[app]} didn't answer.`));
        }, TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        send(id);
      });
    },
    settle(id, err, result) {
      const p = pending.get(String(id));
      if (!p) return;
      pending.delete(String(id));
      clearTimeout(p.timer);
      if (err) p.reject(err); else p.resolve(result);
    },
  };
}

// ── Streamlabs Desktop ─────────────────────────────────────────────────────────

async function connectStreamlabs({ port, secret }) {
  if (!secret) throw new UserError('streamAppNoToken', {}, 'Paste the Remote Control token from Streamlabs Desktop first.');
  let calls;
  const ws = await socket(`ws://127.0.0.1:${port}/api/websocket`, 'streamlabs', (msg) => {
    if (msg.id == null) return;   // events: not subscribed to
    calls.settle(msg.id, msg.error ? new Error(msg.error.message || 'Streamlabs error') : null, msg.result);
  });
  calls = pendingCalls(ws, 'streamlabs');
  const call = (method, resource, args = []) => calls.add(id =>
    ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: { resource, args } })));

  const ok = await call('auth', 'TcpServerService', [secret]).catch(() => false);
  if (ok !== true) {
    ws.close();
    throw new UserError('streamAppBadToken', {}, 'Streamlabs Desktop refused the token: copy it again from Settings → Remote Control.');
  }

  const vec = v => Array.isArray(v) ? { x: v[0], y: v[1] } : { x: v.x, y: v.y };
  return {
    ws,
    async read() {
      const [scenes, current, audio] = await Promise.all([
        call('getScenes', 'ScenesService'), call('activeSceneId', 'ScenesService'), call('getSources', 'AudioService'),
      ]);
      return {
        app: 'streamlabs', canvas: null, current,
        scenes: scenes.map(s => ({
          id: s.id, name: s.name,
          items: (s.nodes || []).filter(n => n.sceneNodeType === 'item').map(n => ({
            id: String(n.sceneItemId || n.id), sourceId: n.sourceId, name: n.name, visible: !!n.visible, ref: n.resourceId,
            display: n.display || null,
            place: n.transform && {
              position: vec(n.transform.position), scale: vec(n.transform.scale),
              crop: { ...n.transform.crop }, rotation: n.transform.rotation,
            },
          })),
        })),
        // volume: the mixer slider's position, 0–100 %
        audio: audio.map(a => ({
          id: a.sourceId, name: a.name, muted: !!a.muted, ref: a.resourceId,
          volume: Math.round((a.fader ? a.fader.deflection : 1) * 1000) / 10,
        })),
      };
    },
    setScene: scene => call('makeSceneActive', 'ScenesService', [scene.id]),
    setVisible: (scene, item, visible) => call('setVisibility', item.ref, [visible]),
    setPlace: (scene, item, place) => call('setTransform', item.ref, [place]),
    async setAudio(source, { muted, volume }) {
      if (muted != null) await call('setMuted', source.ref, [muted]);
      if (volume != null) await call('setDeflection', source.ref, [Math.min(Math.max(volume, 0), 100) / 100]);
    },
  };
}

// ── OBS Studio (obs-websocket 5) ──────────────────────────────────────────────

// The authentication string from obs-websocket's Hello challenge
function obsAuth(password, { salt, challenge }) {
  const hash = s => crypto.createHash('sha256').update(s).digest('base64');
  return hash(hash(password + salt) + challenge);
}

// Transform fields obs-websocket takes back. Bounds only when used: 0 is refused even with no bounds.
const OBS_PLACE = ['positionX', 'positionY', 'rotation', 'scaleX', 'scaleY', 'alignment',
  'cropTop', 'cropBottom', 'cropLeft', 'cropRight', 'boundsType', 'boundsWidth', 'boundsHeight', 'boundsAlignment'];
function obsPlace(t) {
  if (!t) return null;
  const place = {};
  for (const k of OBS_PLACE) if (t[k] != null) place[k] = t[k];
  if (!place.boundsType || place.boundsType === 'OBS_BOUNDS_NONE') {
    delete place.boundsWidth; delete place.boundsHeight; delete place.boundsAlignment;
  }
  return place;
}

async function connectObs({ port, secret }) {
  let calls, ws, hello;
  const identified = new Promise((resolve, reject) => { hello = { resolve, reject }; });
  const onMessage = (msg, socketWs) => {
    const { resolve, reject } = hello;
    if (msg.op === 0) {
      const auth = msg.d.authentication;
      if (auth && !secret) {
        socketWs.close();
        return reject(new UserError('streamAppNeedPassword', {}, 'OBS asks for a password: copy it from Tools → WebSocket Server Settings.'));
      }
      socketWs.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 0, ...(auth ? { authentication: obsAuth(secret, auth) } : {}) } }));
    } else if (msg.op === 2) {
      resolve();
    } else if (msg.op === 7) {
      const st = msg.d.requestStatus || {};
      calls.settle(msg.d.requestId, st.result ? null : Object.assign(new Error(st.comment || `OBS error ${st.code}`), { obsCode: st.code }), msg.d.responseData || {});
    }
  };
  ws = await socket(`ws://127.0.0.1:${port}`, 'obs', onMessage);
  calls = pendingCalls(ws, 'obs');
  const timer = setTimeout(() => hello.reject(offline('obs')), TIMEOUT_MS);
  ws.on('close', (code) => {
    hello.reject(code === 4009
      ? new UserError('streamAppBadPassword', {}, 'OBS refused the password: check Tools → WebSocket Server Settings.')
      : offline('obs'));
  });
  try { await identified; } catch (err) { ws.close(); throw err; } finally { clearTimeout(timer); }

  const call = (requestType, requestData = {}) => calls.add(requestId =>
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } })));

  return {
    ws,
    async read() {
      const [list, video, inputs] = await Promise.all([call('GetSceneList'), call('GetVideoSettings'), call('GetInputList')]);
      if (!list.scenes.every(s => s.sceneUuid)) throw new UserError('streamAppObsOld', {}, 'Modes need OBS Studio 30 or newer.');
      const scenes = [];
      const item = i => ({
        id: String(i.sceneItemId), sourceId: i.sourceUuid, name: i.sourceName, visible: !!i.sceneItemEnabled,
        place: obsPlace(i.sceneItemTransform), group: !!i.isGroup,
      });
      // Scenes in OBS's own order (top first); groups after them, like nested scenes
      for (const s of [...list.scenes].sort((a, b) => b.sceneIndex - a.sceneIndex)) {
        const { sceneItems } = await call('GetSceneItemList', { sceneUuid: s.sceneUuid });
        scenes.push({ id: s.sceneUuid, name: s.sceneName, items: sceneItems.map(item) });
      }
      const groups = new Map();
      for (const s of scenes) for (const i of s.items) if (i.group) groups.set(i.sourceId, i.name);
      for (const [id, name] of groups) {
        const { sceneItems } = await call('GetGroupSceneItemList', { sceneUuid: id });
        scenes.push({ id, name, group: true, items: sceneItems.map(item) });
      }
      // Inputs without sound (images, browser sources without audio…) refuse the volume calls
      const audio = [];
      for (const input of inputs.inputs) {
        try {
          const [m, v] = await Promise.all([
            call('GetInputMute', { inputUuid: input.inputUuid }), call('GetInputVolume', { inputUuid: input.inputUuid }),
          ]);
          audio.push({
            id: input.inputUuid, name: input.inputName, muted: !!m.inputMuted,
            volume: v.inputVolumeDb == null ? -100 : Math.max(-100, Math.round(v.inputVolumeDb * 10) / 10),   // dB
          });
        } catch (err) {
          if (!err.obsCode) throw err;
        }
      }
      return {
        app: 'obs', current: list.currentProgramSceneUuid, scenes, audio,
        canvas: { width: video.baseWidth, height: video.baseHeight },
      };
    },
    setScene: scene => call('SetCurrentProgramScene', { sceneUuid: scene.id }),
    setVisible: (scene, item, visible) => call('SetSceneItemEnabled', { sceneUuid: scene.id, sceneItemId: Number(item.id), sceneItemEnabled: visible }),
    setPlace: (scene, item, place) => call('SetSceneItemTransform', { sceneUuid: scene.id, sceneItemId: Number(item.id), sceneItemTransform: place }),
    async setAudio(source, { muted, volume }) {
      if (muted != null) await call('SetInputMute', { inputUuid: source.id, inputMuted: muted });
      if (volume != null) await call('SetInputVolume', { inputUuid: source.id, inputVolumeDb: Math.min(Math.max(volume, -100), 26) });
    },
  };
}

// ── The connection ────────────────────────────────────────────────────────────

let connecting = null;

// The open connection for the current settings, opened (again) when needed
async function get() {
  const s = settings();
  if (!s.app) throw new UserError('streamAppNotSet', {}, 'Choose Streamlabs Desktop or OBS Studio first.');
  const k = key();
  if (conn && conn.open && conn.key === k) return conn;
  if (connecting && connecting.key === k) return connecting.promise;
  close();
  const promise = (s.app === 'obs' ? connectObs(s) : connectStreamlabs(s)).then((driver) => {
    const c = { ...driver, key: k, open: true };
    driver.ws.on('close', () => { c.open = false; });
    conn = c;
    return c;
  }).finally(() => { if (connecting && connecting.promise === promise) connecting = null; });
  connecting = { key: k, promise };
  return promise;
}

function close() {
  if (conn) { conn.open = false; try { conn.ws.close(); } catch {} }
  conn = null;
}

module.exports = { APPS, settings, status, get, close, obsAuth, obsPlace };
