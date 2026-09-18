# 🎵 VTuber 點歌系統 — 安裝說明

## 運作流程

```
觀眾兌換頻道點數（點歌券 或 隨機點歌券）
        ↓
Twitch EventSub（伺服器主動連線的 WebSocket）→ 你的本機伺服器
        ↓
🎵 點歌券：模糊比對歌名 → 加入歌單 或 待審核（控制台）
🎲 隨機點歌券：從歌曲清單中加權隨機選歌
        ↓
OBS 顯示層透過 WebSocket 即時更新
        ↓
點歌紀錄寫入 Google 試算表
```

不需要對外公開網址、不需要通道（tunnel），當然也不需要 ngrok —— 伺服器會主動連線到 Twitch。

---

## 事前準備

只需要先安裝這一項：

- **Node.js LTS** → https://nodejs.org （安裝時記得勾選「Add to PATH」）

就這樣，不需要額外下載或預先設定任何東西。

---

## 首次安裝

**直接雙擊 `start_zh.bat`**（英文版為 `start.bat`）。

> 偏好用終端機？`.\start_zh.ps1` / `.\start.ps1` 效果相同。如果 PowerShell 出現「無法載入，
> 因為在此系統上停用了執行原則」之類的訊息，請改用 `.bat` 檔 —— 它不需要更改任何系統設定
> 即可繞過該限制。

第一次執行時，瀏覽器會自動開啟一個**逐步引導的安裝精靈**，網址為
`http://localhost:3000/setup?lang=zh-TW`。全程使用淺顯易懂的中文說明 —— 不需要打指令、
也不需要手動編輯 `.env`：

1. 建立一個小型 Twitch 應用程式，貼上它的 Client ID
2. 連結你的 Twitch 帳號（在 twitch.tv/activate 輸入一組短代碼即可，不需要複製貼上金鑰）
3. 自動建立 🎵 點歌券 與 🎲 隨機點歌券 頻道點數兌換項目
4. 上傳 Google **服務帳戶**金鑰，並從即時預覽畫面中選擇你的歌曲清單試算表
5. （選填）連結點歌紀錄試算表，追蹤點歌者與點歌時間
6. 將顯示層加入 OBS 場景

精靈會在每個步驟即時驗證輸入內容，並清楚說明該做什麼、為什麼要這麼做。
如果中途離開，下次回來會從中斷的地方繼續。

> 偏好用終端機操作？`setup.ps1` / `setup_zh.ps1` 也能在 PowerShell 中以互動方式
> 完成相同的步驟（Twitch 裝置授權、建立兌換項目、設定 Google 試算表）。

---

## 每次直播開始

**直接雙擊 `start_zh.bat`**（英文版為 `start.bat`）。

就這樣 —— 不需要 ngrok、不需要複製網址、也不需要更新 `.env`。
腳本會啟動伺服器，並自動開啟瀏覽器前往 **http://localhost:3000/dashboard**。

---

## OBS / Streamlabs 瀏覽器來源設定

### 歌單顯示層

1. 新增來源 → **瀏覽器（Browser）**
2. 網址：`http://localhost:3000/overlay/index.html`
3. 寬度：`960`，高度：`1362`
4. **自訂 CSS**：
   ```css
   body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }
   ```
5. 取消勾選「來源不可見時關閉」
6. 在場景中將來源縮小至 `480 × 681`（50%）——此步驟讓顯示層以 2 倍解析度渲染，畫面更清晰

### Clip Player（Shoutout / 感謝名單）

1. 新增來源 → **瀏覽器（Browser）**
2. 網址：`http://localhost:3000/clip-player/index.html`
3. 寬度：`1920`，高度：`1080`
4. 放置於場景最上層，全螢幕覆蓋
5. 平時完全透明，執行 `!so` 或 `!tk` 時自動顯示內容

---

## Google 試算表設定

### 歌曲清單試算表

你現有的歌曲清單。所有分頁皆會載入，除了 `server/config.js` 中 `EXCLUDED_TABS` 所列的分頁。

第一列必須包含欄位名稱（標題列），最少需有：

| title | artist | key |
|---|---|---|
| シャルル | バルーン | 0 |
| ロキ | みきとP | -2 |

欄位名稱須與 `.env` 中的 `SHEET_SONG_COLUMN` / `SHEET_ARTIST_COLUMN` 一致。
`key` 欄為選填 — 僅接受數字，非數字值會被忽略。

### 點歌紀錄試算表

一份獨立的空白試算表。伺服器首次執行時會自動建立標題列。
請共用給服務帳戶電子郵件 → **編輯者**權限。

---

## 設定檔說明

| 檔案 | 用途 |
|---|---|
| `.env` | 金鑰、ID、網址 — 詳見 `.env.example` 的說明註解 |
| `server/config.js` | 比對門檻、排除分頁、捲動速度、隨機權重等行為設定 |
| `overlay/index.html` | 頂部 CSS 變數 — 字體大小、清單高度等外觀設定 |

---

## 聊天指令

所有指令僅限**版主與台主**使用，觀眾無法觸發。

### Shoutout 與感謝名單

| 指令 | 用法 | 說明 |
|---|---|---|
| `!so` | `!so <帳號名稱>` | 從指定頻道隨機抓一個 Clip 播放，同時將該頻道記錄至感謝名單 |
| `!tk` | `!tk` | 播放日式電視風格的感謝名單，列出本場所有 `!so` 過的頻道；播完後自動清空名單 |
| `!replay` | `!replay` | 重播上一個 `!so` 或 `!watch` 的片段 |
| `!stop` | `!stop` | 立即中止當前播放的片段或感謝名單 |

#### 感謝名單（`!tk`）細節

