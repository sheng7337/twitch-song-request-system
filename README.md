# 🎵 VTuber 點歌系統

Twitch 頻道點數點歌系統，附即時 OBS 顯示層、模糊歌名比對、以及一套適用於連麥直播的 Shoutout 指令組。

---

## 快速開始

### 首次安裝

1. 安裝 **Node.js LTS** → https://nodejs.org（記得勾選「Add to PATH」）
2. **雙擊 `start_zh.bat`**

瀏覽器會自動開啟安裝精靈（`http://localhost:3000/setup`），逐步引導你完成：Twitch 應用程式、帳號授權、頻道點數兌換項目、Google 試算表連接。全程不需要打指令或手動編輯設定檔。

### 每次直播開始

**雙擊 `start_zh.bat`**，就這樣。

伺服器啟動後會自動開啟 Dashboard（`http://localhost:3000/dashboard`）。不需要 ngrok，不需要複製任何網址。

> 詳細安裝說明請參閱 [SETUP_zh_TW.md](SETUP_zh_TW.md)

---

## OBS 瀏覽器來源

| 用途 | 網址 |
|---|---|
| 歌單顯示層 | `http://localhost:3000/overlay/index.html` |
| Shoutout / Sponsor Roll | `http://localhost:3000/clip-player/index.html` |

**歌單顯示層**：寬 `960`，高 `1362`，縮小至 50%（480×681）使用，畫面最清晰。
Custom CSS：
```css
body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }
```

**Clip Player**：寬 `1920`，高 `1080`，全螢幕覆蓋在場景最上層。播放 Shoutout 片段與 Sponsor Roll 時才會出現內容，其餘時間完全透明。

---

## 聊天指令

所有指令僅限**版主與台主**使用，觀眾無法觸發。

### Shoutout 系列

| 指令 | 用法 | 說明 |
|---|---|---|
| `!so` | `!so <帳號名稱>` | 從指定頻道隨機抓一個 Clip 播放，並將其記錄至感謝名單（供 `!tk` 使用） |
| `!tk` | `!tk` | 播放日式電視風格的 Sponsor Roll，列出本場所有 `!so` 過的頻道；播完後自動清空名單 |
| `!replay` | `!replay` | 重播上一個 `!so` 或 `!watch` 的片段 |
| `!stop` | `!stop` | 立即中止當前播放的片段或 Sponsor Roll |

#### `!tk` Sponsor Roll 說明

- 背景圖片：在 `.env` 中設定 `SPONSOR_BG_URL`
- 畫面順序：背景出現 → 「提供」字樣淡入 → 每頁最多 4 位頻道（含頭像、顯示名稱、帳號）→ 最後一頁停留 10 秒後結束
- 語音：伺服器啟動時自動生成「この番組はご覧のスポンサーの提供でお送りします。」的 WAV/MP3 音檔，透過 VoiceVox（本機）或 Google TTS（備援）產生
- `!so` 執行時即預先載入頭像，確保 `!tk` 播放時畫面完整

### 影片播放

| 指令 | 用法 | 說明 |
|---|---|---|
| `!watch` | `!watch <網址>` | 播放指定的 Twitch Clip、YouTube 影片，或直接連結的影片檔（mp4/webm） |

### 點歌（聊天指令模式）

僅在 `.env` 設定 `CHAT_REQUEST_ENABLED=true` 時啟用。適用於沒有聯盟主資格、無法建立頻道點數兌換項目的頻道。

| 指令 | 用法 | 說明 |
|---|---|---|
| `!sr` | `!sr <歌名>` | 觀眾透過聊天點歌（模糊比對歌名，信心度 ≥ 80% 自動加入歌單） |

冷卻時間可在 `.env` 的 `CHAT_REQUEST_COOLDOWN_SECONDS` 調整（預設 30 秒）。

---

## 控制台（Dashboard）

直播時在瀏覽器開啟 `http://localhost:3000/dashboard`。

| 功能 | 說明 |
|---|---|
| 4 個欄位 | 正在演唱 · 待唱歌單 · 已唱歌單 · 待審核 |
| 拖放排序 | 可在欄位間移動或調整順序 |
| 待審核欄位 | 低信心或未比對到的請求，手動確認後加入歌單 |
| 手動點歌 | 不透過頻道點數直接新增歌曲 |
| 調音圓圈 | 顯示移調數值（+3、-2 等） |

---

## 設定

| 檔案 | 說明 |
|---|---|
| `.env` | 金鑰、Twitch ID、Google Sheet ID 等（參考 `.env.example`） |
| `server/config.js` | 比對門檻、排除分頁、捲動速度、隨機權重等行為設定 |

### 常用 `.env` 設定

```env
CHAT_REQUEST_ENABLED=false        # 改為 true 啟用 !sr 指令
CHAT_REQUEST_COOLDOWN_SECONDS=30  # !sr 每位觀眾的冷卻秒數
RANDOM_PICK_MODE=weighted         # weighted（推薦）或 pure
RANDOM_COOLDOWN_DAYS=7            # 隨機點歌排除最近 N 天內點過的歌
SPONSOR_BG_URL=http://localhost:3000/clip-player/sponsor-bg.jpg  # !tk 背景圖
```

---

## 歌名比對機制

| 結果 | 動作 |
|---|---|
| 信心度 ≥ 80% | 自動加入待唱歌單 |
| 信心度 < 80% | 加入待審核，附上建議比對結果 |
| 完全無比對 | 加入待審核，標題空白供手動輸入 |

---

## 小提醒

- 歌曲清單每 5 分鐘自動更新，新增歌曲不需重啟伺服器
- Twitch 連線自動續約，不需手動更新 Token
- `sponsor-voice.wav` / `sponsor-voice.mp3` 為伺服器自動產生，不需手動建立
