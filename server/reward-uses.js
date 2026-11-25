// server/reward-uses.js
// What each channel-point reward is for (the 🎟️ Rewards tab): one main use — 🎤 song request
// (TWITCH_REWARD_ID, exactly one), 🎲 random song (TWITCH_RANDOM_REWARDS, each with the sheet tabs it
// draws from), 👕 outfit (OUTFIT_REWARDS) or 🎭 情境點歌 (MOOD_REWARDS, mood.js) — or none. A 🎟️ reward effect (reward-effects.js) can be
// added to any reward, with a main use or without. The main use alone marks a redemption done or
// refunds it; without one, the effect does.
//
// There's always a song-request reward (index.js treats the app as not set up without one), so it
// can't be set to none: choosing 🎤 for another reward moves it.

const { UserError } = require('./messages');
const songTabs = require('./song-tabs');

const USES = ['', 'song', 'random', 'outfit', 'mood'];

const randomList = (env) => { try { const l = JSON.parse(env.TWITCH_RANDOM_REWARDS || '[]'); return Array.isArray(l) ? l : []; } catch { return []; } };
const idList = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean);
const outfitList = (env) => idList(env.OUTFIT_REWARDS);
const moodList = (env) => idList(env.MOOD_REWARDS);

// '' | 'song' | 'random' | 'outfit' | 'mood'
function useOf(id, env = process.env) {
  if (!id) return '';
  if (id === env.TWITCH_REWARD_ID) return 'song';
  if (randomList(env).some(r => r.id === id)) return 'random';
  if (outfitList(env).includes(id)) return 'outfit';
  if (moodList(env).includes(id)) return 'mood';
  return '';
}

// The sheet tabs a 🎤 reward takes requests from or a 🎲 reward draws from ([] = all but the practice tab)
function tabsOf(id, env = process.env) {
  if (id && id === env.TWITCH_REWARD_ID) return songTabs.requestTabs(env);
  const r = randomList(env).find(x => x.id === id);
  return r ? (r.tabs || []) : [];
}

// → the .env values to write so reward `id` (named `title`) has main use `use` (and, for 🎲, `tabs`).
// Taken out of whatever else it was; 🎤 replaces the old song-request reward.
function change(id, title, use, tabs, env = process.env) {
  if (!/^[\w-]{1,100}$/.test(String(id || ''))) throw new UserError('rewardUseBad', {}, 'id is missing');
  if (!USES.includes(use)) throw new UserError('rewardUseBad', {}, `use must be one of ${USES.filter(Boolean).join(', ')} or empty`);
  const was = useOf(id, env);
  if (was === 'song' && use !== 'song') throw new UserError('rewardSongNeeded', {}, 'There must be a song-request reward: choose 🎤 for another reward instead');
  const values = {};
  if (use === 'song' && was !== 'song') values.TWITCH_REWARD_ID = id;
  if (use === 'song' && Array.isArray(tabs)) values.TWITCH_REWARD_TABS = JSON.stringify(songTabs.cleanTabs(tabs));

  let random = randomList(env);
  const hadRandom = random.some(r => r.id === id);
  if (use === 'random') {
    const clean = Array.isArray(tabs) ? songTabs.cleanTabs(tabs) : tabsOf(id, env);
    const entry = { id, name: String(title || '').slice(0, 60), tabs: clean };
    random = hadRandom ? random.map(r => r.id === id ? { ...r, ...entry, name: entry.name || r.name } : r) : [...random, entry];
    values.TWITCH_RANDOM_REWARDS = JSON.stringify(random);
  } else if (hadRandom) {
    values.TWITCH_RANDOM_REWARDS = JSON.stringify(random.filter(r => r.id !== id));
  }

  const outfit = outfitList(env);
  if (use === 'outfit' && !outfit.includes(id)) values.OUTFIT_REWARDS = [...outfit, id].join(',');
  else if (use !== 'outfit' && outfit.includes(id)) values.OUTFIT_REWARDS = outfit.filter(x => x !== id).join(',');

  const mood = moodList(env);
  if (use === 'mood' && !mood.includes(id)) values.MOOD_REWARDS = [...mood, id].join(',');
  else if (use !== 'mood' && mood.includes(id)) values.MOOD_REWARDS = mood.filter(x => x !== id).join(',');
  return values;
}

// A taken-over reward's copy (redemptions.js) keeps its uses: → the .env values that point to `newId`
function moved(oldId, newId, env = process.env) {
  const values = {};
  if (env.TWITCH_REWARD_ID === oldId) values.TWITCH_REWARD_ID = newId;
  const random = randomList(env);
  if (random.some(r => r.id === oldId)) values.TWITCH_RANDOM_REWARDS = JSON.stringify(random.map(r => r.id === oldId ? { ...r, id: newId } : r));
  const outfit = outfitList(env);
  if (outfit.includes(oldId)) values.OUTFIT_REWARDS = outfit.map(x => x === oldId ? newId : x).join(',');
  const mood = moodList(env);
  if (mood.includes(oldId)) values.MOOD_REWARDS = mood.map(x => x === oldId ? newId : x).join(',');
  return values;
}

module.exports = { USES, useOf, tabsOf, change, moved };
