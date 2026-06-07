// setup.js — web setup wizard logic

const STEPS = [
  'welcome',
  'twitch-app',
  'twitch-auth',
  'rewards',
  'google-creds',
  'song-sheet',
  'history-sheet',
  'obs',
  'done',
];

let currentStep = 0;
let state = {
  clientId: null,
  displayName: null,
  broadcasterId: null,
  serviceEmail: null,
  sheetId: null,
  headers: [],
  preview: [],
  songCol: null,
  artistCol: null,
  keyCol: null,
};

// ── Polling state ─────────────────────────────────────────────────────────────
let devicePollTimer = null;
let deviceTimerInterval = null;

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    const status = await api('GET', '/setup/api/status');
    if (status.displayName) state.displayName = status.displayName;
    if (status.serviceEmail) state.serviceEmail = status.serviceEmail;
    if (status.broadcasterId) state.broadcasterId = status.broadcasterId;

    // Determine starting step based on what's already configured
    if (status.configured.twitch && status.configured.rewards && status.configured.sheets) {
      currentStep = STEPS.indexOf('done');
    } else if (status.configured.twitch && status.configured.rewards) {
      currentStep = STEPS.indexOf('google-creds');
    } else if (status.configured.twitch) {
      currentStep = STEPS.indexOf('rewards');
    }
  } catch (_) {}

  renderStepDots();
  renderStep();
}

// ── Navigation ────────────────────────────────────────────────────────────────
function goNext() {
  const nextStep = currentStep + 1;
  if (nextStep < STEPS.length) {
    currentStep = nextStep;
    renderStepDots();
    renderStep();
  }
}

function goBack() {
  if (currentStep > 0) {
    currentStep--;
    renderStepDots();
    renderStep();
  }
}

function goToStep(name) {
  const idx = STEPS.indexOf(name);
  if (idx >= 0) { currentStep = idx; renderStepDots(); renderStep(); }
}

function renderStepDots() {
  const container = document.getElementById('step-indicator');
  const displaySteps = STEPS.filter(s => s !== 'welcome' && s !== 'done');
  container.innerHTML = displaySteps.map((s, i) => {
    const stepIdx = STEPS.indexOf(s);
    let cls = 'step-dot';
    if (stepIdx < currentStep) cls += ' done';
    else if (stepIdx === currentStep) cls += ' active';
    return `<div class="${cls}" title="${s}"></div>`;
  }).join('');

  const backBtn = document.getElementById('btn-back');
  const nextBtn = document.getElementById('btn-next');
  backBtn.style.display = currentStep > 0 && currentStep < STEPS.length - 1 ? 'block' : 'none';
  nextBtn.style.display = 'none'; // each step controls its own next button
}

// ── Step renderer ─────────────────────────────────────────────────────────────
function renderStep() {
  const stepName = STEPS[currentStep];
  const body = document.getElementById('wizard-body');

  const renderers = {
    'welcome':       renderWelcome,
    'twitch-app':    renderTwitchApp,
    'twitch-auth':   renderTwitchAuth,
    'rewards':       renderRewards,
    'google-creds':  renderGoogleCreds,
    'song-sheet':    renderSongSheet,
    'history-sheet': renderHistorySheet,
    'obs':           renderOBS,
    'done':          renderDone,
  };

  body.innerHTML = '';
  if (renderers[stepName]) renderers[stepName](body);
}

// ── Step 1: Welcome ───────────────────────────────────────────────────────────
function renderWelcome(el) {
  el.innerHTML = `
    <div class="step-title">Welcome! 👋</div>
    <div class="step-subtitle">
      This wizard will set up your VTuber Song Queue system in about 15 minutes.<br>
      Viewers on your Twitch channel will be able to request songs using Channel Points.
    </div>
    <div class="info-box">
      <div class="info-label">What you need</div>
      ✅ A Twitch account (your streaming channel)<br>
      ✅ A Google account (for your song list in Google Sheets)
    </div>
    <div class="info-box green">
      <div class="info-label">What this wizard does</div>
      Connects to your Twitch channel, creates the Channel Points rewards,
      and links your Google Sheets song list — automatically.
    </div>
    <br>
    <button class="btn btn-primary" onclick="goNext()">Let's get started →</button>
  `;
}

