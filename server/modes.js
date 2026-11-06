// server/modes.js
// The dashboard's modes (e.g. 🎤 singing / 💬 talking / ☕ break): one click sets the streaming app
// (stream-app.js) as it was saved — the scene, which items show, where some of them sit, each audio
// source's mute and volume — and does this app's part: hold clips while singing, post a chat message,
// open a dashboard tab.
//
// A mode is saved from what the streaming app shows (capture): the current scene and the scenes and
// groups inside it, and every audio source. Things are found again by ID, then by name (a source
// deleted and made again keeps its name but not its ID); found by name, the mode takes the new ID.
// Missing ones are skipped and reported; things added later are left alone and listed as `extra`.
// Saved in stream-modes.json.

const fs = require('fs');
const path = require('path');
const streamApp = require('./stream-app');
const mediaQueue = require('./media-queue');
const chatSend = require('./chat-send');
const { UserError, errorBody } = require('./messages');

const FILE = process.env.STREAM_MODES_FILE || path.join(__dirname, '..', 'stream-modes.json');   // tests use a temp file
const TABS = ['', 'queue', 'leihu', 'chat'];
const MAX_MODES = 12;

let data = { modes: [], active: null };
let broadcast = () => {};
let nextId = Date.now();

function load() {
  try { data = { modes: [], active: null, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
}

function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(data, null, 1)); } catch (err) { console.error('[modes] Could not save:', err.message); }
}

// After a restart, a held clip queue stays held while its mode is on
function init(send) {
  broadcast = send;
  load();
  const active = data.modes.find(m => m.id === data.active);
  mediaQueue.setHold(!!(active && active.holdClips));
}

const byId = id => data.modes.find(m => m.id === id);
function mustFind(id) {
  const mode = byId(id);
  if (!mode) throw new UserError('modeNotFound', {}, 'That mode no longer exists.');
  return mode;
}

// ── Finding saved things in what the streaming app shows now ──────────────────

const only = list => list.length === 1 ? list[0] : null;

function findScene(snap, ref) {
  return snap.scenes.find(s => s.id === ref.id) || only(snap.scenes.filter(s => s.name === ref.name));
}

// Not by ID: only among the items on the same canvas (Dual Output has one of each source per canvas)
function findItem(scene, ref) {
  const canvas = scene.items.filter(i => (i.display || null) === (ref.display || null));
  return scene.items.find(i => i.id === ref.id && i.sourceId === ref.sourceId)
    || only(canvas.filter(i => i.sourceId === ref.sourceId))
    || only(canvas.filter(i => i.name === ref.name));
}

// An item as a mode names it
const itemRef = i => ({ id: i.id, sourceId: i.sourceId, name: i.name, ...(i.display ? { display: i.display } : {}) });

function findAudio(snap, ref) {
  return snap.audio.find(a => a.id === ref.id) || only(snap.audio.filter(a => a.name === ref.name));
}

// The scenes a scene shows: itself, and the scenes and groups inside it, however deep
function sceneTree(snap, top) {
  const out = [];
  const visit = (scene) => {
    if (!scene || out.includes(scene)) return;
    out.push(scene);
    for (const item of scene.items) visit(snap.scenes.find(s => s.id === item.sourceId));
  };
  visit(top);
  return out;
}

// Each saved thing next to what it is now (null = missing). Takes new IDs and names into the mode;
// `changed` says whether it should be saved.
function resolve(mode, snap) {
  let changed = false;
  const heal = (ref, now) => {
    for (const [k, v] of Object.entries(now)) if (ref[k] !== v) { ref[k] = v; changed = true; }
  };
  const scene = mode.scene && findScene(snap, mode.scene);
  if (scene) heal(mode.scene, { id: scene.id, name: scene.name });
  const items = mode.items.map((saved) => {
    const inScene = findScene(snap, saved.scene);
    const live = inScene && findItem(inScene, saved.item);
    if (inScene) heal(saved.scene, { id: inScene.id, name: inScene.name });
    if (live) heal(saved.item, itemRef(live));
    return { saved, scene: inScene, live };
  });
  const audio = mode.audio.map((saved) => {
    const live = findAudio(snap, saved);
    if (live) heal(saved, { id: live.id, name: live.name });
    return { saved, live };
  });
  return { scene, items, audio, changed };
}

