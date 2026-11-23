// server/sing-check.js
// A reminder for singing in the wrong mode: Leihu Singsing plays a song (leihu.js reads its player
// every 5 s) while the mode on is not one ticked "🎤 For singing" (modes.js) — e.g. the BGM of a
// talking mode still on under the song. The dashboard shows a banner with a button for each singing
// mode; nothing on stream changes until one is clicked. No singing mode at all = no reminder.

let send = () => {};
let playback = { playing: false, sid: null, title: '' };
let modeInfo = { active: null, modes: [] };
let last = '';

// A mode counts as for singing when ticked; modes saved before the tick existed: when it holds clips
const isSingMode = m => !!m && (m.sing == null ? !!m.holdClips : !!m.sing);

function state() {
  const sing = modeInfo.modes.filter(isSingMode).map(m => ({ id: m.id, name: m.name, icon: m.icon }));
  const active = modeInfo.modes.find(m => m.id === modeInfo.active) || null;
  const wrong = playback.playing && sing.length > 0 && !isSingMode(active);
  return wrong
    ? { wrong, sid: playback.sid, title: playback.title, active: active && { name: active.name, icon: active.icon }, sing }
    : { wrong: false };
}

function changed() {
  const s = state();
  const key = JSON.stringify(s);
  if (key === last) return;
  last = key;
  if (s.wrong) console.log(`[sing-check] Leihu is playing "${s.title}" in ${s.active ? `${s.active.icon} ${s.active.name}` : 'no mode'}, not a singing mode`);
  send({ type: 'sing-check', ...s });
}

function init(fn) { send = fn; }

// From leihu.js: what Leihu's player is doing (not playing while Leihu can't be reached)
function setPlayback(p) {
  playback = { playing: !!(p && p.playing), sid: (p && p.sid) || null, title: String((p && p.title) || '') };
  changed();
}

// From modes.js: the modes and the one on
function setModes(active, modes) {
  modeInfo = { active: active || null, modes: Array.isArray(modes) ? modes : [] };
  changed();
}

module.exports = { init, setPlayback, setModes, state, isSingMode };