// ── Step 2: Twitch App ────────────────────────────────────────────────────────
function renderTwitchApp(el) {
  el.innerHTML = `
    <div class="step-title">Step 1 — Twitch App</div>
    <div class="step-subtitle">
      We need to register a small app on Twitch's developer site.<br>
      Think of it as giving our system a name tag so Twitch knows who's talking to it.
    </div>
    <div class="info-box">
      <div class="info-label">How to get your Client ID</div>
      <ol class="steps-list">
        <li>Go to <a href="https://dev.twitch.tv/console/apps" target="_blank">dev.twitch.tv/console/apps</a></li>
        <li>Click <strong>[Register Your Application]</strong></li>
        <li>Name: anything you like (e.g. <em>Song Queue</em>)</li>
        <li>OAuth Redirect URL: <code>http://localhost</code></li>
        <li>Category: <strong>Other</strong> → click Create</li>
        <li>Click <strong>[Manage]</strong> on your new app</li>
        <li>Copy the <strong>Client ID</strong> shown at the top</li>
      </ol>
    </div>
    <div class="field">
      <label>Client ID</label>
      <input type="text" id="client-id-input" placeholder="e.g. abc123def456ghi789" />
      <div class="hint">This is a public identifier — safe to share. No password needed here.</div>
    </div>
    <div id="client-status" class="status-line"></div>
    <button class="btn btn-primary" onclick="validateClientId()">Verify & Continue →</button>
  `;
}

async function validateClientId() {
  const clientId = document.getElementById('client-id-input').value.trim();
  const status = document.getElementById('client-status');
  if (!clientId) { showStatus(status, 'error', 'Please enter your Client ID'); return; }

  showStatus(status, 'info', '<span class="spinner"></span> Verifying...');
  try {
    await api('POST', '/setup/api/validate-client-id', { clientId });
    state.clientId = clientId;
    showStatus(status, 'ok', '✓ Client ID verified!');
    setTimeout(goNext, 800);
  } catch (err) {
    showStatus(status, 'error', '✗ ' + (err.message || 'Invalid Client ID'));
  }
}

// ── Step 3: Twitch Auth ───────────────────────────────────────────────────────
function renderTwitchAuth(el) {
  el.innerHTML = `
    <div class="step-title">Step 2 — Connect Your Channel</div>
    <div class="step-subtitle">
      We need your permission to create Channel Points rewards on your behalf.<br>
      Click the button below, then enter the code shown at <strong>twitch.tv/activate</strong>.
    </div>
    <div id="auth-start">
      <div class="info-box amber">
        <div class="info-label">Important</div>
        Make sure your browser is signed in to your <strong>broadcaster Twitch account</strong>
        (the channel you stream on) before clicking the button below.
      </div>
      <button class="btn btn-primary" onclick="startDeviceAuth()">Connect Twitch Account →</button>
    </div>
    <div id="auth-waiting" style="display:none">
      <div class="device-code-box">
        <div style="font-size:13px; color:var(--text-dim)">Visit this page in your browser:</div>
        <a class="device-url" href="https://www.twitch.tv/activate" target="_blank">twitch.tv/activate ↗</a>
        <div style="font-size:13px; color:var(--text-dim); margin-top:16px;">Enter this code:</div>
        <div class="device-code" id="device-code-display">----</div>
        <div class="device-timer" id="device-timer">Waiting for authorization...</div>
      </div>
      <div id="auth-status" class="status-line info">
        <span class="spinner"></span> Waiting for you to enter the code at twitch.tv/activate...
      </div>
    </div>
    <div id="auth-done" style="display:none">
      <div class="info-box green">
        <div class="info-label">Connected!</div>
        <div id="auth-name"></div>
      </div>
    </div>
  `;
}

