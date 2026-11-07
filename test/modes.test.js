const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');
const { stubModule } = require('./helpers');

// Streamlabs Desktop and OBS are faked on local ports: no real scene, source or volume changes
process.env.STREAM_MODES_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'modes-')), 'stream-modes.json');
const chat = [];
let held = false;
stubModule('chat-send.js', { send: async (text) => { chat.push(text); return { id: 'c1' }; } });
stubModule('media-queue.js', { setHold: (on) => { held = on; }, isHeld: () => held });
console.log = () => {};
console.error = () => {};
const streamApp = require('../server/stream-app');
const modes = require('../server/modes');
modes.init(() => {});

const clone = v => JSON.parse(JSON.stringify(v));
const place = (x, y) => ({ position: { x, y }, scale: { x: 1, y: 1 }, crop: { top: 0, bottom: 0, left: 0, right: 0 }, rotation: 0 });

// ── A fake Streamlabs Desktop ──
function fakeStreamlabs(token) {
  const sl = {
    calls: [], current: 'sc_sing',
    scenes: [
      { id: 'sc_sing', name: 'Singing', nodes: [
        { sceneNodeType: 'item', sceneItemId: 'i1', sourceId: 'cam', name: 'Webcam', visible: true, transform: place(10, 20), resourceId: 'SceneItem[i1]' },
        { sceneNodeType: 'folder', id: 'f1', name: 'Folder' },
        { sceneNodeType: 'item', sceneItemId: 'i2', sourceId: 'sc_shared', name: 'Shared', visible: true, transform: place(0, 0), resourceId: 'SceneItem[i2]' },
      ] },
      { id: 'sc_shared', name: 'Shared', nodes: [
        { sceneNodeType: 'item', sceneItemId: 'i3', sourceId: 'lyrics', name: 'Lyrics', visible: false, transform: place(5, 5), resourceId: 'SceneItem[i3]' },
      ] },
      { id: 'sc_talk', name: 'Talking', nodes: [] },
    ],
    audio: [
      { sourceId: 'mic', name: 'Mic', muted: false, fader: { deflection: 0.8 }, resourceId: 'AudioSource[mic]' },
      { sourceId: 'bgm', name: 'BGM', muted: true, fader: { deflection: 0.5 }, resourceId: 'AudioSource[bgm]' },
    ],
  };
  const items = () => sl.scenes.flatMap(s => s.nodes);
  sl.server = new WebSocket.Server({ port: 0, path: '/api/websocket' });
  sl.server.on('connection', (ws) => {
    let authed = false;
    ws.on('message', (raw) => {
      const { id, method, params: { resource, args } } = JSON.parse(raw);
      const reply = result => ws.send(JSON.stringify({ jsonrpc: '2.0', id, result }));
      if (method === 'auth') {
        authed = args[0] === token;
        return authed ? reply(true) : ws.send(JSON.stringify({ jsonrpc: '2.0', id, error: { message: 'Invalid token' } }));
      }
      if (!authed) return;
      if (!/^get|^active/.test(method)) sl.calls.push([method, resource, ...args]);
      if (method === 'getScenes') return reply(clone(sl.scenes));
      if (method === 'activeSceneId') return reply(sl.current);
      if (method === 'getSources') return reply(clone(sl.audio));
      if (method === 'makeSceneActive') sl.current = args[0];
      if (method === 'setVisibility') items().find(n => n.resourceId === resource).visible = args[0];
      if (method === 'setMuted') sl.audio.find(a => a.resourceId === resource).muted = args[0];
      if (method === 'setDeflection') sl.audio.find(a => a.resourceId === resource).fader.deflection = args[0];
      reply(null);
    });
  });
  sl.port = () => sl.server.address().port;
  return sl;
}