// What a mode no longer finds, and what's in its scenes but not in it
function check(mode, snap) {
  if (!mode.app) return { missing: [], extra: [] };
  if (mode.app !== snap.app) return { otherApp: mode.app, missing: [], extra: [] };
  const r = resolve(mode, snap);
  const missing = [];
  if (mode.scene && !r.scene) missing.push({ kind: 'scene', name: mode.scene.name });
  for (const i of r.items) if (!i.live) missing.push({ kind: 'item', name: i.saved.item.name, scene: i.saved.scene.name, sceneId: i.saved.scene.id, itemId: i.saved.item.id });
  for (const a of r.audio) if (!a.live) missing.push({ kind: 'audio', name: a.saved.name, id: a.saved.id });
  const known = new Set(r.items.filter(i => i.live).map(i => `${i.scene.id}/${i.live.id}`));
  const scenes = new Set(r.items.map(i => i.scene).filter(Boolean));
  if (r.scene) for (const s of sceneTree(snap, r.scene)) scenes.add(s);
  const extra = [];
  for (const s of scenes) for (const i of s.items) if (!known.has(`${s.id}/${i.id}`)) extra.push({ sceneId: s.id, itemId: i.id });
  const knownAudio = new Set(r.audio.filter(a => a.live).map(a => a.live.id));
  for (const a of snap.audio) if (!knownAudio.has(a.id)) extra.push({ audioId: a.id });
  if (r.changed) save();
  return { missing, extra };
}

// ── Saving modes ──────────────────────────────────────────────────────────────

// The streaming app as it is now, as a mode's scene, items and audio
function capture(snap) {
  const scene = snap.scenes.find(s => s.id === snap.current);
  const items = [];
  for (const s of sceneTree(snap, scene)) {
    // The horizontal canvas's items first, then the vertical one's
    for (const i of [...s.items].sort((a, b) => (a.display === 'vertical') - (b.display === 'vertical'))) {
      items.push({
        scene: { id: s.id, name: s.name }, item: itemRef(i),
        visible: i.visible, place: i.place || null, move: false,
      });
    }
  }
  return {
    app: snap.app, canvas: snap.canvas || null,
    scene: scene ? { id: scene.id, name: scene.name } : null,
    items,
    audio: snap.audio.map(a => ({ id: a.id, name: a.name, muted: a.muted, volume: a.volume })),
  };
}

const text = (v, max) => String(v == null ? '' : v).slice(0, max);
const ref = (r, keys) => r && typeof r === 'object' ? Object.fromEntries(keys.map(k => [k, text(r[k], 200)])) : null;

// A mode as the dashboard sent it, keeping only what a mode has
function clean(m) {
  const plain = v => v && typeof v === 'object' && !Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : null;
  return {
    name: text(m.name, 30).trim() || '?',
    icon: text(m.icon, 8).trim(),
    app: streamApp.APPS[m.app] ? m.app : null,
    canvas: plain(m.canvas),
    scene: m.scene ? ref(m.scene, ['id', 'name']) : null,
    items: (Array.isArray(m.items) ? m.items : []).map(i => ({
      scene: ref(i.scene, ['id', 'name']), item: i.item && itemRef(ref(i.item, ['id', 'sourceId', 'name', 'display'])),
      visible: !!i.visible, place: plain(i.place), move: !!i.move,
    })).filter(i => i.scene && i.item),
    audio: (Array.isArray(m.audio) ? m.audio : []).map(a => ({
      id: text(a.id, 200), name: text(a.name, 200),
      muted: a.muted == null ? null : !!a.muted,
      volume: a.volume == null || !Number.isFinite(Number(a.volume)) ? null : Number(a.volume),
    })),
    chat: text(m.chat, 500).trim(),
    holdClips: !!m.holdClips,
    tab: TABS.includes(m.tab) ? m.tab : '',
  };
}

// A new mode from what the streaming app shows; without one connected, only this app's part
async function create({ name, icon }) {
  if (data.modes.length >= MAX_MODES) throw new UserError('modeTooMany', { max: MAX_MODES }, `At most ${MAX_MODES} modes.`);
  let parts = { app: null, canvas: null, scene: null, items: [], audio: [] };
  if (streamApp.settings().app) parts = capture(await (await streamApp.get()).read());
  const mode = { id: `m${++nextId}`, ...clean({ ...parts, name, icon }) };
  data.modes.push(mode);
  save();
  changed();
  return mode;
}

// Saves the streaming app's current state into a mode again. Its 📍 marks and this app's part stay.
async function recapture(id) {
  const mode = mustFind(id);
  const parts = capture(await (await streamApp.get()).read());
  const moved = new Set(mode.items.filter(i => i.move).map(i => i.item.sourceId));
  for (const i of parts.items) i.move = moved.has(i.item.sourceId);
  Object.assign(mode, parts);
  save();
  changed();
  return mode;
}

