# Changelog / 更新紀錄

Versions are `YYYY.MM-W`: the year, the month (two digits) and which release weekend of that month it
is, counted by its Saturday. A hotfix between weekends adds `.N` (`2026.11-1.1`). The version shows in
the dashboard under 🎵 Song Queue → ⚙ Settings. Read **⚠ Action needed** before updating.

版本號是 `YYYY.MM-W`：年、月（兩位數），以及這是該月第幾個發佈週末（以週六算）。兩個週末之間的緊急修正
會加上 `.N`（`2026.11-1.1`）。目前的版本顯示在控制台「🎵 點歌佇列 → ⚙ 設定」。更新前請先看「⚠ 需要動手」。

---

## 2026.11-1 — 2026-11-08

The first official release. 第一個正式版本。

### 🚀 First time? / 第一次使用？

- 新手入門（從零開始，不需要會寫程式）：https://github.com/sheng7337/twitch-song-request-system/blob/v2026.11-1/docs/STARTER_GUIDE_zh_TW.md
- Starter Guide (English): https://github.com/sheng7337/twitch-song-request-system/blob/v2026.11-1/docs/STARTER_GUIDE.md

**Works with:** Node.js LTS · Leihu Singsing 1.6.x (checked with 1.6.8) · for modes, Streamlabs Desktop
or OBS Studio 30+.
**搭配**：Node.js LTS · 雷虎練唱台 1.6.x（以 1.6.8 確認過）· 模式需要 Streamlabs Desktop 或 OBS Studio 30 以上。

### ⚠ Action needed (only if you ran an earlier copy) / 需要動手（只有之前用過舊版的人）

- **Song list Browser Source:** set Height to **1470** (was 1362) and size it **480 × 735** in your
  scene. The overlay is now always the same height; at 1362 its bottom was cut off.
  **歌單瀏覽器來源**：高度改成 **1470**（原本 1362），在場景裡大小設為 **480 × 735**。顯示層現在高度固定；
  用 1362 時最下面會被切掉。
- **Twitch permissions:** if the 💬 Chat tab shows **Authorize again →**, do it once. Sending messages,
  moderation (ban / timeout / Shoutout / raid / pin) and redemptions need permissions older setups
  didn't ask for.
  **Twitch 權限**：如果 💬 聊天室分頁顯示「**重新授權 →**」，請做一次。發言、管理（封鎖／禁言／Shoutout／
  揪團／置頂）和兌換需要舊版沒有要求的權限。
- **Restart** the app (close it, run `start.bat` / `start_zh.bat` again) and refresh the dashboard.
  **重新啟動**程式（關掉後再執行 `start.bat`／`start_zh.bat`），並重新整理控制台。

### What's in it / 內容

**Song requests / 點歌**
- Channel-point song requests matched against your Google Sheet song list (exact, fuzzy, romanized and
  kana titles), with a random-song reward and a cooldown; songs not on the sheet wait in Pending Review.
  頻道點數點歌，比對 Google 試算表歌單（完全相同、模糊、羅馬拼音和假名歌名），附隨機點歌與冷卻；
  不在歌單上的歌先放在待審核。
- The queue survives a server restart mid-stream; sung songs are recorded to the history sheet.
  直播中重新啟動伺服器，佇列也不會不見；唱過的歌記錄到歷史試算表。
- YouTube links found for the song sheet, with a page to review them.
  替歌單找 YouTube 連結，並有確認用的頁面。

**Leihu Singsing / 雷虎練唱台**
- Queued songs linked to Leihu's backing tracks; **Sing** opens the song in Leihu at its key; the whole
  sheet can be prepared ahead; Leihu shows inside the dashboard.
  排隊的歌連到練唱台的伴奏；「**唱**」直接在練唱台打開那首歌和 KEY；可以事先準備整份歌單；練唱台顯示在控制台裡。

**Dashboard / 控制台**
- Tabs: 🎵 Song Queue, 🎤 Leihu Singsing, 💬 Chat, 🎛 Modes — in English and 繁體中文.
  分頁：🎵 點歌佇列、🎤 雷虎練唱台、💬 聊天室、🎛 模式 —— 英文與繁體中文。
- **Chat beside every tab:** live chat in a resizable panel on the right; search, filters and earlier
  days in the Chat tab.
  **每個分頁都看得到聊天室**：右邊可調寬度的即時聊天；搜尋、篩選和之前的日期在聊天室分頁。
- Chat tools: what to thank or greet on stream highlighted, sending and replying, ban / timeout /
  Shoutout / raid / pin, completing or refunding redemptions, song notes on the overlay.
  聊天室工具：標示要感謝或打招呼的事件、發言和回覆、封鎖／禁言／Shoutout／揪團／置頂、完成或退還兌換、
  疊加層上的歌曲註記。
- **Modes** (🎤 Singing / 💬 Talking / ☕ Break …): one click sets Streamlabs Desktop or OBS — scene, what
  shows, positions, sounds — and holds clips, posts in chat and opens a tab.
  **模式**（🎤 唱歌／💬 聊天／☕ 休息…）：按一下設定 Streamlabs Desktop 或 OBS —— 場景、顯示項目、位置、音訊
  —— 並暫停 Clip、在聊天室發言、切換分頁。

**Overlays and commands / 顯示層與指令**
- Song list overlay (960 × 1470), clip player for `!so`, `!watch`, `!tk`, the `!endingtk` ending roll,
  and a **休息中 / ON BREAK** card (`/overlay/break.html`, 960 × 260).
  歌單顯示層（960 × 1470）、`!so`、`!watch`、`!tk` 的 Clip 播放器、`!endingtk` 感謝名單，以及
  **休息中／ON BREAK** 卡片（`/overlay/break.html`，960 × 260）。

**Setup / 安裝**
- A setup wizard for Twitch, Google Sheets, rewards and OBS; a starter guide for newcomers.
  Twitch、Google 試算表、獎勵和 OBS 的安裝精靈；給新手的入門指南。