- **背景圖片**：在 `.env` 設定 `SPONSOR_BG_URL`（預設 `clip-player/sponsor-bg.jpg`）
- **畫面流程**：背景出現 → 「提供」字樣與橫線淡入 → 每頁最多 4 位頻道（頭像、顯示名稱、帳號）→ 一般頁停留 5 秒、最後一頁停留 10 秒後結束
- **語音播報**：伺服器啟動時自動生成「この番組はご覧のスポンサーの提供でお送りします。」的音檔，優先使用本機 **VoiceVox**，若未啟動則從 Google TTS 下載；音檔為 `clip-player/sponsor-voice.wav` 或 `.mp3`，不需手動建立
- **頭像預載**：每次執行 `!so` 時即將頭像預先快取至瀏覽器，確保 `!tk` 播放時畫面不會出現半載入的圖片

### 影片播放

| 指令 | 用法 | 說明 |
|---|---|---|
| `!watch` | `!watch <網址>` | 播放 Twitch Clip 網址、YouTube 網址，或直接連結的影片檔（mp4/webm） |

### 點歌（聊天指令模式）

僅在 `.env` 設定 `CHAT_REQUEST_ENABLED=true` 時啟用，適用於沒有聯盟主資格的頻道。

| 指令 | 用法 | 說明 |
|---|---|---|
| `!sr` | `!sr <歌名>` | 觀眾透過聊天點歌，模糊比對歌名，信心度 ≥ 80% 自動加入歌單 |

冷卻時間可在 `.env` 的 `CHAT_REQUEST_COOLDOWN_SECONDS` 調整（預設 30 秒）。

---

## 控制台（Dashboard）

直播時在瀏覽器開啟 `http://localhost:3000/dashboard`。

| 功能 | 說明 |
|---|---|
| 4 個欄位 | 正在演唱 · 待唱歌單 · 已唱歌單 · 待審核 |
| 拖放排序 | 可在欄位間移動歌曲，或在欄位內調整順序 |
| ✓ 唱完了 | 將「正在演唱」移至「已唱歌單」，並自動拉入下一首 |
| 待審核欄位 | 低信心或未比對到的請求 — 手動編輯後確認加入 |
| 手動點歌欄 | 不透過頻道點數直接新增歌曲 |
| 點歌紀錄 | 每張歌曲卡片顯示上次點歌日期與點歌者 |
| 調音圓圈 | 顯示移調數值（如 +3、-2 等） |

---

## 歌名比對機制

| 結果 | 動作 |
|---|---|
| 信心度 ≥ 80% | 自動加入待唱歌單 |
| 信心度 < 80% | 加入待審核，附上建議比對結果 |
| 完全無比對 | 加入待審核，標題空白供手動輸入 |

可在 `server/config.js` 調整：`AUTO_ACCEPT_THRESHOLD`（信心度門檻）、`MATCH_THRESHOLD`（0.2 較嚴格 / 0.6 較寬鬆）。

---

## 隨機點歌模式

在 `.env` 中設定 `RANDOM_PICK_MODE`：
- `weighted` — 優先選取近期較少點到的歌曲（推薦）
- `pure` — 完全隨機

已在待唱歌單或正在演唱中的歌曲一律排除。

---

## 檔案結構

```
vtuber-song-queue/
├── setup/                      ← 瀏覽器版安裝精靈（於 /setup 提供服務）
├── setup.ps1                   ← 選用的終端機安裝精靈
├── start.ps1                   ← 每次直播開始時執行
├── start_zh.bat / setup_zh.bat ← 雙擊執行用啟動檔（避免 PowerShell 執行原則問題）
├── .env                        ← 金鑰設定（請勿上傳至 Git！）
├── .env.example                ← 設定範本與說明
├── google-credentials.json     ← 服務帳戶金鑰（請勿上傳至 Git！）
├── song-cache.json             ← 自動產生的快取，可安全刪除
├── server/
│   ├── index.js                ← 主伺服器
│   ├── config.js               ← 可調整的行為設定
│   ├── sheets.js               ← 歌曲清單讀取器
│   ├── matcher.js              ← 模糊比對（fuse.js）
│   ├── queue.js                ← 歌單狀態 + WebSocket 廣播
│   ├── twitch.js               ← EventSub WebSocket 用戶端 + 裝置授權權杖管理
│   ├── setup-routes.js         ← 安裝精靈背後的 API 端點
│   ├── history.js              ← 點歌紀錄寫入器
│   ├── random.js               ← 隨機選歌器
│   ├── shoutout-history.js     ← !so 感謝名單（記憶體，供 !tk 使用）
│   ├── sponsor-voice.js        ← 自動生成日語語音音檔
│   └── commands/
│       ├── shoutout.js         ← !so 指令
│       ├── thanks.js           ← !tk 指令
│       ├── watch.js            ← !watch 指令
│       ├── replay.js           ← !replay 指令
│       ├── stop.js             ← !stop 指令
│       └── song-request.js     ← !sr 指令
├── clip-player/
│   ├── index.html              ← OBS Clip Player（Shoutout / 感謝名單）
│   └── sponsor-bg.jpg          ← !tk 背景圖（自行替換）
├── overlay/
│   └── index.html              ← OBS 歌單顯示層
└── dashboard/
    └── index.html              ← 主播控制台
```

---

## 小提醒

- 歌曲清單**每 5 分鐘自動更新** — 新增歌曲後不需重新啟動伺服器
- 點歌紀錄**約 2 秒內寫入**試算表（有防抖設計，不會頻繁呼叫 API）
- Twitch 連線會**自動續約** — 不需要手動更新權杖，也不需要重啟通道
- 想讓系統 24 小時運作而不必開著電腦？可部署至 Railway 或 Render 等平台