async function startDeviceAuth() {
  document.getElementById('auth-start').style.display = 'none';
  document.getElementById('auth-waiting').style.display = 'block';

  try {
    const res = await api('POST', '/setup/api/start-device-auth');
    document.getElementById('device-code-display').textContent = res.user_code;

    // Countdown timer
    let remaining = res.expires_in;
    const timerEl = document.getElementById('device-timer');
    deviceTimerInterval = setInterval(() => {
      remaining--;
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      timerEl.textContent = `Code expires in ${mins}:${secs.toString().padStart(2,'0')}`;
      if (remaining < 60) timerEl.classList.add('urgent');
      if (remaining <= 0) clearInterval(deviceTimerInterval);
    }, 1000);

    // Poll for authorization
    pollDeviceAuth(res.interval || 5);
  } catch (err) {
    document.getElementById('auth-start').style.display = 'block';
    document.getElementById('auth-waiting').style.display = 'none';
    alert('Error starting auth: ' + err.message);
  }
}

async function pollDeviceAuth(interval) {
  const res = await api('GET', '/setup/api/poll-device-auth');
  if (res.status === 'authorized') {
    clearInterval(deviceTimerInterval);
    state.displayName = res.displayName;
    state.broadcasterId = res.broadcasterId;
    document.getElementById('auth-waiting').style.display = 'none';
    document.getElementById('auth-done').style.display = 'block';
    document.getElementById('auth-name').innerHTML =
      `✓ Connected as <strong style="color:var(--purple)">${res.displayName}</strong>`;
    setTimeout(goNext, 1500);
  } else if (res.status === 'expired') {
    clearInterval(deviceTimerInterval);
    alert('Code expired. Please try again.');
    renderStep();
  } else if (res.status === 'error') {
    clearInterval(deviceTimerInterval);
    alert('Error: ' + res.error);
    renderStep();
  } else {
    // pending — keep polling
    devicePollTimer = setTimeout(() => pollDeviceAuth(interval), interval * 1000);
  }
}

// ── Step 4: Rewards ───────────────────────────────────────────────────────────
let rewardsList = [];
let rewardsDone = { song: false, random: false };

async function renderRewards(el) {
  rewardsDone = { song: false, random: false };
  el.innerHTML = `
    <div class="step-title">Step 3 — Channel Points Rewards</div>
    <div class="step-subtitle">
      Choose which of your existing Channel Points rewards to use for song requests,
      or create new ones.
    </div>
    <div id="rewards-loading" class="status-line info">
      <span class="spinner"></span> Loading your rewards...
    </div>
    <div id="rewards-body" style="display:none">
      <div id="reward-song-section"></div>
      <div id="reward-random-section" style="margin-top:24px"></div>
      <div id="rewards-status" class="status-line" style="margin-top:12px"></div>
    </div>
  `;

  // Small delay to ensure DOM is ready
  await new Promise(r => setTimeout(r, 50));

  const loadingEl = document.getElementById('rewards-loading');
  if (!loadingEl) return; // step was navigated away from

  try {
    const res = await api('GET', '/setup/api/rewards');
    rewardsList = res.rewards || [];
    loadingEl.style.display = 'none';
    document.getElementById('rewards-body').style.display = 'block';
    renderRewardPicker('reward-song-section', 'song', '🎵 Song Request', 'Viewers type a song title when they redeem this.', true);
    renderRewardPicker('reward-random-section', 'random', '🎲 Random Song', 'Picks a random song from your list automatically.', false);
  } catch (err) {
    console.error('[rewards] Error:', err);
    if (!loadingEl) return;
    loadingEl.className = 'status-line error';
    loadingEl.innerHTML = `✗ Could not load rewards: ${err.message}<br>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="renderRewards(document.getElementById('wizard-body'))">Retry</button>`;
  }
}