// ── A fake OBS (obs-websocket 5) ──
function fakeObs(password) {
  const auth = { salt: 'pepper', challenge: 'riddle' };
  const obs = {
    calls: [], current: 'u_main',
    scenes: [
      { sceneName: 'Main', sceneUuid: 'u_main', sceneIndex: 1, items: [
        { sceneItemId: 1, sourceName: 'Cam', sourceUuid: 'u_cam', sceneItemEnabled: true, isGroup: false,
          sceneItemTransform: { positionX: 1, positionY: 2, scaleX: 1, scaleY: 1, rotation: 0, boundsType: 'OBS_BOUNDS_NONE', boundsWidth: 0, width: 640 } },
        { sceneItemId: 2, sourceName: 'Group', sourceUuid: 'u_group', sceneItemEnabled: true, isGroup: true, sceneItemTransform: {} },
      ] },
      { sceneName: 'Break', sceneUuid: 'u_break', sceneIndex: 0, items: [] },
    ],
    groups: { u_group: [{ sceneItemId: 7, sourceName: 'Text', sourceUuid: 'u_text', sceneItemEnabled: false, isGroup: false, sceneItemTransform: {} }] },
    inputs: [
      { inputName: 'Mic', inputUuid: 'u_mic', muted: false, db: -3.04 },
      { inputName: 'Cam', inputUuid: 'u_cam' },   // no audio
    ],
  };
  obs.server = new WebSocket.Server({ port: 0 });
  obs.server.on('connection', (ws) => {
    ws.send(JSON.stringify({ op: 0, d: { rpcVersion: 1, ...(password ? { authentication: auth } : {}) } }));
    ws.on('message', (raw) => {
      const { op, d } = JSON.parse(raw);
      if (op === 1) {
        if (password && d.authentication !== streamApp.obsAuth(password, auth)) return ws.close(4009);
        return ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      }
      const data = d.requestData || {};
      const ok = responseData => ws.send(JSON.stringify({ op: 7, d: { requestId: d.requestId, requestStatus: { result: true, code: 100 }, responseData } }));
      const fail = () => ws.send(JSON.stringify({ op: 7, d: { requestId: d.requestId, requestStatus: { result: false, code: 604, comment: 'no audio' } } }));
      const input = obs.inputs.find(i => i.inputUuid === data.inputUuid);
      switch (d.requestType) {
        case 'GetSceneList': return ok({ currentProgramSceneUuid: obs.current, scenes: obs.scenes.map(({ items, ...s }) => s) });
        case 'GetVideoSettings': return ok({ baseWidth: 1920, baseHeight: 1080 });
        case 'GetInputList': return ok({ inputs: obs.inputs.map(({ inputName, inputUuid }) => ({ inputName, inputUuid })) });
        case 'GetSceneItemList': return ok({ sceneItems: clone(obs.scenes.find(s => s.sceneUuid === data.sceneUuid).items) });
        case 'GetGroupSceneItemList': return ok({ sceneItems: clone(obs.groups[data.sceneUuid]) });
        case 'GetInputMute': return input.db == null ? fail() : ok({ inputMuted: input.muted });
        case 'GetInputVolume': return input.db == null ? fail() : ok({ inputVolumeDb: input.db });
      }
      obs.calls.push([d.requestType, data]);
      ok({});
    });
  });
  obs.port = () => obs.server.address().port;
  return obs;
}

function useApp(app, port, secret) {
  Object.assign(process.env, app === 'obs'
    ? { STREAM_APP: 'obs', OBS_WS_PORT: String(port), OBS_WS_PASSWORD: secret }
    : { STREAM_APP: 'streamlabs', STREAMLABS_PORT: String(port), STREAMLABS_TOKEN: secret });
  streamApp.close();
}

test.after(() => streamApp.close());

test('Streamlabs: a wrong token is refused, the right one reads scenes, items and audio', async (t) => {
  const sl = fakeStreamlabs('tok');
  t.after(() => sl.server.close());
  useApp('streamlabs', sl.port(), 'nope');
  await assert.rejects(streamApp.get(), { messageCode: 'streamAppBadToken' });
  useApp('streamlabs', sl.port(), 'tok');
  const snap = await (await streamApp.get()).read();
  assert.strictEqual(snap.current, 'sc_sing');
  assert.deepStrictEqual(snap.scenes[0].items.map(i => [i.id, i.name, i.visible]), [['i1', 'Webcam', true], ['i2', 'Shared', true]]);   // no folders
  assert.deepStrictEqual(snap.audio.map(a => [a.name, a.muted, a.volume]), [['Mic', false, 80], ['BGM', true, 50]]);
  assert.strictEqual(streamApp.status().connected, true);
  assert.strictEqual(streamApp.status().hasSecret, true);
  assert.ok(!('secret' in streamApp.status()));
});

