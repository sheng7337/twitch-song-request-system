// i18n.js — translation strings + helpers for the setup wizard
// Supported locales: 'en' (English), 'zh-TW' (Traditional Chinese / Taiwan)

const STRINGS = {
  en: {
    title: 'VTuber Song Queue — Setup',
    logo: '🎵 VTuber Song Queue',
    back: '← Back',
    next: 'Next →',
    copy: 'Copy',
    copied: 'Copied!',

    welcome: {
      title: "Welcome! 👋",
      subtitle: "This wizard will set up your VTuber Song Queue system in about 15 minutes.<br>" +
                "Viewers on your Twitch channel will be able to request songs using Channel Points.",
      needTitle: 'What you need',
      need1: '✅ A Twitch account (your streaming channel)',
      need2: '✅ A Google account (for your song list in Google Sheets)',
      doesTitle: 'What this wizard does',
      doesBody: 'Connects to your Twitch channel, creates the Channel Points rewards, ' +
                'and links your Google Sheets song list — automatically.',
      cta: "Let's get started →",
    },

    twitchApp: {
      title: 'Step 1 — Twitch App',
      subtitle: "We need to register a small app on Twitch's developer site.<br>" +
                "Think of it as giving our system a name tag so Twitch knows who's talking to it.",
      howToTitle: 'How to get your Client ID',
      steps: [
        'Go to <a href="https://dev.twitch.tv/console/apps" target="_blank">dev.twitch.tv/console/apps</a>',
        'Click <strong>[Register Your Application]</strong>',
        'Name: anything you like (e.g. <em>Song Queue</em>)',
        'OAuth Redirect URL: <code>http://localhost</code>',
        'Category: <strong>Other</strong>',
        'Client Type: <strong>Public</strong> (not Confidential — this app never uses a Client Secret) → click Create',
        'Click <strong>[Manage]</strong> on your new app',
        'Copy the <strong>Client ID</strong> shown at the top',
      ],
      fieldLabel: 'Client ID',
      placeholder: 'e.g. abc123def456ghi789',
      hint: 'This is a public identifier — safe to share. No password needed here.',
      verifyBtn: 'Verify & Continue →',
      errEmpty: 'Please enter your Client ID',
      verifying: '<span class="spinner"></span> Verifying...',
      verified: '✓ Client ID verified!',
      errInvalid: '✗ Invalid Client ID',
    },

    twitchAuth: {
      title: 'Step 2 — Connect Your Channel',
      subtitle: 'We need your permission to create Channel Points rewards on your behalf.<br>' +
                'Click the button below, then enter the code shown at <strong>twitch.tv/activate</strong>.',
      importantTitle: 'Important',
      importantBody: 'Make sure your browser is signed in to your <strong>broadcaster Twitch account</strong> ' +
                     '(the channel you stream on) before clicking the button below.',
      connectBtn: 'Connect Twitch Account →',
      visitPage: 'Visit this page in your browser:',
      enterCode: 'Enter this code:',
      waitingForAuth: 'Waiting for authorization...',
      waitingStatus: '<span class="spinner"></span> Waiting for you to enter the code at twitch.tv/activate...',
      connectedTitle: 'Connected!',
      connectedAs: (name) => `✓ Connected as <strong style="color:var(--purple)">${name}</strong>`,
      codeExpiresIn: (mins, secs) => `Code expires in ${mins}:${secs}`,
      codeExpired: 'Code expired. Please try again.',
      errStarting: (msg) => `Error starting auth: ${msg}`,
      errGeneric: (msg) => `Error: ${msg}`,
    },

    rewards: {
      title: 'Step 3 — Channel Points Rewards',
      subtitle: 'Choose which of your existing Channel Points rewards to use for song requests, or create new ones.',
      loading: '<span class="spinner"></span> Loading your rewards...',
      songLabel: '🎵 Song Request',
      songHint: 'Viewers type a song title when they redeem this.',
      randomLabel: '🎲 Random Song',
      randomHint: 'Picks a random song from your list automatically.',
      noRewardsTitle: 'No rewards found',
      noRewardsBody: 'Channel may not be Affiliate yet, or try refreshing.',
      textInputTag: '[text input]',
      noTextTag: '[no text]',
      newTag: '[new]',
      createNewOption: 'Create a new reward...',
      nameLabel: 'Reward name',
      namePlaceholder: 'e.g. Song Request',
      costLabel: 'Point cost',
      createBtn: 'Create →',
      cancelBtn: 'Cancel',
      using: (title) => `✓ Using: ${title}`,
      created: (title) => `✓ Created: ${title}`,
      errLoad: (msg) => `✗ Could not load rewards: ${msg}`,
      retry: 'Retry',
      errEmptyName: 'Please enter a reward name',
      creating: '<span class="spinner"></span> Creating reward...',
    },

    googleCreds: {
      title: 'Step 4 — Google Account Access',
      subtitle: 'Your song list lives in Google Sheets. We need a <em>service account</em> — a special ' +
                'helper account for programs, not people — to read your sheet.<br>' +
                '<span style="color:var(--text-dim)">Think of it as giving a trusted robot a library card.</span>',
      createTitle: 'Create a service account (one-time setup)',
      steps: [
        'Go to <a href="https://console.cloud.google.com" target="_blank">console.cloud.google.com</a>',
        'Click the project dropdown (top left) → <strong>New Project</strong> → name it anything → Create',
        'Search for <strong>Google Sheets API</strong> at the top → click Enable',
        'Left menu → <strong>IAM &amp; Admin → Service Accounts → + Create Service Account</strong>',
        'Name it anything (e.g. <em>song-queue</em>) → click Done',
        'Click the new service account → <strong>Keys tab → Add Key → Create new key → JSON</strong>',
        'A file downloads — drag it into the box below',
      ],
      dropText: 'Drop your <strong>google-credentials.json</strong> here<br>or <span>click to browse</span>',
      uploadedText: (email) => `Uploaded successfully!<br><span style="color:var(--green)">${email}</span>`,
      errWrongType: '✗ Wrong file type — please upload the .json file downloaded from Google Cloud Console',
      reading: '<span class="spinner"></span> Reading file...',
      errNotJson: '✗ This does not look like a valid JSON file. Make sure you downloaded the key as JSON from Google Cloud Console → Service Accounts → Keys → Add Key → JSON.',
      errNotServiceAccount: '✗ This JSON file is not a service account key. Go to Google Cloud Console → IAM & Admin → Service Accounts → click your account → Keys → Add Key → Create new key → JSON.',
      uploading: '<span class="spinner"></span> Uploading...',
      connected: '✓ Service account connected',
      errUpload: (msg) => `✗ ${msg || 'Upload failed'}`,
    },

    songSheet: {
      title: 'Step 5 — Your Song List',
      subtitle: "Paste the URL of your Google Sheet song list below.<br>" +
                "<span style=\"color:var(--text-dim)\">We'll automatically read it to identify the columns.</span>",
      shareTitle: 'Important — share your sheet',
      shareBody: (email) => `Before continuing, open your sheet → click <strong>Share</strong> → paste this email → set to <strong>Viewer</strong>:<br>` +
        `<div style="margin-top:8px; display:flex; align-items:center; gap:8px;">` +
        `<code style="color:var(--green); flex:1;">${email}</code>` +
        `<button class="copy-btn" onclick="copyText('${email}', this)">${T().copy}</button></div>`,
      fieldLabel: 'Google Sheet URL',
      placeholder: 'https://docs.google.com/spreadsheets/d/...',
      hint: "Paste the full URL from your browser's address bar.",
      loadBtn: 'Load Sheet →',
      errEmpty: 'Please paste your sheet URL',
      connecting: '<span class="spinner"></span> Connecting to sheet...',
      sheetFound: (n) => `✓ Sheet found — ${n} columns detected`,
      pickColumnsHint: 'Click a label below to choose what you\'re identifying, then click the matching column header. You can switch labels anytime to fix a wrong pick.',
      legendSong: 'Song Title (required)',
      legendArtist: 'Artist Name (required)',
      legendKey: 'Key / Transpose (optional)',
      confirmBtn: 'Confirm Columns →',
      emptyHeader: '(empty)',
      labelSong: 'Song Title',
      labelArtist: 'Artist Name',
      labelKey: 'Key (optional)',
      activeColHint: (label) => `Now selecting: <strong>${label}</strong> — click its column header above (click a label to change what you're selecting)`,
      selectedSummary: (song, artist, key) => `✓ Song: "${song}", Artist: "${artist}"${key ? `, Key: "${key}"` : ''} — click a label above to change any of these`,
      errSelectRequired: 'Please select at least the Song Title and Artist Name columns',
      saved: '✓ Columns saved!',
    },

    historySheet: {
      title: 'Step 6 — Request History <span style="color:var(--text-dim);font-size:13px">(optional)</span>',
      subtitle: 'We can track how many times each song gets requested and who requested it — across all your streams. ' +
                'This is completely optional.',
      setupTitle: 'To set this up',
      step1: 'Go to <a href="https://sheets.new" target="_blank">sheets.new</a> to create a blank sheet',
      step2: (email) => `Click <strong>Share</strong> → paste this email → set to <strong>Editor</strong>:<br>` +
        `<div style="margin-top:6px; display:flex; align-items:center; gap:8px;">` +
        `<code style="color:var(--green); flex:1;">${email}</code>` +
        `<button class="copy-btn" onclick="copyText('${email}', this)">${T().copy}</button></div>`,
      step3: 'Paste the sheet URL below',
      fieldLabel: 'History Sheet URL (optional)',
      placeholder: 'https://docs.google.com/spreadsheets/d/...',
      saveBtn: 'Save & Continue →',
      skipBtn: 'Skip for now',
      connecting: '<span class="spinner"></span> Connecting...',
      connected: '✓ History sheet connected!',
    },

    obs: {
      title: 'Step 7 — Add to OBS',
      subtitle: 'Add the song queue overlay to your streaming software. ' +
                'It will update automatically whenever a song is requested.',
      obsTab: 'OBS Studio',
      streamlabsTab: 'Streamlabs',
      obsSteps: [
        'In OBS, click <strong>+</strong> under Sources → <strong>Browser</strong>',
        'Paste this URL:',
        'Width: <code>960</code> — Height: <code>800</code>',
        'Paste this into <strong>Custom CSS</strong>:',
        'Uncheck <strong>"Shutdown source when not visible"</strong>',
      ],
      streamlabsSteps: [
        'In Streamlabs, add a new source → <strong>Browser Source</strong>',
        'Paste this URL:',
        'Width: <code>960</code> — Height: <code>800</code>',
        'Paste this into <strong>Custom CSS</strong>:',
      ],
      allDoneBtn: 'All done! →',
      previewBtn: 'Preview overlay',
    },

    done: {
      title: "You're all set!",
      subtitle: "Your song queue system is ready. Here's what was configured:",
      twitchAccount: 'Twitch account',
      connectedFallback: 'Connected',
      channelPointsRewards: 'Channel Points rewards',
      songListSheet: 'Song list sheet',
      configuredFallback: 'Configured',
      everyStreamTitle: 'Every stream',
      everyStreamBody: 'Just run <code>npm start</code> (or <code>start.ps1</code>) and you\'re live. ' +
                       'No other setup needed — ever again.',
      openDashboard: 'Open Dashboard →',
      rerunSetup: 'Re-run setup',
    },

    fileWrongPlace: {
      heading: '⚠ Wrong way to open this file',
      body: 'This setup wizard must be served by the Node.js server.<br>You cannot open it directly as a file.',
      howToStart: 'HOW TO START',
      step1: '1. Open a terminal / PowerShell in the project folder<br>',
      step2: '2. Run: <span style="color:#b06aff">npm start</span><br>',
      step3: (url) => `3. Open: <a href="${url}" style="color:#5a9aff">${url}</a>`,
      footer: 'Or run <span style="color:#7a6a9a">start.ps1</span> / <span style="color:#7a6a9a">start_zh.ps1</span> which starts the server automatically.',
    },
  },

  'zh-TW': {
    title: 'VTuber 點歌系統 — 安裝精靈',
    logo: '🎵 VTuber 點歌系統',
    back: '← 上一步',
    next: '下一步 →',
    copy: '複製',
    copied: '已複製！',

    welcome: {
      title: '歡迎！👋',
      subtitle: '這個精靈會在大約 15 分鐘內幫你設定好 VTuber 點歌系統。<br>' +
                '之後你的 Twitch 觀眾就可以使用頻道點數來點歌囉。',
      needTitle: '你需要準備',
      need1: '✅ 一個 Twitch 帳號（你的實況頻道）',
      need2: '✅ 一個 Google 帳號（用來存放你的歌曲清單 Google 試算表）',
      doesTitle: '這個精靈會自動幫你做的事',
      doesBody: '連接你的 Twitch 頻道、建立頻道點數兌換項目，並串接你的 Google 試算表歌曲清單——全部自動完成。',
      cta: '開始設定 →',
    },

    twitchApp: {
      title: '步驟 1 — Twitch 應用程式',
      subtitle: '我們需要在 Twitch 開發者網站上註冊一個小應用程式。<br>' +
                '可以把它想成是給我們的系統一張「名牌」，讓 Twitch 知道是誰在跟它溝通。',
      howToTitle: '如何取得你的 Client ID（用戶端識別碼）',
      steps: [
        '前往 <a href="https://dev.twitch.tv/console/apps" target="_blank">dev.twitch.tv/console/apps</a>',
        '點擊 <strong>[Register Your Application]（註冊應用程式）</strong>',
        '名稱：隨便取一個你喜歡的（例如 <em>Song Queue</em>）',
        'OAuth 重新導向網址（Redirect URL）：<code>http://localhost</code>',
        '分類（Category）：選 <strong>Other</strong>',
        '用戶端類型（Client Type）：選 <strong>Public</strong>（不要選 Confidential —— 這個應用程式完全不需要用到 Client Secret）→ 點擊 Create',
        '點擊你新建立的應用程式上的 <strong>[Manage]（管理）</strong>',
        '複製最上方顯示的 <strong>Client ID</strong>',
      ],
      fieldLabel: 'Client ID',
      placeholder: '例如 abc123def456ghi789',
      hint: '這是公開的識別碼，可以安全分享，不需要密碼。',
      verifyBtn: '驗證並繼續 →',
      errEmpty: '請輸入你的 Client ID',
      verifying: '<span class="spinner"></span> 驗證中...',
      verified: '✓ Client ID 驗證成功！',
      errInvalid: '✗ Client ID 無效',
    },

    twitchAuth: {
      title: '步驟 2 — 連接你的頻道',
      subtitle: '我們需要你的授權，才能代表你建立頻道點數兌換項目。<br>' +
                '請點擊下方按鈕，然後在 <strong>twitch.tv/activate</strong> 輸入顯示的代碼。',
      importantTitle: '重要提醒',
      importantBody: '點擊下方按鈕前，請確認你的瀏覽器已經登入<strong>實況主的 Twitch 帳號</strong>' +
                     '（也就是你實況用的那個頻道）。',
      connectBtn: '連接 Twitch 帳號 →',
      visitPage: '請在瀏覽器中開啟這個頁面：',
      enterCode: '輸入這個代碼：',
      waitingForAuth: '等待授權中...',
      waitingStatus: '<span class="spinner"></span> 正在等待你於 twitch.tv/activate 輸入代碼...',
      connectedTitle: '已連接！',
      connectedAs: (name) => `✓ 已以 <strong style="color:var(--purple)">${name}</strong> 身份連接`,
      codeExpiresIn: (mins, secs) => `代碼將於 ${mins}:${secs} 後失效`,
      codeExpired: '代碼已過期，請重新嘗試。',
      errStarting: (msg) => `啟動授權時發生錯誤：${msg}`,
      errGeneric: (msg) => `發生錯誤：${msg}`,
    },

    rewards: {
      title: '步驟 3 — 頻道點數兌換項目',
      subtitle: '請選擇要使用哪個現有的頻道點數兌換項目來進行點歌，或是建立新的項目。',
      loading: '<span class="spinner"></span> 正在載入你的兌換項目...',
      songLabel: '🎵 點歌券',
      songHint: '觀眾兌換時需要輸入歌曲名稱。',
      randomLabel: '🎲 隨機點歌',
      randomHint: '會自動從你的歌單中隨機挑選一首歌曲。',
      noRewardsTitle: '找不到任何兌換項目',
      noRewardsBody: '你的頻道可能尚未開通附屬主播（Affiliate）資格，或請嘗試重新整理。',
      textInputTag: '[需輸入文字]',
      noTextTag: '[免輸入]',
      newTag: '[新建]',
      createNewOption: '建立新的兌換項目...',
      nameLabel: '兌換項目名稱',
      namePlaceholder: '例如：點歌券',
      costLabel: '所需點數',
      createBtn: '建立 →',
      cancelBtn: '取消',
      using: (title) => `✓ 使用：${title}`,
      created: (title) => `✓ 已建立：${title}`,
      errLoad: (msg) => `✗ 無法載入兌換項目：${msg}`,
      retry: '重試',
      errEmptyName: '請輸入兌換項目名稱',
      creating: '<span class="spinner"></span> 建立兌換項目中...',
    },

    googleCreds: {
      title: '步驟 4 — Google 帳號授權',
      subtitle: '你的歌曲清單存放在 Google 試算表中。我們需要一個<em>服務帳戶</em>——' +
                '一種給程式（而不是給人）使用的特殊輔助帳戶——來讀取你的試算表。<br>' +
                '<span style="color:var(--text-dim)">可以把它想成是給一個值得信賴的機器人一張圖書館借書證。</span>',
      createTitle: '建立服務帳戶（一次性設定）',
      steps: [
        '前往 <a href="https://console.cloud.google.com" target="_blank">console.cloud.google.com</a>',
        '點擊左上角的專案下拉選單 → <strong>新增專案</strong> → 隨意命名 → 建立',
        '在頂端搜尋 <strong>Google Sheets API</strong> → 點擊啟用',
        '左側選單 → <strong>IAM 與管理 → 服務帳戶 → + 建立服務帳戶</strong>',
        '隨意命名（例如 <em>song-queue</em>）→ 點擊完成',
        '點擊新建立的服務帳戶 → <strong>「金鑰」分頁 → 新增金鑰 → 建立新的金鑰 → JSON</strong>',
        '檔案會自動下載——把它拖曳到下方的方框中',
      ],
      dropText: '把你的 <strong>google-credentials.json</strong> 拖曳到這裡<br>或<span>點擊瀏覽檔案</span>',
      uploadedText: (email) => `上傳成功！<br><span style="color:var(--green)">${email}</span>`,
      errWrongType: '✗ 檔案類型錯誤——請上傳從 Google Cloud Console 下載的 .json 檔案',
      reading: '<span class="spinner"></span> 正在讀取檔案...',
      errNotJson: '✗ 這個檔案看起來不是有效的 JSON 檔案。請確認你是從 Google Cloud Console → 服務帳戶 → 金鑰 → 新增金鑰 → JSON 下載的金鑰檔案。',
      errNotServiceAccount: '✗ 這個 JSON 檔案不是服務帳戶金鑰。請前往 Google Cloud Console → IAM 與管理 → 服務帳戶 → 點擊你的帳戶 → 金鑰 → 新增金鑰 → 建立新的金鑰 → JSON。',
      uploading: '<span class="spinner"></span> 上傳中...',
      connected: '✓ 服務帳戶連接成功',
      errUpload: (msg) => `✗ ${msg || '上傳失敗'}`,
    },

    songSheet: {
      title: '步驟 5 — 你的歌曲清單',
      subtitle: '請貼上你的 Google 歌曲清單試算表網址。<br>' +
                '<span style="color:var(--text-dim)">我們會自動讀取它並辨識欄位。</span>',
      shareTitle: '重要 — 請分享你的試算表',
      shareBody: (email) => `繼續之前，請打開你的試算表 → 點擊<strong>共用</strong> → 貼上這個電子郵件地址 → 設為<strong>檢視者</strong>：<br>` +
        `<div style="margin-top:8px; display:flex; align-items:center; gap:8px;">` +
        `<code style="color:var(--green); flex:1;">${email}</code>` +
        `<button class="copy-btn" onclick="copyText('${email}', this)">${T().copy}</button></div>`,
      fieldLabel: 'Google 試算表網址',
      placeholder: 'https://docs.google.com/spreadsheets/d/...',
      hint: '請貼上瀏覽器網址列中的完整網址。',
      loadBtn: '載入試算表 →',
      errEmpty: '請貼上你的試算表網址',
      connecting: '<span class="spinner"></span> 正在連接試算表...',
      sheetFound: (n) => `✓ 已找到試算表 — 偵測到 ${n} 個欄位`,
      pickColumnsHint: '先點擊下方標籤選擇你要辨識的欄位類型，再點擊對應的欄位標題。隨時可以重新點擊標籤來修正選錯的欄位。',
      legendSong: '歌曲名稱（必填）',
      legendArtist: '歌手名稱（必填）',
      legendKey: 'Key / 升降 Key（選填）',
      confirmBtn: '確認欄位 →',
      emptyHeader: '（空白）',
      labelSong: '歌曲名稱',
      labelArtist: '歌手名稱',
      labelKey: 'Key（選填）',
      activeColHint: (label) => `目前選擇：<strong>${label}</strong> —— 請點擊上方對應的欄位標題（點擊標籤可切換要選擇的欄位類型）`,
      selectedSummary: (song, artist, key) => `✓ 歌曲：「${song}」，歌手：「${artist}」${key ? `，Key：「${key}」` : ''} —— 點擊上方標籤可重新選擇`,
      errSelectRequired: '請至少選擇「歌曲名稱」和「歌手名稱」欄位',
      saved: '✓ 欄位已儲存！',
    },

    historySheet: {
      title: '步驟 6 — 點歌歷史紀錄 <span style="color:var(--text-dim);font-size:13px">（選填）</span>',
      subtitle: '我們可以追蹤每首歌被點過幾次、是誰點的——橫跨你所有的實況。這項功能完全是選填的。',
      setupTitle: '設定方式',
      step1: '前往 <a href="https://sheets.new" target="_blank">sheets.new</a> 建立一份空白試算表',
      step2: (email) => `點擊<strong>共用</strong> → 貼上這個電子郵件地址 → 設為<strong>編輯者</strong>：<br>` +
        `<div style="margin-top:6px; display:flex; align-items:center; gap:8px;">` +
        `<code style="color:var(--green); flex:1;">${email}</code>` +
        `<button class="copy-btn" onclick="copyText('${email}', this)">${T().copy}</button></div>`,
      step3: '把試算表網址貼在下方',
      fieldLabel: '歷史紀錄試算表網址（選填）',
      placeholder: 'https://docs.google.com/spreadsheets/d/...',
      saveBtn: '儲存並繼續 →',
      skipBtn: '先略過',
      connecting: '<span class="spinner"></span> 連接中...',
      connected: '✓ 歷史紀錄試算表連接成功！',
    },

    obs: {
      title: '步驟 7 — 加入 OBS',
      subtitle: '把點歌清單顯示層加入你的實況軟體。每當有人點歌時，它就會自動更新顯示。',
      obsTab: 'OBS Studio',
      streamlabsTab: 'Streamlabs',
      obsSteps: [
        '在 OBS 中，點擊來源底下的 <strong>+</strong> → <strong>瀏覽器</strong>',
        '貼上這個網址：',
        '寬度：<code>960</code> — 高度：<code>800</code>',
        '把這段貼到<strong>自訂 CSS</strong>欄位：',
        '取消勾選 <strong>「來源不可見時關閉來源」</strong>',
      ],
      streamlabsSteps: [
        '在 Streamlabs 中，新增來源 → <strong>瀏覽器來源</strong>',
        '貼上這個網址：',
        '寬度：<code>960</code> — 高度：<code>800</code>',
        '把這段貼到<strong>自訂 CSS</strong>欄位：',
      ],
      allDoneBtn: '全部完成！→',
      previewBtn: '預覽顯示層',
    },

    done: {
      title: '一切都設定好了！',
      subtitle: '你的點歌系統已經準備就緒，以下是已完成的設定：',
      twitchAccount: 'Twitch 帳號',
      connectedFallback: '已連接',
      channelPointsRewards: '頻道點數兌換項目',
      songListSheet: '歌曲清單試算表',
      configuredFallback: '已設定',
      everyStreamTitle: '每次開台時',
      everyStreamBody: '只要執行 <code>npm start</code>（或 <code>start_zh.ps1</code>）就能上線，不需要再做任何其他設定。',
      openDashboard: '開啟控制台 →',
      rerunSetup: '重新執行設定',
    },

    fileWrongPlace: {
      heading: '⚠ 開啟方式不正確',
      body: '這個安裝精靈必須透過 Node.js 伺服器來提供服務。<br>你不能直接以檔案方式開啟它。',
      howToStart: '如何啟動',
      step1: '1. 在專案資料夾中開啟終端機 / PowerShell<br>',
      step2: '2. 執行：<span style="color:#b06aff">npm start</span><br>',
      step3: (url) => `3. 開啟：<a href="${url}" style="color:#5a9aff">${url}</a>`,
      footer: '或執行 <span style="color:#7a6a9a">start.ps1</span> / <span style="color:#7a6a9a">start_zh.ps1</span>，會自動啟動伺服器。',
    },
  },
};

// ── Locale detection & persistence ───────────────────────────────────────────

function detectLang() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get('lang');
  if (fromUrl && STRINGS[fromUrl]) return fromUrl;

  const stored = localStorage.getItem('setup_lang');
  if (stored && STRINGS[stored]) return stored;

  return 'en';
}

let currentLang = detectLang();

function setLang(lang) {
  if (!STRINGS[lang]) return;
  currentLang = lang;
  localStorage.setItem('setup_lang', lang);
  document.documentElement.lang = lang;
  document.title = T().title;
  const logoEl = document.getElementById('logo');
  if (logoEl) logoEl.textContent = T().logo;
  if (typeof renderStepDots === 'function') renderStepDots();
  if (typeof renderStep === 'function') renderStep();
  if (typeof renderLangSwitch === 'function') renderLangSwitch();
}

function getLang() {
  return currentLang;
}

// T() returns the translation object for the current locale
function T() {
  return STRINGS[currentLang] || STRINGS.en;
}