function renderRewardPicker(containerId, type, label, hint, requiresText) {
  const container = document.getElementById(containerId);
  const listHtml = rewardsList.length > 0
    ? `<div class="reward-list" id="reward-list-${type}">
        ${rewardsList.map((r, i) => `
          <div class="reward-option" onclick="pickReward('${type}', ${i})" id="reward-opt-${type}-${i}">
            <div class="reward-opt-tag">${r.is_user_input_required ? '[text input]' : '[no text]'}</div>
            <div class="reward-opt-name">${esc(r.title)}</div>
            <div class="reward-opt-cost">${r.cost} pts</div>
          </div>`).join('')}
        <div class="reward-option reward-option-new" onclick="showCreateForm('${type}')">
          <div class="reward-opt-tag">[new]</div>
          <div class="reward-opt-name">Create a new reward...</div>
          <div class="reward-opt-cost"></div>
        </div>
      </div>`
    : `<div class="info-box amber"><div class="info-label">No rewards found</div>Channel may not be Affiliate yet, or try refreshing.</div>`;

  container.innerHTML = `
    <div style="font-size:11px; letter-spacing:2px; color:var(--text-dim); margin-bottom:8px; text-transform:uppercase">${label}</div>
    <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px">${hint}</div>
    ${listHtml}
    <div id="create-form-${type}" style="display:none; margin-top:12px">
      <div class="field" style="margin-bottom:10px">
        <label>Reward name</label>
        <input type="text" id="new-name-${type}" placeholder="e.g. Song Request" />
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>Point cost</label>
        <input type="number" id="new-cost-${type}" value="${requiresText ? 500 : 300}" min="1" />
      </div>
      <button class="btn btn-primary" style="font-size:11px; padding:6px 14px" onclick="createNewReward('${type}', ${requiresText})">Create →</button>
      <button class="btn btn-ghost" style="margin-left:8px" onclick="hideCreateForm('${type}')">Cancel</button>
    </div>
    <div id="reward-done-${type}" style="display:none" class="status-line ok"></div>
  `;
}

async function pickReward(type, idx) {
  const reward = rewardsList[idx];
  // Highlight selection
  document.querySelectorAll(`#reward-list-${type} .reward-option`).forEach(el => el.classList.remove('selected'));
  document.getElementById(`reward-opt-${type}-${idx}`).classList.add('selected');

  try {
    await api('POST', '/setup/api/create-rewards', { mode: 'pick', rewardType: type, rewardId: reward.id });
    document.getElementById(`reward-list-${type}`).style.display = 'none';
    const doneEl = document.getElementById(`reward-done-${type}`);
    doneEl.style.display = 'block';
    doneEl.innerHTML = `✓ Using: ${esc(reward.title)}`;
    rewardsDone[type] = true;
    checkRewardsDone();
  } catch (err) {
    showStatus(document.getElementById('rewards-status'), 'error', '✗ ' + err.message);
  }
}

function showCreateForm(type) {
  document.getElementById(`create-form-${type}`).style.display = 'block';
}
function hideCreateForm(type) {
  document.getElementById(`create-form-${type}`).style.display = 'none';
}

async function createNewReward(type, requiresText) {
  const title = document.getElementById(`new-name-${type}`).value.trim();
  const cost = parseInt(document.getElementById(`new-cost-${type}`).value) || 500;
  const status = document.getElementById('rewards-status');
  if (!title) { showStatus(status, 'error', 'Please enter a reward name'); return; }

  showStatus(status, 'info', '<span class="spinner"></span> Creating reward...');
  try {
    const res = await api('POST', '/setup/api/create-rewards', { mode: 'create', rewardType: type, title, cost, requiresText });
    document.getElementById(`create-form-${type}`).style.display = 'none';
    document.getElementById(`reward-list-${type}`).style.display = 'none';
    const doneEl = document.getElementById(`reward-done-${type}`);
    doneEl.style.display = 'block';
    doneEl.innerHTML = `✓ Created: ${esc(res.title || title)}`;
    rewardsDone[type] = true;
    showStatus(status, 'ok', '');
    checkRewardsDone();
  } catch (err) {
    showStatus(status, 'error', '✗ ' + err.message);
  }
}