test('not running: says so', async () => {
  const free = new WebSocket.Server({ port: 0 });
  const port = free.address().port;
  await new Promise(r => free.close(r));
  useApp('streamlabs', port, 'tok');
  await assert.rejects(streamApp.get(), { messageCode: 'streamAppOffline', messageParams: { app: 'Streamlabs Desktop' } });
});

test('a mode saves the scene, the scenes inside it and the audio, and switches back to them', async (t) => {
  const sl = fakeStreamlabs('tok');
  t.after(() => sl.server.close());
  useApp('streamlabs', sl.port(), 'tok');
  const sing = await modes.create({ name: 'Singing', icon: '🎤' });
  assert.deepStrictEqual(sing.scene, { id: 'sc_sing', name: 'Singing' });
  assert.deepStrictEqual(sing.items.map(i => `${i.scene.name}/${i.item.name}:${i.visible}`), ['Singing/Webcam:true', 'Singing/Shared:true', 'Shared/Lyrics:false']);
  assert.deepStrictEqual(sing.audio.map(a => [a.name, a.muted, a.volume]), [['Mic', false, 80], ['BGM', true, 50]]);
  modes.update({ ...sing, holdClips: true, chat: '🎤 Singing time!', tab: 'queue' });

  // Someone changes things by hand, then switches to the mode
  sl.current = 'sc_talk';
  sl.scenes[0].nodes[0].visible = false;
  sl.audio[1].muted = false;
  sl.audio[0].fader.deflection = 0.3;
  const result = await modes.apply(sing.id);
  assert.deepStrictEqual(result.skipped, []);
  assert.deepStrictEqual(result.failed, []);
  assert.strictEqual(result.tab, 'queue');
  assert.deepStrictEqual(sl.calls, [
    ['setVisibility', 'SceneItem[i1]', true],
    ['makeSceneActive', 'ScenesService', 'sc_sing'],
    ['setDeflection', 'AudioSource[mic]', 0.8],
    ['setMuted', 'AudioSource[bgm]', true],
  ]);
  assert.strictEqual(held, true);
  assert.deepStrictEqual(chat, ['🎤 Singing time!']);

  // Nothing changed: nothing is sent; places only move with 📍
  sl.calls.length = 0;
  sl.scenes[0].nodes[0].transform = place(500, 500);
  await modes.apply(sing.id);
  assert.deepStrictEqual(sl.calls, []);
  const fresh = (await modes.view()).modes.find(m => m.id === sing.id);
  modes.update({ ...fresh, items: fresh.items.map(i => ({ ...i, move: i.item.name === 'Webcam' })), chat: '' });
  await modes.apply(sing.id);
  assert.deepStrictEqual(sl.calls, [['setTransform', 'SceneItem[i1]', place(10, 20)]]);
  modes.remove(sing.id);
  assert.strictEqual(held, false);
});

test('renamed, deleted, made again and new things after a mode was saved', async (t) => {
  const sl = fakeStreamlabs('tok');
  t.after(() => sl.server.close());
  useApp('streamlabs', sl.port(), 'tok');
  const mode = await modes.create({ name: 'Talk', icon: '💬' });

  sl.scenes[0].name = 'Singing (new)';                                   // scene renamed: same ID
  sl.scenes[0].nodes[0].name = 'Face cam';                               // source renamed: same ID
  Object.assign(sl.scenes[1].nodes[0], { sceneItemId: 'i9', sourceId: 'lyrics2', resourceId: 'SceneItem[i9]' });   // deleted, made again: same name
  sl.audio = sl.audio.filter(a => a.name !== 'BGM');                     // deleted
  sl.scenes[2].nodes.push({ sceneNodeType: 'item', sceneItemId: 'n1', sourceId: 'new', name: 'New', visible: true, transform: place(0, 0), resourceId: 'SceneItem[n1]' });
  sl.scenes[0].nodes.push({ sceneNodeType: 'item', sceneItemId: 'n2', sourceId: 'alert', name: 'Alert', visible: true, transform: place(0, 0), resourceId: 'SceneItem[n2]' });

  const view = await modes.view();
  const saved = view.modes.find(m => m.id === mode.id);
  assert.deepStrictEqual(view.issues[mode.id].missing, [{ kind: 'audio', name: 'BGM', id: 'bgm' }]);
  assert.deepStrictEqual(view.issues[mode.id].extra, [{ sceneId: 'sc_sing', itemId: 'n2' }]);   // not the Talking scene's: not in this mode
  assert.strictEqual(saved.scene.name, 'Singing (new)');
  assert.strictEqual(saved.items[0].item.name, 'Face cam');
  assert.deepStrictEqual(saved.items[2].item, { id: 'i9', sourceId: 'lyrics2', name: 'Lyrics' });   // takes the new IDs

  sl.scenes[1].nodes[0].visible = true;
  sl.current = 'sc_talk';
  const result = await modes.apply(mode.id);
  assert.deepStrictEqual(result.skipped, ['BGM']);
  assert.deepStrictEqual(sl.calls, [['setVisibility', 'SceneItem[i9]', false], ['makeSceneActive', 'ScenesService', 'sc_sing']]);

  sl.scenes.splice(0, 1);   // the mode's scene deleted: the rest still applies
  sl.calls.length = 0;
  sl.scenes[0].nodes[0].visible = true;
  const r2 = await modes.apply(mode.id);
  assert.deepStrictEqual(r2.skipped, ['Face cam', 'Shared', 'Singing (new)', 'BGM']);
  assert.deepStrictEqual(sl.calls, [['setVisibility', 'SceneItem[i9]', false]]);
  modes.remove(mode.id);
});

