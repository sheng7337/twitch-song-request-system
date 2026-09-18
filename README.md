# 🎵 VTuber 點歌系統

Twitch 頻道點數點歌，附 OBS 顯示層與連麥 Shoutout 功能。

---

## 開始使用

**首次安裝**：安裝 [Node.js LTS](https://nodejs.org)，然後雙擊 `start_zh.bat`，跟著瀏覽器的安裝精靈走即可。

**每次直播**：雙擊 `start_zh.bat`，就這樣。

> 完整說明請見 [SETUP_zh_TW.md](SETUP_zh_TW.md)

---

## OBS 瀏覽器來源

| 來源 | 網址 | 尺寸 |
|---|---|---|
| 歌單顯示層 | `http://localhost:3000/overlay/index.html` | 960×1362，縮小至 50% |
| Clip Player | `http://localhost:3000/clip-player/index.html` | 1920×1080 |

歌單顯示層 Custom CSS：
```css
body { background-color: rgba(0, 0, 0, 0) !important; margin: 0px auto; overflow: hidden; }
```

---

## 聊天指令（版主 / 台主限定）

| 指令 | 說明 |
|---|---|
| `!so <帳號>` | 播放指定頻道的隨機 Clip，並記錄至感謝名單 |
| `!tk` | 播放 Sponsor Roll，列出本場所有 `!so` 的頻道 |
| `!watch <網址>` | 播放 Twitch Clip、YouTube 或影片連結 |
| `!replay` | 重播上一個片段 |
| `!stop` | 立即停止當前播放 |
| `!sr <歌名>` | 觀眾點歌（需在 `.env` 設定 `CHAT_REQUEST_ENABLED=true`） |