function checkRewardsDone() {
  if (rewardsDone.song && rewardsDone.random) {
    setTimeout(goNext, 800);
  }
}

// ── Step 5: Google Credentials ────────────────────────────────────────────────
function renderGoogleCreds(el) {
  el.innerHTML = `
    <div class="step-title">Step 4 — Google Account Access</div>
    <div class="step-subtitle">
      Your song list lives in Google Sheets. We need a <em>service account</em> — a special
      helper account for programs, not people — to read your sheet.<br>
      <span style="color:var(--text-dim)">Think of it as giving a trusted robot a library card.</span>
    </div>
    <div class="info-box">
      <div class="info-label">Create a service account (one-time setup)</div>
      <ol class="steps-list">
        <li>Go to <a href="https://console.cloud.google.com" target="_blank">console.cloud.google.com</a></li>
        <li>Click the project dropdown (top left) → <strong>New Project</strong> → name it anything → Create</li>
        <li>Search for <strong>Google Sheets API</strong> at the top → click Enable</li>
        <li>Left menu → <strong>IAM & Admin → Service Accounts → + Create Service Account</strong></li>
        <li>Name it anything (e.g. <em>song-queue</em>) → click Done</li>
        <li>Click the new service account → <strong>Keys tab → Add Key → Create new key → JSON</strong></li>
        <li>A file downloads — drag it into the box below</li>
      </ol>
    </div>
    <div class="upload-area" id="upload-area" onclick="document.getElementById('creds-file').click()"
         ondragover="event.preventDefault(); this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="handleCredsDrop(event)">
      <input type="file" id="creds-file" accept=".json" onchange="handleCredsFile(this.files[0])">
      <div class="upload-icon">📄</div>
      <div class="upload-text">Drop your <strong>google-credentials.json</strong> here<br>or <span>click to browse</span></div>
    </div>
    <div id="creds-status" class="status-line"></div>
  `;
}

function handleCredsDrop(e) {
  e.preventDefault();
  document.getElementById('upload-area').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleCredsFile(file);
}

async function handleCredsFile(file) {
  const status = document.getElementById('creds-status');
  if (!file) return;
  if (!file.name.endsWith('.json')) {
    showStatus(status, 'error', '✗ Wrong file type — please upload the .json file downloaded from Google Cloud Console');
    return;
  }
  showStatus(status, 'info', '<span class="spinner"></span> Reading file...');
  let json;
  try {
    const text = await file.text();
    json = JSON.parse(text);
  } catch (err) {
    showStatus(status, 'error', '✗ This does not look like a valid JSON file. Make sure you downloaded the key as JSON from Google Cloud Console → Service Accounts → Keys → Add Key → JSON.');
    return;
  }
  if (json.type !== 'service_account') {
    showStatus(status, 'error', '✗ This JSON file is not a service account key. Go to Google Cloud Console → IAM & Admin → Service Accounts → click your account → Keys → Add Key → Create new key → JSON.');
    return;
  }
  showStatus(status, 'info', '<span class="spinner"></span> Uploading...');
  try {
    const res = await api('POST', '/setup/api/upload-credentials', json);
    state.serviceEmail = res.clientEmail;
    document.getElementById('upload-area').innerHTML =
      `<div class="upload-icon">✅</div><div class="upload-text">Uploaded successfully!<br><span style="color:var(--green)">${res.clientEmail}</span></div>`;
    showStatus(status, 'ok', '✓ Service account connected');
    setTimeout(goNext, 1000);
  } catch (err) {
    showStatus(status, 'error', '✗ ' + (err.message || 'Upload failed'));
  }
}