test('without a streaming app: this app\'s part still works; the streaming app\'s part says why not', async () => {
  delete process.env.STREAM_APP;
  streamApp.close();
  chat.length = 0;
  const mode = await modes.create({ name: 'Break', icon: '☕' });
  assert.strictEqual(mode.app, null);
  modes.update({ ...mode, chat: 'Back soon', holdClips: false });
  const r = await modes.apply(mode.id);
  assert.strictEqual(r.appError, null);
  assert.deepStrictEqual(chat, ['Back soon']);
  modes.remove(mode.id);
  await assert.rejects(modes.apply('nope'), { messageCode: 'modeNotFound' });
});

test('OBS: password, scenes in OBS order with groups, only inputs with sound, UUIDs', async (t) => {
  const obs = fakeObs('secret');
  t.after(() => obs.server.close());
  useApp('obs', obs.port(), '');
  await assert.rejects(streamApp.get(), { messageCode: 'streamAppNeedPassword' });
  useApp('obs', obs.port(), 'wrong');
  await assert.rejects(streamApp.get(), { messageCode: 'streamAppBadPassword' });
  useApp('obs', obs.port(), 'secret');
  const snap = await (await streamApp.get()).read();
  assert.deepStrictEqual(snap.scenes.map(s => [s.name, !!s.group]), [['Main', false], ['Break', false], ['Group', true]]);
  assert.deepStrictEqual(snap.audio, [{ id: 'u_mic', name: 'Mic', muted: false, volume: -3 }]);
  assert.deepStrictEqual(snap.canvas, { width: 1920, height: 1080 });
  // Read-only sizes and unused bounds are not sent back
  assert.deepStrictEqual(snap.scenes[0].items[0].place, { positionX: 1, positionY: 2, scaleX: 1, scaleY: 1, rotation: 0, boundsType: 'OBS_BOUNDS_NONE' });

  const mode = await modes.create({ name: 'Main', icon: '🎮' });
  assert.deepStrictEqual(mode.items.map(i => `${i.scene.name}/${i.item.name}`), ['Main/Cam', 'Main/Group', 'Group/Text']);
  const m = (await modes.view()).modes.find(x => x.id === mode.id);
  modes.update({ ...m, items: m.items.map(i => ({ ...i, move: i.item.name === 'Cam' })), audio: [{ ...m.audio[0], volume: -10, muted: true }] });
  obs.current = 'u_break';
  obs.groups.u_group[0].sceneItemEnabled = true;
  const r = await modes.apply(mode.id);
  assert.deepStrictEqual(r.failed, []);
  assert.deepStrictEqual(obs.calls, [
    ['SetSceneItemTransform', { sceneUuid: 'u_main', sceneItemId: 1, sceneItemTransform: snap.scenes[0].items[0].place }],
    ['SetSceneItemEnabled', { sceneUuid: 'u_group', sceneItemId: 7, sceneItemEnabled: false }],
    ['SetCurrentProgramScene', { sceneUuid: 'u_main' }],
    ['SetInputMute', { inputUuid: 'u_mic', inputMuted: true }],
    ['SetInputVolume', { inputUuid: 'u_mic', inputVolumeDb: -10 }],
  ]);
  modes.remove(mode.id);
});

