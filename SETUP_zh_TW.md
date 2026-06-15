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

將顯示層加入你的場景——只需設定一次：

1. 在 OBS/Streamlabs 新增來源 → **瀏覽器（Browser）**
2. 網址：`http://localhost:3000/overlay/index.html`
3. 寬度：`960`，高度：`1362`（顯示層會以 2 倍解析度渲染，較清晰）
4. 在 **自訂 CSS（Custom CSS）** 欄位貼上：
   ```css
   body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }
   ```
5. 取消勾選 **「來源不可見時關閉（Shutdown source when not visible）」**
6. 在場景中選取這個來源，將大小縮小至 `480 x 681`（即 50%）——
   這一步才是讓 2 倍渲染變得清晰、而不是單純放大的關鍵

伺服器啟動後顯示層會自動連線，並即時更新歌單內容。

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
├── setup/                    ← 瀏覽器版安裝精靈（於 /setup 提供服務）
├── setup.ps1                 ← 選用的終端機安裝精靈
├── start.ps1                 ← 每次直播開始時執行
├── start_zh.bat / setup_zh.bat ← 雙擊執行用啟動檔（避免 PowerShell 執行原則問題）
├── .env                      ← 金鑰設定（請勿上傳至 Git！）
├── .env.example              ← 設定範本與說明
├── google-credentials.json   ← 服務帳戶金鑰（請勿上傳至 Git！）
├── song-cache.json           ← 自動產生的快取，可安全刪除
├── server/
│   ├── index.js              ← 主伺服器
│   ├── config.js             ← 可調整的行為設定
│   ├── sheets.js             ← 歌曲清單讀取器
│   ├── matcher.js            ← 模糊比對（fuse.js）
│   ├── queue.js              ← 歌單狀態 + WebSocket 廣播
│   ├── twitch.js             ← EventSub WebSocket 用戶端 + 裝置授權權杖管理
│   ├── setup-routes.js       ← 安裝精靈背後的 API 端點
│   ├── history.js            ← 點歌紀錄寫入器
│   └── random.js             ← 隨機選歌器
├── overlay/
│   └── index.html            ← OBS 瀏覽器來源（顯示層）
└── dashboard/
    └── index.html            ← 主播控制台
```

---

## 小提醒

- 歌曲清單**每 5 分鐘自動更新** — 新增歌曲後不需重新啟動伺服器
- 點歌紀錄**約 2 秒內寫入**試算表（有防抖設計，不會頻繁呼叫 API）
- Twitch 連線會**自動續約** — 不需要手動更新權杖，也不需要重啟通道
- 想讓系統 24 小時運作而不必開著電腦？可部署至 Railway 或 Render 等平台
