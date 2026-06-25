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
  activeColType: 'song', // which field a column-header click currently assigns: song | artist | key
};

// ── Polling state ─────────────────────────────────────────────────────────────
let devicePollTimer = null;
let deviceTimerInterval = null;

// ── Language switcher ─────────────────────────────────────────────────────────
function renderLangSwitch() {
  const el = document.getElementById('lang-switch');
  if (!el) return;
  const lang = getLang();
  el.innerHTML = `
    <button class="lang-btn ${lang === 'en' ? 'active' : ''}" onclick="setLang('en')">EN</button>
    <button class="lang-btn ${lang === 'zh-TW' ? 'active' : ''}" onclick="setLang('zh-TW')">中文</button>
  `;
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  document.documentElement.lang = getLang();
  document.title = T().title;
  document.getElementById('logo').textContent = T().logo;
  renderLangSwitch();

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
    } else if (status.clientId) {
      // Twitch app already registered (Client ID known) but the user
      // authorization expired/was revoked — this happens when the refresh
      // token gets rejected. No need to re-enter the Client ID or redo
      // rewards/sheets — just re-authorize.
      state.clientId = status.clientId;
      currentStep = STEPS.indexOf('twitch-auth');
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
  backBtn.textContent = T().back;
  nextBtn.textContent = T().next;
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
  const t = T().welcome;
  el.innerHTML = `
    <div class="step-title">${t.title}</div>
    <div class="step-subtitle">${t.subtitle}</div>
    <div class="info-box">
      <div class="info-label">${t.needTitle}</div>
      ${t.need1}<br>
      ${t.need2}
    </div>
    <div class="info-box green">
      <div class="info-label">${t.doesTitle}</div>
      ${t.doesBody}
    </div>
    <br>
    <button class="btn btn-primary" onclick="goNext()">${t.cta}</button>
  `;
}

// ── Step 2: Twitch App ────────────────────────────────────────────────────────
function renderTwitchApp(el) {
  const t = T().twitchApp;
  el.innerHTML = `
    <div class="step-title">${t.title}</div>
    <div class="step-subtitle">${t.subtitle}</div>
    <div class="info-box">
      <div class="info-label">${t.howToTitle}</div>
      <ol class="steps-list">
        ${t.steps.map(s => `<li>${s}</li>`).join('')}
      </ol>
    </div>
    <div class="field">
      <label>${t.fieldLabel}</label>
      <input type="text" id="client-id-input" placeholder="${t.placeholder}" />
      <div class="hint">${t.hint}</div>
    </div>
    <div id="client-status" class="status-line"></div>
    <button class="btn btn-primary" onclick="validateClientId()">${t.verifyBtn}</button>
  `;
}

async function validateClientId() {
  const t = T().twitchApp;
  const clientId = document.getElementById('client-id-input').value.trim();
  const status = document.getElementById('client-status');
  if (!clientId) { showStatus(status, 'error', t.errEmpty); return; }

  showStatus(status, 'info', t.verifying);
  try {
    await api('POST', '/setup/api/validate-client-id', { clientId });
    state.clientId = clientId;
    showStatus(status, 'ok', t.verified);
    setTimeout(goNext, 800);
  } catch (err) {
    showStatus(status, 'error', '✗ ' + (err.message || t.errInvalid));
  }
}

// ── Step 3: Twitch Auth ───────────────────────────────────────────────────────
function renderTwitchAuth(el) {
  const t = T().twitchAuth;
  el.innerHTML = `
    <div class="step-title">${t.title}</div>
    <div class="step-subtitle">${t.subtitle}</div>
    <div id="auth-start">
      <div class="info-box amber">
        <div class="info-label">${t.importantTitle}</div>
        ${t.importantBody}
      </div>
      <button class="btn btn-primary" onclick="startDeviceAuth()">${t.connectBtn}</button>
    </div>
    <div id="auth-waiting" style="display:none">
      <div class="device-code-box">
        <div style="font-size:13px; color:var(--text-dim)">${t.visitPage}</div>
        <a class="device-url" href="https://www.twitch.tv/activate" target="_blank">twitch.tv/activate ↗</a>
        <div style="font-size:13px; color:var(--text-dim); margin-top:16px;">${t.enterCode}</div>
        <div class="device-code" id="device-code-display">----</div>
        <div class="device-timer" id="device-timer">${t.waitingForAuth}</div>
      </div>
      <div id="auth-status" class="status-line info">
        ${t.waitingStatus}
      </div>
    </div>
    <div id="auth-done" style="display:none">
      <div class="info-box green">
        <div class="info-label">${t.connectedTitle}</div>
        <div id="auth-name"></div>
      </div>
    </div>
  `;
}

