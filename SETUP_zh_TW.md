# 🎵 VTuber 點歌系統 — 安裝說明

> **第一次使用、還沒有歌單？** 先看 [新手入門（從零開始）](docs/STARTER_GUIDE_zh_TW.md)：從頭一步一步來，
> 包括怎麼做歌單。這一頁是安裝、設定和問題排解；控制台每個分頁怎麼用，在 [docs/README_zh_TW.md](docs/README_zh_TW.md)。

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
5. （選填）建立只從某個分頁抽歌的隨機點歌券（例如隨機日語歌）
6. （選填）連結點歌紀錄試算表，追蹤點歌者與點歌時間
7. 將歌單顯示層和 Clip Player 加入 OBS 場景

精靈會在每個步驟即時驗證輸入內容，並清楚說明該做什麼、為什麼要這麼做。
如果中途離開，下次回來會從中斷的地方繼續。

> 想自己填寫 `.env`？請看 [SETUP_MANUAL.md](SETUP_MANUAL.md)（英文）。

---

## 每次直播開始

**直接雙擊 `start_zh.bat`**（英文版為 `start.bat`）。

就這樣 —— 不需要 ngrok、不需要複製網址、也不需要更新 `.env`。
腳本會啟動伺服器，並把控制台開在自己的視窗：另外獨立執行的 Chrome（或 Edge），讓 OBS 能單獨擷取雷虎練唱台的聲音
（見「[OBS 裡的雷虎練唱台聲音](docs/tabs/leihu_zh_TW.md#obs-裡的雷虎練唱台聲音)」）。這個視窗沒有你平常瀏覽器的登入和書籤，控制台也不需要。還沒完成安裝精靈，
或電腦上沒有 Chrome 和 Edge 時，會改用平常的瀏覽器開啟。

---

## 使用控制台

開啟 `http://localhost:3000/dashboard`（`start_zh.bat` 會幫你打開）。每個分頁怎麼用，都有自己的說明頁；分頁列右邊的「**❓**」
會打開你目前所在分頁的說明。所有說明：[docs/README_zh_TW.md](docs/README_zh_TW.md)。

| 分頁 | 說明 |
|---|---|
| 🎵 點歌佇列 | [docs/tabs/queue_zh_TW.md](docs/tabs/queue_zh_TW.md)：四個區塊、待審核、歌名比對、隨機點歌、練習分頁 |
| 🎤 雷虎練唱台 | [docs/tabs/leihu_zh_TW.md](docs/tabs/leihu_zh_TW.md)：伴奏、YouTube 連結搜尋、📱 提詞機、OBS 裡的聲音 |
| 💬 聊天室 | [docs/tabs/chat_zh_TW.md](docs/tabs/chat_zh_TW.md)：要宣讀、發言、管理、Shoutout、揪團、置頂 |
| 🎛 模式 | [docs/tabs/modes_zh_TW.md](docs/tabs/modes_zh_TW.md)：連線 Streamlabs／OBS、建立和修改模式 |
| 👕 換裝 | [docs/tabs/outfits_zh_TW.md](docs/tabs/outfits_zh_TW.md)：veadotube mini |
| 🔔 通知 | [docs/tabs/alerts_zh_TW.md](docs/tabs/alerts_zh_TW.md)：通知和 🎟️ 兌換特效 |
| 🎟️ 兌換 | [docs/tabs/rewards_zh_TW.md](docs/tabs/rewards_zh_TW.md)：每個項目的用途、新增項目、交給點歌系統管理 |
| 🤖 機器人 | [docs/tabs/bot_zh_TW.md](docs/tabs/bot_zh_TW.md)：指令和定時訊息，取代 Nightbot |

跨分頁的功能：[🎭 情境點歌](docs/features/mood-requests_zh_TW.md) ·
[🎬 Clip、感謝名單和揪團](docs/features/clips-and-rolls_zh_TW.md)（聊天指令、`!tk` 背景圖、統一 Clip 音量）·
[🖼 疊加層和 🎨 外觀](docs/features/overlays_zh_TW.md)。

---

## OBS / Streamlabs 瀏覽器來源設定

每個都新增成「**瀏覽器**」來源；網址前面都是 `http://localhost:3000`。詳細步驟、自訂 CSS 和大小：
「[疊加層](docs/features/overlays_zh_TW.md)」。

| 來源 | 網址 | 大小 |
|---|---|---|
| 歌單顯示層 | `/overlay/index.html` | 960 × 1470，縮小到 50% |
| Clip Player（`!so`、`!watch`、`!tk`、`!endingtk`） | `/clip-player/index.html` | 1920 × 1080，最上層 |
| 直播畫面上的聊天室（選用） | `/overlay/chat.html?style=panel`（`bubble`、`list`、`row`） | 例如 960 × 1080，縮小到 50% |
| 通知（選用） | `/overlay/alerts.html?layout=vertical`（或 `horizontal`） | 800 × 600（1600 × 300），縮小到 50% |
| 兌換特效（選用） | `/overlay/reward-effects.html` | 1920 × 1080，最上層 |
| 休息中／準備中卡片（選用） | `/overlay/break.html`（`?card=opening`） | 960 × 260，縮小到 50% |

控制台的「🎨 外觀與疊加層」有列出每一個，可以按「**複製**」。

---

## Google 試算表設定

### 歌曲清單試算表

你現有的歌曲清單。所有分頁都會載入。「**練習分頁**」（「🎵 點歌佇列 → ⚙ → 歌單分頁」；還沒選過時為 `待練勿點`）裡的歌不會被點或抽到，但雷虎練唱台照樣會準備。🎤 點歌和每個 🎲 隨機點歌用哪些分頁，在「🎟️ 兌換」分頁設定。
共用給服務帳戶電子郵件 →「**檢視者**」權限即可。YouTube 連結搜尋要儲存連結時需要「**編輯者**」權限（見「[YouTube 連結搜尋](docs/tabs/leihu_zh_TW.md#第一次設定)」）。

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
| `server/config.js` | 比對門檻、隨機權重、各分頁在雷虎練唱台的辨識語言等行為設定 |
| `overlay/index.html` | 頂部 CSS 變數 — 字體大小、清單高度等外觀設定；`SCROLL_PX_PER_SEC` — 捲動速度 |

---

## 聊天指令

`!so`、`!tk`、`!endingtk`、`!watch`、`!replay` 和 `!stop`，管理員和實況主可以用：
「[Clip、感謝名單和揪團](docs/features/clips-and-rolls_zh_TW.md)」。自己的指令：「[🤖 機器人](docs/tabs/bot_zh_TW.md)」。

---

## 檔案結構

```
vtuber-song-queue/
├── setup/                      ← 瀏覽器版安裝精靈（於 /setup 提供服務）
├── start.ps1 / start_zh.ps1    ← 每次直播開始時執行
├── *.bat                       ← 雙擊執行用啟動檔（避免 PowerShell 執行原則問題）
├── .env                        ← 金鑰設定（請勿上傳至 Git！）
├── .env.example                ← 設定範本與說明
├── google-credentials.json     ← 服務帳戶金鑰（請勿上傳至 Git！）
├── song-cache.json             ← 自動產生的快取，可安全刪除
├── queue-state.json            ← 目前的歌單，6 小時內重新啟動會還原
├── song-links.json             ← 手動連結到雷虎練唱台的歌曲
├── link-search.json            ← YouTube 連結搜尋的進度和決定
├── chat-logs/                  ← 聊天室分頁的紀錄，每天一個檔案（保留 CHAT_LOG_DAYS 天）
├── logs/                       ← 每次啟動一個資料夾：app.log（黑色視窗的內容）和 leihu.log（保留 30 次／14 天）
├── ending-credits.json         ← 上次執行 !endingtk 的時間
├── reward-takeovers.json       ← 交給點歌系統管理的兌換項目（🎟️ 兌換分頁）
├── stream-session.json         ← 上次開台的時間（聊天室分頁的要宣讀標示）
├── stream-modes.json           ← 🎛 模式
├── alerts.json                 ← 🔔 通知設定
├── reward-effects.json         ← 🎟️ 兌換特效
├── alert-media/                ← 你的通知和兌換特效的圖片、音效
├── bot.json                    ← 🤖 機器人的指令和定時訊息
├── mood-tags.json              ← 🎭 歌曲的心情標記和累計花費
├── mood-picks.jsonl            ← 🎭 選歌紀錄（有觀眾寫的話：不要分享）
├── docs/                       ← 每個分頁的使用說明（docs/README_zh_TW.md）
├── server/                     ← 伺服器（每個檔案的說明見 CLAUDE.md）
│   └── commands/               ← 聊天指令（!so、!watch、!replay、!stop、!tk、!endingtk）
├── shared/                     ← 各頁面共用的英文／繁體中文文字
├── overlay/index.html          ← OBS 歌單顯示層
├── clip-player/
│   ├── index.html              ← OBS Clip Player（Shoutout、!watch、感謝名單）
│   └── sponsor-bgs/            ← !tk 背景圖資料夾（放入多張圖片，每次隨機選取）
├── dashboard/
│   ├── index.html              ← 主播控制台
│   ├── links.html              ← YouTube 連結搜尋
│   └── prompter.html           ← 📱 平板上的歌詞和聊天室（/prompter）
└── tools/find-videos.py        ← 連結搜尋用的輔助程式（用雷虎練唱台的 Python 執行）
```

---

## 小提醒

- 歌曲清單**每 5 分鐘自動更新** — 新增歌曲後不需重新啟動伺服器
- 點歌紀錄**約 2 秒內寫入**試算表（有防抖設計，不會頻繁呼叫 API）
- Twitch 連線會**自動續約** — 不需要手動更新權杖，也不需要重啟通道
- 更新後需要新的 Twitch 權限時，控制台會顯示「**重新授權 →**」連結
- **回報問題**：「🎨 外觀與疊加層」→「**📂 這次執行的紀錄**」會打開 `logs/` 裡這次啟動的資料夾（`app.log` 是黑色視窗的內容，
  `leihu.log` 是雷虎練唱台的）。之前的啟動是旁邊以日期時間命名的資料夾 —— 選出問題那場直播的。token 和密碼會被遮掉；
  裡面有觀眾名字和歌名。

---

## YouTube 拒絕下載

雷虎練唱台用 yt-dlp 下載歌曲。YouTube 有時會拒絕，並要求「確認你不是機器人」（*Sign in to confirm
you're not a bot*）：控制台的標籤會顯示 **♫ YouTube 拒絕下載**。
這是 YouTube 暫時封鎖你的網路連線（常發生在同一台電腦短時間內大量存取 YouTube 之後），不是歌曲的問題。

1. **等一下。** 通常幾小時到一天內就會恢復。
2. **如果一直發生**，可以讓 yt-dlp 使用瀏覽器的 YouTube 登入狀態，雷虎練唱台本身不需要任何修改：
   - 用 **Firefox** 登入 YouTube。Chrome 和 Edge 在 Windows 上會鎖住 Cookie，yt-dlp 讀不到。
   - 建立檔案 `%APPDATA%\yt-dlp\config.txt`，內容只有這一行：
     `--cookies-from-browser firefox`
   - 之後雷虎練唱台下載時就會使用這個登入狀態。想恢復原狀，刪掉這個檔案即可。
   - 建議使用次要的 Google 帳號：YouTube 可能會限制被發現在下載影片的帳號。