function update(m) {
  const mode = mustFind(m && m.id);
  Object.assign(mode, clean(m));
  save();
  changed();
  return mode;
}

function remove(id) {
  mustFind(id);
  data.modes = data.modes.filter(m => m.id !== id);
  if (data.active === id) { data.active = null; mediaQueue.setHold(false); }
  save();
  changed();
}

function reorder(ids) {
  const order = new Map((ids || []).map((id, i) => [id, i]));
  data.modes.sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  save();
  changed();
}

function changed(extra) {
  broadcast({ type: 'modes', active: data.active, held: mediaQueue.isHeld(), ...extra });
}

// ── Switching ─────────────────────────────────────────────────────────────────

// { skipped: [names], failed: [names], appError, chat, tab }. A missing thing never stops the rest.
async function apply(id) {
  const mode = mustFind(id);
  const result = { id, name: mode.name, skipped: [], failed: [], appError: null, chat: null, tab: mode.tab };
  const hasAppPart = mode.app && (mode.scene || mode.items.length || mode.audio.length);
  if (hasAppPart) {
    try {
      const app = await streamApp.get();
      const snap = await app.read();
      if (snap.app !== mode.app) throw new UserError('modeOtherApp', { app: streamApp.APPS[mode.app] }, `This mode was saved from ${streamApp.APPS[mode.app]}.`);
      const r = resolve(mode, snap);
      if (r.changed) save();
      const canvasMoved = mode.canvas && snap.canvas && (mode.canvas.width !== snap.canvas.width || mode.canvas.height !== snap.canvas.height);
      if (canvasMoved && mode.items.some(i => i.move)) result.canvasChanged = true;
      const attempt = async (name, fn) => {
        try { await fn(); } catch (err) { result.failed.push(name); console.error(`[modes] ${mode.name}: ${name}:`, err.message); }
      };
      for (const i of r.items) {
        if (!i.live) { result.skipped.push(i.saved.item.name); continue; }
        if (i.live.visible !== i.saved.visible) await attempt(i.live.name, () => app.setVisible(i.scene, i.live, i.saved.visible));
        if (i.saved.move && i.saved.place && !canvasMoved) await attempt(i.live.name, () => app.setPlace(i.scene, i.live, i.saved.place));
      }
      if (mode.scene && !r.scene) result.skipped.push(mode.scene.name);
      if (r.scene && snap.current !== r.scene.id) await attempt(r.scene.name, () => app.setScene(r.scene));
      for (const a of r.audio) {
        if (!a.live) { result.skipped.push(a.saved.name); continue; }
        const want = {
          muted: a.saved.muted != null && a.saved.muted !== a.live.muted ? a.saved.muted : null,
          volume: a.saved.volume != null && Math.abs(a.saved.volume - a.live.volume) > 0.05 ? a.saved.volume : null,
        };
        if (want.muted != null || want.volume != null) await attempt(a.live.name, () => app.setAudio(a.live, want));
      }
    } catch (err) {
      result.appError = errorBody(err);
    }
  }

  mediaQueue.setHold(mode.holdClips);
  data.active = id;
  save();
  if (mode.chat) {
    try { await chatSend.send(mode.chat); } catch (err) { result.chat = errorBody(err); }
  }
  console.log(`[modes] ${mode.icon} ${mode.name} on${result.skipped.length ? ` (missing: ${result.skipped.join(', ')})` : ''}`);
  changed({ switched: { id, tab: mode.tab } });
  return result;
}

// ── For the dashboard ─────────────────────────────────────────────────────────

// The modes with what each misses, the connection, and (connected) what the streaming app shows now
async function view({ live = true } = {}) {
  const out = { modes: data.modes, active: data.active, held: mediaQueue.isHeld(), connection: streamApp.status(), live: null, issues: {} };
  if (!live || !out.connection.app) return out;
  try {
    const snap = await (await streamApp.get()).read();
    out.live = {
      app: snap.app, current: snap.current, canvas: snap.canvas,
      scenes: snap.scenes.map(s => ({ id: s.id, name: s.name, group: !!s.group, items: s.items.map(({ ref: _, ...i }) => i) })),
      audio: snap.audio.map(({ ref: _, ...a }) => a),
    };
    for (const m of data.modes) out.issues[m.id] = check(m, snap);
  } catch (err) {
    out.connection.error = errorBody(err);
  }
  out.connection = { ...streamApp.status(), error: out.connection.error };
  return out;
}

module.exports = { init, create, recapture, update, remove, reorder, apply, view, capture, resolve, check, clean };