// ── Step 6: Song Sheet ────────────────────────────────────────────────────────
function renderSongSheet(el) {
  el.innerHTML = `
    <div class="step-title">Step 5 — Your Song List</div>
    <div class="step-subtitle">
      Paste the URL of your Google Sheet song list below.<br>
      <span style="color:var(--text-dim)">We'll automatically read it to identify the columns.</span>
    </div>
    ${state.serviceEmail ? `
      <div class="info-box green">
        <div class="info-label">Important — share your sheet</div>
        Before continuing, open your sheet → click <strong>Share</strong> → paste this email → set to <strong>Viewer</strong>:<br>
        <div style="margin-top:8px; display:flex; align-items:center; gap:8px;">
          <code style="color:var(--green); flex:1;">${state.serviceEmail}</code>
          <button class="copy-btn" onclick="copyText('${state.serviceEmail}', this)">Copy</button>
        </div>
      </div>` : ''}
    <div class="field">
      <label>Google Sheet URL</label>
      <input type="url" id="sheet-url" placeholder="https://docs.google.com/spreadsheets/d/..." />
      <div class="hint">Paste the full URL from your browser's address bar.</div>
    </div>
    <div id="sheet-status" class="status-line"></div>
    <button class="btn btn-primary" onclick="validateSheet()">Load Sheet →</button>
    <div id="column-picker" style="display:none; margin-top:24px;">
      <div class="step-subtitle" style="margin-bottom:12px;">
        Click the column headers to identify each one:
      </div>
      <div class="column-legend">
        <div class="legend-item"><div class="legend-dot" style="background:var(--purple)"></div> Song Title (required)</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--blue)"></div> Artist Name (required)</div>
        <div class="legend-item"><div class="legend-dot" style="background:var(--green)"></div> Key / Transpose (optional)</div>
      </div>
      <table class="column-table" id="col-table"></table>
      <div id="col-status" class="status-line"></div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="saveColumns()">Confirm Columns →</button>
    </div>
  `;
}

async function validateSheet() {
  const url = document.getElementById('sheet-url').value.trim();
  const status = document.getElementById('sheet-status');
  if (!url) { showStatus(status, 'error', 'Please paste your sheet URL'); return; }
  showStatus(status, 'info', '<span class="spinner"></span> Connecting to sheet...');
  try {
    const res = await api('POST', '/setup/api/validate-sheet', { sheetUrl: url });
    state.sheetId = res.sheetId;
    state.headers = res.headers;
    state.preview = res.preview;
    showStatus(status, 'ok', `✓ Sheet found — ${res.headers.length} columns detected`);
    renderColumnPicker();
    document.getElementById('column-picker').style.display = 'block';
  } catch (err) {
    showStatus(status, 'error', '✗ ' + err.message);
  }
}

function renderColumnPicker() {
  const table = document.getElementById('col-table');
  const headers = state.headers;
  const preview = state.preview;

  // Header row — clickable
  const headerRow = headers.map((h, i) =>
    `<th data-idx="${i}" onclick="selectColumn(${i})">${h || '(empty)'}</th>`
  ).join('');

  // Preview rows
  const previewRows = preview.map(row =>
    '<tr>' + headers.map((_, i) =>
      `<td>${row[i] || ''}</td>`
    ).join('') + '</tr>'
  ).join('');

  table.innerHTML = `<thead><tr>${headerRow}</tr></thead><tbody>${previewRows}</tbody>`;
}