async function startDeviceAuth() {
  const t = T().twitchAuth;
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
      timerEl.textContent = t.codeExpiresIn(mins, secs.toString().padStart(2, '0'));
      if (remaining < 60) timerEl.classList.add('urgent');
      if (remaining <= 0) clearInterval(deviceTimerInterval);
    }, 1000);

    // Poll for authorization
    pollDeviceAuth(res.interval || 5);
  } catch (err) {
    document.getElementById('auth-start').style.display = 'block';
    document.getElementById('auth-waiting').style.display = 'none';
    alert(t.errStarting(err.message));
  }
}

async function pollDeviceAuth(interval) {
  const t = T().twitchAuth;
  const res = await api('GET', '/setup/api/poll-device-auth');
  if (res.status === 'authorized') {
    clearInterval(deviceTimerInterval);
    state.displayName = res.displayName;
    state.broadcasterId = res.broadcasterId;
    document.getElementById('auth-waiting').style.display = 'none';
    document.getElementById('auth-done').style.display = 'block';
    document.getElementById('auth-name').innerHTML = t.connectedAs(res.displayName);
    setTimeout(goNext, 1500);
  } else if (res.status === 'expired') {
    clearInterval(deviceTimerInterval);
    alert(t.codeExpired);
    renderStep();
  } else if (res.status === 'error') {
    clearInterval(deviceTimerInterval);
    alert(t.errGeneric(res.error));
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
  const t = T().rewards;
  rewardsDone = { song: false, random: false };
  el.innerHTML = `
    <div class="step-title">${t.title}</div>
    <div class="step-subtitle">${t.subtitle}</div>
    <div id="rewards-loading" class="status-line info">
      ${t.loading}
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
    renderRewardPicker('reward-song-section', 'song', t.songLabel, t.songHint, true);
    renderRewardPicker('reward-random-section', 'random', t.randomLabel, t.randomHint, false);
  } catch (err) {
    console.error('[rewards] Error:', err);
    if (!loadingEl) return;
    loadingEl.className = 'status-line error';
    loadingEl.innerHTML = `${t.errLoad(err.message)}<br>
      <button class="btn btn-ghost" style="margin-top:8px" onclick="renderRewards(document.getElementById('wizard-body'))">${t.retry}</button>`;
  }
}

function renderRewardPicker(containerId, type, label, hint, requiresText) {
  const t = T().rewards;
  const container = document.getElementById(containerId);
  // Song Request needs viewers to type a title, Random Song must not have
  // text input -- only offer existing rewards that match, so picking one
  // here can't produce a reward that's unusable for that purpose.
  const matching = rewardsList
    .map((r, i) => ({ ...r, _idx: i }))
    .filter(r => Boolean(r.is_user_input_required) === requiresText);

  const newOptionHtml = `
    <div class="reward-option reward-option-new" onclick="showCreateForm('${type}')">
      <div class="reward-opt-tag">${t.newTag}</div>
      <div class="reward-opt-name">${t.createNewOption}</div>
      <div class="reward-opt-cost"></div>
    </div>`;

  let listHtml;
  if (rewardsList.length === 0) {
    // Genuinely no custom rewards exist yet (often: channel isn't Affiliate)
    listHtml = `<div class="info-box amber"><div class="info-label">${t.noRewardsTitle}</div>${t.noRewardsBody}</div>`;
  } else if (matching.length > 0) {
    listHtml = `<div class="reward-list" id="reward-list-${type}">
        ${matching.map(r => `
          <div class="reward-option" onclick="pickReward('${type}', ${r._idx})" id="reward-opt-${type}-${r._idx}">
            <div class="reward-opt-tag">${r.is_user_input_required ? t.textInputTag : t.noTextTag}</div>
            <div class="reward-opt-name">${esc(r.title)}</div>
            <div class="reward-opt-cost">${r.cost} pts</div>
          </div>`).join('')}
        ${newOptionHtml}
      </div>`;
  } else {
    // Existing rewards exist, but none have the right text-input setting for
    // this purpose (e.g. all require text, but Random Song must not) --
    // explain why they're hidden and offer to create a suitable one.
    listHtml = `<div class="reward-list" id="reward-list-${type}">
        <div class="info-box amber" style="margin-bottom:6px">
          <div class="info-label">${t.noMatchingTitle}</div>${t.noMatchingBody(requiresText)}
        </div>
        ${newOptionHtml}
      </div>`;
  }

  container.innerHTML = `
    <div style="font-size:11px; letter-spacing:2px; color:var(--text-dim); margin-bottom:8px; text-transform:uppercase">${label}</div>
    <div style="font-size:12px; color:var(--text-dim); margin-bottom:12px">${hint}</div>
    ${listHtml}
    <div id="create-form-${type}" style="display:none; margin-top:12px">
      <div class="field" style="margin-bottom:10px">
        <label>${t.nameLabel}</label>
        <input type="text" id="new-name-${type}" placeholder="${t.namePlaceholder}" />
      </div>
      <div class="field" style="margin-bottom:10px">
        <label>${t.costLabel}</label>
        <input type="number" id="new-cost-${type}" value="${requiresText ? 500 : 300}" min="1" />
      </div>
      <button class="btn btn-primary" style="font-size:11px; padding:6px 14px" onclick="createNewReward('${type}', ${requiresText})">${t.createBtn}</button>
      <button class="btn btn-ghost" style="margin-left:8px" onclick="hideCreateForm('${type}')">${t.cancelBtn}</button>
    </div>
    <div id="reward-done-${type}" style="display:none" class="status-line ok"></div>
  `;
}

async function pickReward(type, idx) {
  const t = T().rewards;
  const reward = rewardsList[idx];
  // Highlight selection
  document.querySelectorAll(`#reward-list-${type} .reward-option`).forEach(el => el.classList.remove('selected'));
  document.getElementById(`reward-opt-${type}-${idx}`).classList.add('selected');

  try {
    await api('POST', '/setup/api/create-rewards', { mode: 'pick', rewardType: type, rewardId: reward.id });
    document.getElementById(`reward-list-${type}`).style.display = 'none';
    const doneEl = document.getElementById(`reward-done-${type}`);
    doneEl.style.display = 'block';
    doneEl.innerHTML = t.using(esc(reward.title));
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
  const t = T().rewards;
  const title = document.getElementById(`new-name-${type}`).value.trim();
  const cost = parseInt(document.getElementById(`new-cost-${type}`).value) || 500;
  const status = document.getElementById('rewards-status');
  if (!title) { showStatus(status, 'error', t.errEmptyName); return; }

  showStatus(status, 'info', t.creating);
  try {
    const res = await api('POST', '/setup/api/create-rewards', { mode: 'create', rewardType: type, title, cost, requiresText });
    document.getElementById(`create-form-${type}`).style.display = 'none';
    document.getElementById(`reward-list-${type}`).style.display = 'none';
    const doneEl = document.getElementById(`reward-done-${type}`);
    doneEl.style.display = 'block';
    doneEl.innerHTML = t.created(esc(res.title || title));
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
  const t = T().googleCreds;
  el.innerHTML = `
    <div class="step-title">${t.title}</div>
    <div class="step-subtitle">${t.subtitle}</div>
    <div class="info-box">
      <div class="info-label">${t.createTitle}</div>
      <ol class="steps-list">
        ${t.steps.map(s => `<li>${s}</li>`).join('')}
      </ol>
    </div>
    <div class="upload-area" id="upload-area" onclick="document.getElementById('creds-file').click()"
         ondragover="event.preventDefault(); this.classList.add('drag-over')"
         ondragleave="this.classList.remove('drag-over')"
         ondrop="handleCredsDrop(event)">
      <input type="file" id="creds-file" accept=".json" onchange="handleCredsFile(this.files[0])">
      <div class="upload-icon">📄</div>
      <div class="upload-text">${t.dropText}</div>
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
  const t = T().googleCreds;
  const status = document.getElementById('creds-status');
  if (!file) return;
  if (!file.name.endsWith('.json')) {
    showStatus(status, 'error', t.errWrongType);
    return;
  }
  showStatus(status, 'info', t.reading);
  let json;
  try {
    const text = await file.text();
    json = JSON.parse(text);
  } catch (err) {
    showStatus(status, 'error', t.errNotJson);
    return;
  }
  if (json.type !== 'service_account') {
    showStatus(status, 'error', t.errNotServiceAccount);
    return;
  }
  showStatus(status, 'info', t.uploading);
  try {
    const res = await api('POST', '/setup/api/upload-credentials', json);
    state.serviceEmail = res.clientEmail;
    document.getElementById('upload-area').innerHTML =
      `<div class="upload-icon">✅</div><div class="upload-text">${t.uploadedText(res.clientEmail)}</div>`;
    showStatus(status, 'ok', t.connected);
    setTimeout(goNext, 1000);
  } catch (err) {
    showStatus(status, 'error', t.errUpload(err.message));
  }
}

// ── Step 6: Song Sheet ────────────────────────────────────────────────────────
function renderSongSheet(el) {
  const t = T().songSheet;
  el.innerHTML = `
    <div class="step-title">${t.title}</div>
    <div class="step-subtitle">${t.subtitle}</div>
    ${state.serviceEmail ? `
      <div class="info-box green">
        <div class="info-label">${t.shareTitle}</div>
        ${t.shareBody(state.serviceEmail)}
      </div>` : ''}
    <div class="field">
      <label>${t.fieldLabel}</label>
      <input type="url" id="sheet-url" placeholder="${t.placeholder}" />
      <div class="hint">${t.hint}</div>
    </div>
    <div id="sheet-status" class="status-line"></div>
    <button class="btn btn-primary" onclick="validateSheet()">${t.loadBtn}</button>
    <div id="column-picker" style="display:none; margin-top:24px;">
      <div class="step-subtitle" style="margin-bottom:12px;">
        ${t.pickColumnsHint}
      </div>
      <div class="column-legend" id="col-legend"></div>
      <table class="column-table" id="col-table"></table>
      <div id="col-status" class="status-line"></div>
      <button class="btn btn-primary" style="margin-top:12px" onclick="saveColumns()">${t.confirmBtn}</button>
    </div>
  `;
}

async function validateSheet() {
  const t = T().songSheet;
  const url = document.getElementById('sheet-url').value.trim();
  const status = document.getElementById('sheet-status');
  if (!url) { showStatus(status, 'error', t.errEmpty); return; }
  showStatus(status, 'info', t.connecting);
  try {
    const res = await api('POST', '/setup/api/validate-sheet', { sheetUrl: url });
    state.sheetId = res.sheetId;
    state.headers = res.headers;
    state.preview = res.preview;
    // Loading a (possibly different) sheet starts column assignment fresh
    state.songCol = null;
    state.artistCol = null;
    state.keyCol = null;
    state.activeColType = 'song';
    showStatus(status, 'ok', t.sheetFound(res.headers.length));
    renderColumnPicker();
    document.getElementById('column-picker').style.display = 'block';
  } catch (err) {
    showStatus(status, 'error', '✗ ' + err.message);
  }
}

// Maps a column "role" to the field it fills in `state` and its highlight class.
const COL_TYPES = ['song', 'artist', 'key'];
const COL_STATE_KEY = { song: 'songCol', artist: 'artistCol', key: 'keyCol' };
const COL_CLASS = { song: 'selected-song', artist: 'selected-artist', key: 'selected-key' };

// Re-derives the whole picker UI from `state` — the single source of truth —
// so switching the active role or re-clicking a column always reflects reality,
// and a wrong pick can simply be reassigned rather than getting stuck.
function renderColumnPicker() {
  const t = T().songSheet;
  const table = document.getElementById('col-table');
  const headers = state.headers;
  const preview = state.preview;
  const labels = { song: t.labelSong, artist: t.labelArtist, key: t.labelKey };
  const roleOf = (header) => COL_TYPES.find(type => state[COL_STATE_KEY[type]] === header) || null;

  const headerRow = headers.map((h, i) => {
    const role = roleOf(h);
    const cls = role ? COL_CLASS[role] : '';
    const text = role ? `${h || t.emptyHeader} ← ${labels[role]}` : (h || t.emptyHeader);
    return `<th data-idx="${i}" class="${cls}" onclick="selectColumn(${i})">${text}</th>`;
  }).join('');

  const previewRows = preview.map(row =>
    '<tr>' + headers.map((_, i) =>
      `<td>${row[i] || ''}</td>`
    ).join('') + '</tr>'
  ).join('');

  table.innerHTML = `<thead><tr>${headerRow}</tr></thead><tbody>${previewRows}</tbody>`;

  renderColumnLegend();
  updateColumnStatus();
}

// The legend doubles as a role switcher — click a label to choose what the
// next column-header click assigns, so any earlier pick can be revisited.
function renderColumnLegend() {
  const t = T().songSheet;
  const legend = document.getElementById('col-legend');
  if (!legend) return;
  // Same colors as the matching .column-table th.selected-* highlight, so the
  // active legend item visually matches the column it will highlight.
  const items = [
    { type: 'song',   color: 'var(--purple)', bg: 'rgba(176,106,255,0.2)',  label: t.legendSong },
    { type: 'artist', color: 'var(--blue)',   bg: 'rgba(90,154,255,0.2)',   label: t.legendArtist },
    { type: 'key',    color: 'var(--green)',  bg: 'rgba(74,255,154,0.15)',  label: t.legendKey },
  ];
  legend.innerHTML = items.map(({ type, color, bg, label }) => {
    const active = state.activeColType === type;
    const style = active ? `border-color:${color}; background:${bg}; color:${color};` : '';
    return `
    <div class="legend-item ${active ? 'active' : ''}" style="${style}" onclick="setActiveColType('${type}')">
      <div class="legend-dot" style="background:${color}"></div> ${label}
    </div>
  `;
  }).join('');
}

function setActiveColType(type) {
  state.activeColType = type;
  renderColumnLegend();
  updateColumnStatus();
}

function updateColumnStatus() {
  const t = T().songSheet;
  const status = document.getElementById('col-status');
  const labels = { song: t.labelSong, artist: t.labelArtist, key: t.labelKey };
  if (state.songCol && state.artistCol) {
    showStatus(status, 'ok', t.selectedSummary(state.songCol, state.artistCol, state.keyCol));
  } else {
    showStatus(status, 'info', t.activeColHint(labels[state.activeColType]));
  }
}

function selectColumn(idx) {
  const header = state.headers[idx];
  const type = state.activeColType;
  const key = COL_STATE_KEY[type];

  if (state[key] === header) {
    // Clicking the current selection again clears it
    state[key] = null;
  } else {
    // Free this column from any other role it currently holds
    COL_TYPES.forEach(t => { if (state[COL_STATE_KEY[t]] === header) state[COL_STATE_KEY[t]] = null; });
    state[key] = header;
    // Auto-advance to the next unfilled role for a smooth first pass —
    // the legend remains clickable at any time to go back and change a pick
    if (type === 'song' && !state.artistCol) state.activeColType = 'artist';
    else if (type === 'artist' && !state.keyCol) state.activeColType = 'key';
  }

  renderColumnPicker();
}

async function saveColumns() {
  const t = T().songSheet;
  const status = document.getElementById('col-status');
  if (!state.songCol || !state.artistCol) {
    showStatus(status, 'error', t.errSelectRequired);
    return;
  }
  try {
    await api('POST', '/setup/api/save-columns', {
      sheetId: state.sheetId,
      songColumn: state.songCol,
      artistColumn: state.artistCol,
      keyColumn: state.keyCol || '',
    });
    showStatus(status, 'ok', t.saved);
    setTimeout(goNext, 800);
  } catch (err) {
    showStatus(status, 'error', '✗ ' + err.message);
  }
}

// ── Step 7: History Sheet ─────────────────────────────────────────────────────
function renderHistorySheet(el) {
  const t = T().historySheet;
  el.innerHTML = `
    <div class="step-title">${t.title}</div>
    <div class="step-subtitle">${t.subtitle}</div>
    ${state.serviceEmail ? `
      <div class="info-box">
        <div class="info-label">${t.setupTitle}</div>
        <ol class="steps-list">
          <li>${t.step1}</li>
          <li>${t.step2(state.serviceEmail)}</li>
          <li>${t.step3}</li>
        </ol>
      </div>` : ''}
    <div class="field">
      <label>${t.fieldLabel}</label>
      <input type="url" id="history-url" placeholder="${t.placeholder}" />
    </div>
    <div id="history-status" class="status-line"></div>
    <div style="display:flex; gap:12px; flex-wrap:wrap;">
      <button class="btn btn-primary" onclick="saveHistory()">${t.saveBtn}</button>
      <button class="btn btn-ghost" onclick="skipHistory()">${t.skipBtn}</button>
    </div>
  `;
}

async function saveHistory() {
  const t = T().historySheet;
  const url = document.getElementById('history-url').value.trim();
  const status = document.getElementById('history-status');
  if (!url) { skipHistory(); return; }
  showStatus(status, 'info', t.connecting);
  try {
    await api('POST', '/setup/api/validate-sheet', { sheetUrl: url, historyMode: true });
    showStatus(status, 'ok', t.connected);
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
  const t = T().obs;
  const overlayUrl = `${location.origin}/overlay/index.html`;
  const css = `body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }`;

  const urlBlock = `<div class="code-block"><span>${overlayUrl}</span><button class="copy-btn" onclick="copyText('${overlayUrl}', this)">${T().copy}</button></div>`;
  const cssBlock = `<div class="code-block"><span>${css}</span><button class="copy-btn" onclick="copyText(\`${css}\`, this)">${T().copy}</button></div>`;

  el.innerHTML = `
    <div class="step-title">${t.title}</div>
    <div class="step-subtitle">${t.subtitle}</div>
    <div class="tabs">
      <div class="tab active" onclick="switchTab('obs-tab', this)">${t.obsTab}</div>
      <div class="tab" onclick="switchTab('streamlabs-tab', this)">${t.streamlabsTab}</div>
    </div>
    <div class="tab-content active" id="obs-tab">
      <ol class="steps-list" style="margin-bottom:16px">
        <li>${t.obsSteps[0]}</li>
        <li>${t.obsSteps[1]}${urlBlock}</li>
        <li>${t.obsSteps[2]}</li>
        <li>${t.obsSteps[3]}${cssBlock}</li>
        <li>${t.obsSteps[4]}</li>
      </ol>
    </div>
    <div class="tab-content" id="streamlabs-tab">
      <ol class="steps-list" style="margin-bottom:16px">
        <li>${t.streamlabsSteps[0]}</li>
        <li>${t.streamlabsSteps[1]}${urlBlock}</li>
        <li>${t.streamlabsSteps[2]}</li>
        <li>${t.streamlabsSteps[3]}${cssBlock}</li>
      </ol>
    </div>
    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
      <button class="btn btn-primary" onclick="goNext()">${t.allDoneBtn}</button>
      <button class="btn btn-ghost" onclick="window.open('${overlayUrl}', '_blank')">${t.previewBtn}</button>
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
  const t = T().done;
  el.innerHTML = `
    <div class="done-icon">🎉</div>
    <div class="step-title" style="text-align:center">${t.title}</div>
    <div class="step-subtitle" style="text-align:center; margin-bottom:24px">
      ${t.subtitle}
    </div>
    <div class="summary-grid">
      <div class="summary-item">
        <span class="check">✓</span>
        <span class="label">${t.twitchAccount}</span>
        <span class="value">${state.displayName || t.connectedFallback}</span>
      </div>
      <div class="summary-item">
        <span class="check">✓</span>
        <span class="label">${t.channelPointsRewards}</span>
        <span class="value">點歌券 + 隨機點歌券</span>
      </div>
      <div class="summary-item">
        <span class="check">✓</span>
        <span class="label">${t.songListSheet}</span>
        <span class="value">${state.songCol || t.configuredFallback}</span>
      </div>
    </div>
    <div class="info-box green">
      <div class="info-label">${t.everyStreamTitle}</div>
      ${t.everyStreamBody}
    </div>
    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:20px;">
      <a class="btn btn-green" href="/dashboard">${t.openDashboard}</a>
      <button class="btn btn-ghost" onclick="goToStep('twitch-app')">${t.rerunSetup}</button>
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
    btn.textContent = T().copied;
    setTimeout(() => btn.textContent = orig, 1500);
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────
init();
