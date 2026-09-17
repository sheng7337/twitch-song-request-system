// server/sponsor-voice.js
// Generates clip-player/sponsor-voice.{wav|mp3} on first run.
// Priority: VoiceVox (local, high-quality) → Google TTS (online fallback).

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const DIR  = path.join(__dirname, '..', 'clip-player');
const WAV  = path.join(DIR, 'sponsor-voice.wav');
const MP3  = path.join(DIR, 'sponsor-voice.mp3');
const TEXT = 'この番組は　ご覧のスポンサーの提供でお送りします。';

// VoiceVox: speaker 8 = Shikoku Metan (normal), 3 = Zundamon (normal)
// Any ja voice works — change SPEAKER_ID if the user prefers another
const VOICEVOX_SPEAKER = 8;

async function tryVoiceVox() {
  const base = 'http://localhost:50021';
  const { data: query } = await axios.post(
    `${base}/audio_query?text=${encodeURIComponent(TEXT)}&speaker=${VOICEVOX_SPEAKER}`,
    null, { timeout: 5000 }
  );
  query.speedScale = 0.9;
  const { data: wav } = await axios.post(
    `${base}/synthesis?speaker=${VOICEVOX_SPEAKER}`,
    query,
    { responseType: 'arraybuffer', timeout: 15000 }
  );
  fs.writeFileSync(WAV, Buffer.from(wav));
  console.log('[sponsor-voice] Generated via VoiceVox →', WAV);
}

async function tryGoogleTTS() {
  const url = 'https://translate.google.com/translate_tts'
    + `?ie=UTF-8&tl=ja&client=tw-ob&ttsspeed=0.85`
    + `&q=${encodeURIComponent(TEXT)}`;
  const { data } = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000,
  });
  fs.writeFileSync(MP3, Buffer.from(data));
  console.log('[sponsor-voice] Generated via Google TTS →', MP3);
}

async function generateIfMissing() {
  if (fs.existsSync(WAV) || fs.existsSync(MP3)) return;

  try {
    await tryVoiceVox();
    return;
  } catch (_) {
    // VoiceVox not running — try online fallback
  }

  try {
    await tryGoogleTTS();
  } catch (err) {
    console.warn('[sponsor-voice] Could not generate sponsor voice:', err.message);
    console.warn('[sponsor-voice] Drop your own sponsor-voice.wav into clip-player/ to fix this.');
  }
}

module.exports = { generateIfMissing };