let colClickState = 0; // 0=song, 1=artist, 2=key
function selectColumn(idx) {
  const header = state.headers[idx];
  const types = ['song', 'artist', 'key'];
  const classes = ['selected-song', 'selected-artist', 'selected-key'];
  const labels = ['Song Title', 'Artist Name', 'Key (optional)'];
  const type = types[colClickState];
  const cls = classes[colClickState];

  // Remove existing selection for this type
  document.querySelectorAll(`th.${cls}`).forEach(th => th.classList.remove(cls));

  // Apply selection
  const th = document.querySelector(`th[data-idx="${idx}"]`);
  th.classList.add(cls);
  th.textContent = `${state.headers[idx]} ← ${labels[colClickState]}`;

  state[`${type}Col`] = header;

  const status = document.getElementById('col-status');
  const selected = [state.songCol, state.artistCol].filter(Boolean).length;

  if (colClickState < 2) {
    colClickState++;
    if (colClickState === 2) {
      showStatus(status, 'info', 'Click the key/transpose column (optional) or click Confirm Columns to skip');
    }
  }
  if (selected >= 2) {
    showStatus(status, 'ok', `✓ Song: "${state.songCol}", Artist: "${state.artistCol}"${state.keyCol ? `, Key: "${state.keyCol}"` : ''}`);
  }
}

async function saveColumns() {
  const status = document.getElementById('col-status');
  if (!state.songCol || !state.artistCol) {
    showStatus(status, 'error', 'Please select at least the Song Title and Artist Name columns');
    return;
  }
  try {
    await api('POST', '/setup/api/save-columns', {
      sheetId: state.sheetId,
      songColumn: state.songCol,
      artistColumn: state.artistCol,
      keyColumn: state.keyCol || '',
    });
    showStatus(status, 'ok', '✓ Columns saved!');
    setTimeout(goNext, 800);
  } catch (err) {
    showStatus(status, 'error', '✗ ' + err.message);
  }
}

// ── Step 7: History Sheet ─────────────────────────────────────────────────────
function renderHistorySheet(el) {
  el.innerHTML = `
    <div class="step-title">Step 6 — Request History <span style="color:var(--text-dim);font-size:13px">(optional)</span></div>
    <div class="step-subtitle">
      We can track how many times each song gets requested and who requested it — across all your streams.
      This is completely optional.
    </div>
    ${state.serviceEmail ? `
      <div class="info-box">
        <div class="info-label">To set this up</div>
        <ol class="steps-list">
          <li>Go to <a href="https://sheets.new" target="_blank">sheets.new</a> to create a blank sheet</li>
          <li>Click <strong>Share</strong> → paste this email → set to <strong>Editor</strong>:<br>
            <div style="margin-top:6px; display:flex; align-items:center; gap:8px;">
              <code style="color:var(--green); flex:1;">${state.serviceEmail}</code>
              <button class="copy-btn" onclick="copyText('${state.serviceEmail}', this)">Copy</button>
            </div>
          </li>
          <li>Paste the sheet URL below</li>
        </ol>
      </div>` : ''}
    <div class="field">
      <label>History Sheet URL (optional)</label>
      <input type="url" id="history-url" placeholder="https://docs.google.com/spreadsheets/d/..." />
    </div>
    <div id="history-status" class="status-line"></div>
    <div style="display:flex; gap:12px; flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="saveHistory()">Save & Continue →</button>
      <button class="btn btn-ghost" onclick="skipHistory()">Skip for now</button>
    </div>
  `;
}

async function saveHistory() {
  const url = document.getElementById('history-url').value.trim();
  const status = document.getElementById('history-status');
  if (!url) { skipHistory(); return; }
  showStatus(status, 'info', '<span class="spinner"></span> Connecting...');
  try {
    await api('POST', '/setup/api/validate-sheet', { sheetUrl: url, historyMode: true });
    showStatus(status, 'ok', '✓ History sheet connected!');
    setTimeout(goNext, 800);
  } catch (err) {
    showStatus(status, 'error', '✗ ' + err.message);
  }
}

function skipHistory() {
  api('POST', '/setup/api/save-history', { sheetId: '' }).catch(() => {});
  goNext();
}