test('a mode saved from one streaming app is not applied to the other', async (t) => {
  const sl = fakeStreamlabs('tok');
  const obs = fakeObs('');
  t.after(() => { sl.server.close(); obs.server.close(); });
  useApp('streamlabs', sl.port(), 'tok');
  const mode = await modes.create({ name: 'S', icon: '' });
  useApp('obs', obs.port(), '');
  const r = await modes.apply(mode.id);
  assert.strictEqual(r.appError.code, 'modeOtherApp');
  assert.deepStrictEqual(obs.calls, []);
  assert.strictEqual((await modes.view()).issues[mode.id].otherApp, 'streamlabs');
  modes.remove(mode.id);
});

test('Streamlabs Dual Output: each source has an item per canvas, kept and found apart', async (t) => {
  const sl = fakeStreamlabs('tok');
  t.after(() => sl.server.close());
  const node = (id, display, visible) => ({ sceneNodeType: 'item', sceneItemId: id, sourceId: 'cam', name: 'Webcam', visible, display, transform: place(0, 0), resourceId: `SceneItem[${id}]` });
  sl.scenes = [{ id: 'sc_sing', name: 'Singing', nodes: [node('h1', 'horizontal', true), node('v1', 'vertical', false)] }];
  useApp('streamlabs', sl.port(), 'tok');
  const mode = await modes.create({ name: 'Dual', icon: '' });
  assert.deepStrictEqual(mode.items.map(i => [i.item.id, i.item.display, i.visible]), [['h1', 'horizontal', true], ['v1', 'vertical', false]]);

  // Both deleted and made again: each found on its own canvas, not reported missing
  sl.scenes[0].nodes = [node('v2', 'vertical', true), node('h2', 'horizontal', false)];
  const view = await modes.view();
  assert.deepStrictEqual(view.issues[mode.id], { missing: [], extra: [] });
  const r = await modes.apply(mode.id);
  assert.deepStrictEqual(r.skipped, []);
  assert.deepStrictEqual(sl.calls, [['setVisibility', 'SceneItem[h2]', true], ['setVisibility', 'SceneItem[v2]', false]]);

  // A mode saved before canvases were read: found by ID, then knows its canvas
  const old = view.modes.find(m => m.id === mode.id);
  modes.update({ ...old, items: old.items.map(i => ({ ...i, item: { id: i.item.id, sourceId: i.item.sourceId, name: i.item.name } })) });
  const again = (await modes.view()).modes.find(m => m.id === mode.id);
  assert.deepStrictEqual(again.items.map(i => i.item.display), ['horizontal', 'vertical']);
  modes.remove(mode.id);
});

test('a mode keeps only the audio heard in its scenes, and the devices that are in no scene', async (t) => {
  const sl = fakeStreamlabs('tok');
  t.after(() => sl.server.close());
  sl.scenes[2].nodes.push({ sceneNodeType: 'item', sceneItemId: 'i4', sourceId: 'talkmusic', name: 'Talk music', visible: true, transform: place(0, 0), resourceId: 'SceneItem[i4]' });
  sl.audio.push(
    { sourceId: 'lyrics', name: 'Lyrics', muted: false, fader: { deflection: 1 }, resourceId: 'AudioSource[lyrics]' },
    { sourceId: 'talkmusic', name: 'Talk music', muted: false, fader: { deflection: 1 }, resourceId: 'AudioSource[talkmusic]' },
  );
  useApp('streamlabs', sl.port(), 'tok');
  const sing = await modes.create({ name: 'Singing', icon: '🎤' });
  assert.deepStrictEqual(sing.audio.map(a => a.name), ['Mic', 'BGM', 'Lyrics']);   // Lyrics: in a scene inside Singing
  sl.current = 'sc_talk';
  await modes.recapture(sing.id);
  assert.deepStrictEqual(sing.audio.map(a => a.name), ['Mic', 'BGM', 'Talk music']);   // re-saved: trimmed to Talking's
});