// ── Step 8: OBS ───────────────────────────────────────────────────────────────
function renderOBS(el) {
  const overlayUrl = `${location.origin}/overlay/index.html`;
  const css = `body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }`;

  el.innerHTML = `
    <div class="step-title">Step 7 — Add to OBS</div>
    <div class="step-subtitle">
      Add the song queue overlay to your streaming software.
      It will update automatically whenever a song is requested.
    </div>
    <div class="tabs">
      <div class="tab active" onclick="switchTab('obs-tab', this)">OBS Studio</div>
      <div class="tab" onclick="switchTab('streamlabs-tab', this)">Streamlabs</div>
    </div>
    <div class="tab-content active" id="obs-tab">
      <ol class="steps-list" style="margin-bottom:16px">
        <li>In OBS, click <strong>+</strong> under Sources → <strong>Browser</strong></li>
        <li>Paste this URL:
          <div class="code-block"><span>${overlayUrl}</span><button class="copy-btn" onclick="copyText('${overlayUrl}', this)">Copy</button></div>
        </li>
        <li>Width: <code>960</code> — Height: <code>800</code></li>
        <li>Paste this into <strong>Custom CSS</strong>:
          <div class="code-block"><span>${css}</span><button class="copy-btn" onclick="copyText(\`${css}\`, this)">Copy</button></div>
        </li>
        <li>Uncheck <strong>"Shutdown source when not visible"</strong></li>
      </ol>
    </div>
    <div class="tab-content" id="streamlabs-tab">
      <ol class="steps-list" style="margin-bottom:16px">
        <li>In Streamlabs, add a new source → <strong>Browser Source</strong></li>
        <li>Paste this URL:
          <div class="code-block"><span>${overlayUrl}</span><button class="copy-btn" onclick="copyText('${overlayUrl}', this)">Copy</button></div>
        </li>
        <li>Width: <code>960</code> — Height: <code>800</code></li>
        <li>Paste this into <strong>Custom CSS</strong>:
          <div class="code-block"><span>${css}</span><button class="copy-btn" onclick="copyText(\`${css}\`, this)">Copy</button></div>
        </li>
      </ol>
    </div>
    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
      <button class="btn btn-primary" onclick="goNext()">All done! →</button>
      <button class="btn btn-ghost" onclick="window.open('${overlayUrl}', '_blank')">Preview overlay</button>
    </div>
  `;
}

function switchTab(tabId, clickedTab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  clickedTab.classList.add('active');
}

// ── Step 9: Done ──────────────────────────────────────────────────────────────
function renderDone(el) {
  el.innerHTML = `
    <div class="done-icon">🎉</div>
    <div class="step-title" style="text-align:center">You're all set!</div>
    <div class="step-subtitle" style="text-align:center; margin-bottom:24px">
      Your song queue system is ready. Here's what was configured:
    </div>
    <div class="summary-grid">
      <div class="summary-item">
        <span class="check">✓</span>
        <span class="label">Twitch account</span>
        <span class="value">${state.displayName || 'Connected'}</span>
      </div>
      <div class="summary-item">
        <span class="check">✓</span>
        <span class="label">Channel Points rewards</span>
        <span class="value">點歌券 + 隨機點歌券</span>
      </div>
      <div class="summary-item">
        <span class="check">✓</span>
        <span class="label">Song list sheet</span>
        <span class="value">${state.songCol || 'Configured'}</span>
      </div>
    </div>
    <div class="info-box green">
      <div class="info-label">Every stream</div>
      Just run <code>npm start</code> (or <code>start.ps1</code>) and you're live.
      No other setup needed — ever again.
    </div>
    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:20px;">
      <a class="btn btn-green" href="/dashboard">Open Dashboard →</a>
      <button class="btn btn-ghost" onclick="goToStep('twitch-app')">Re-run setup</button>
    </div>
  `;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showStatus(el, type, html) {
  el.className = `status-line ${type}`;
  el.innerHTML = html;
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
