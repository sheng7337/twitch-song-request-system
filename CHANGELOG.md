# Changelog / 更新紀錄

版本號是 `YYYY.MM-W`：年、月（兩位數），以及這是該月第幾個發佈週末（以週六算）。兩個週末之間的緊急修正
會加上 `.N`（`2026.11-1.1`）。目前的版本顯示在控制台最上面的「**🎨 外觀與疊加層**」。更新前請先看「⚠ 需要動手」。

Versions are `YYYY.MM-W`: the year, the month (two digits) and which release weekend of that month it
is, counted by its Saturday. A hotfix between weekends adds `.N` (`2026.11-1.1`). The version shows in
the dashboard under **🎨 Look & overlays** (at the top). Read **⚠ Action needed** before updating.

---

## 2026.11-4 — unreleased

### 繁體中文

**搭配**：Node.js LTS · 雷虎練唱台 1.6.x–2.3.x（以 2.3.5 確認過）· 模式需要 Streamlabs Desktop 或 OBS Studio 30
以上 · 換裝需要 veadotube mini 2.1 以上。

#### ⚠ 需要動手

- **重新啟動**程式（關掉後再執行 `start.bat`／`start_zh.bat`），並重新整理控制台。
- 兌換項目的設定搬到新的「**🎟️ 兌換**」分頁；原本的設定都會保留，不用重設。
- 想讓片尾名單也感謝用在 Power-ups 的小奇點：控制台上方會出現權限提示，按「**重新授權 →**」，讓 Twitch 多給一項權限
  （讀取小奇點）。不授權也沒關係，其他都照常。

#### 新功能

- **🤖 聊天機器人（取代 Nightbot）**：新的「**🤖 機器人**」分頁可以設定自己的**指令**和**定時訊息**。
  - 指令：名稱和其他名稱、回覆內容、誰可以用（所有人／訂閱者以上／VIP 以上／管理員）、全體和每位觀眾的冷卻時間。
    回覆可以用 `$(user)` `$(touser)` `$(query)` `$(count)` `$(uptime)` `$(followage)` `$(sheet)`（歌單連結）
    `$(commands)` `$(pick a|b)` `$(random 1-100)` 等變數；「▶ 試試看」可以先看會說什麼，不會發出去。
  - 定時訊息：每幾分鐘發一次，可以設定「聊天室至少幾句」才發、只在直播中發；一次只發一則，間隔至少 2 分鐘。
  - 預設有 `!歌單`（歌單試算表連結）和 `!commands`。用你的 Twitch 帳號發言，只有程式開著時才會運作。
  - 設定好之後，**記得把 Nightbot 裡相同的指令和定時訊息關掉**，不然會發兩次。
- **🎭 情境點歌（AI 依心情選歌）**：觀眾兌換設成「🎭 情境點歌」的項目、寫下心情（例如「今天好寂寞」），
  Claude（Anthropic 的 AI）會從歌單挑一首，並寫一句要發到聊天室的話（中文和英文各一句）。**一定要你看過才會送出**：
  選好的歌在「待審核」等你，可以修改，按「✓ 加入佇列，發中文」或「發英文」才會加入佇列並把那一句發到聊天室；也可以「🔁 換一首」，或按 ✕ 退還點數。
  - 到「🎟️ 兌換」分頁把一個兌換項目設為「🎭 情境點歌」（記得在 Twitch 開啟「要求觀眾輸入文字」），並在下方輸入你的
    Anthropic API 金鑰（使用你自己的 Anthropic 帳號計費，每次選歌約 0.01–0.05 美元）。
  - 「🏷 幫歌曲標記心情」：Claude 讀雷虎練唱台裡的歌詞，幫每首歌記下心情，選歌會更準（整批半價，幾百首約 1–3 美元，做一次就好）。
  - 每次選歌都會記在 `mood-picks.jsonl`：觀眾寫的話、選了哪首、原因、花費，以及你發了中文、英文還是改過的那句，或退還了，
    方便直播後回顧。
- **⚠ 缺少 Twitch 權限的提示**：Twitch 授權是在某項功能加入之前做的，控制台上方會說明哪些功能因此無法使用，並提供「重新授權 →」。
- **🔊 統一 Clip 音量**：!so 和 !watch 的 Clip 會用差不多的音量播放：太小聲的調大、太大聲的調小，
  突然很大聲的片段（例如尖叫）會在播放時壓低。Clip 開始前只多等不到 0.1 秒。可以在「💬 聊天室 → ⚙ → Shoutout Clip」關閉。
  開啟後請在 OBS 重新調一次 Clip 播放器的音量。需要 ffmpeg（裝了雷虎練唱台就有）；沒有的話仍會壓低大聲的片段。
- **＋ 新增兌換項目**：在「🎟️ 兌換」分頁直接建立新的兌換項目（名稱、點數、用途、說明、是否要輸入文字）。
  由 App 建立，所以一建立就由點歌系統管理（可以完成和退還），不用再「交給點歌系統管理」。
- **🎟️ 兌換特效可以用兌換項目的圖示**：圖片可以選「🎟️ 兌換項目的圖示」，就是 Twitch 上那個項目的圖示（112 × 112；
  沒有自己的圖示就用 Twitch 預設的）。新加上特效的兌換項目會先用它，大小 10%（圖示很小，放大會糊）。原本的特效不會變。
  在 Twitch 換了圖示，特效也會跟著換。
- **🎟️ 兌換分頁**：頻道上每個兌換項目在這裡設定用途 ——「🎤 點歌」、「🎲 隨機點歌」（和要抽的歌單分頁）、「👕 換裝」或無 ——
  另外可以勾選「🎟️ 特效」，單獨使用或加在主要用途上（例如換裝時加一個音效）。完成和退還由主要用途決定。原本分散在「💬 聊天室 ⚙」
  （交給點歌系統管理）、「👕 換裝」（勾選會換裝的獎勵）和「🔔 通知」（加入兌換項目）的設定都搬到這裡。
  點歌、隨機點歌或換裝的項目如果沒辦法退還點數（還沒交給點歌系統管理，或在 Twitch 開了「略過獎勵請求佇列」），會顯示 ⚠ 和解決方法。
- **🎬 `!so` 播較新的 Clip**：以前只會從對方觀看次數最高的 20 個 Clip 裡挑，所以老是那幾個舊的；現在預設從最新的 50 個裡隨機挑。
  想用原本的方式，到聊天分頁 ⚙ →「**Shoutout 的 Clip**」選「觀看次數最高的 20 個」。
- **📋 練習分頁和每個兌換項目的分頁**：「🎵 點歌佇列 → ⚙ → 歌單分頁」改成選一個「**練習分頁**」（原本取消勾選的那個，
  會自動帶過來）：待審核的「＋ 加入」加到這裡，這裡的歌不會被點或抽到，但**雷虎練唱台的「全部準備」和 🔗 連結搜尋現在也會處理它們**，
  練歌時伴奏已經準備好。🎤 點歌可以用哪些分頁，現在和 🎲 一樣在「🎟️ 兌換」分頁勾選（都不勾 = 練習分頁以外全部）。
- **🎤 忘了切唱歌模式的提醒**：雷虎練唱台在不是唱歌的模式下播放歌曲時（例如聊天模式的 BGM 還開著），控制台最上面會出現提醒和
  「**切到 🎤 唱歌**」按鈕；按了才會切換，直播畫面不會自己改變。哪些模式算唱歌，在「🎛 模式」→ 編輯 →「**🎤 唱歌用**」設定；
  原本會暫停 Clip 的模式預設勾選。需要雷虎練唱台 1.4.3 以上。
- **📱 提詞機：在平板上看歌詞和聊天室**：給防噴罩擋住螢幕時用。平板或手機（和電腦連同一個 Wi-Fi）開 `http://<這台電腦>:3000/prompter`，
  會顯示雷虎練唱台正在播的歌詞（跟著唱的位置上色）、歌曲進度條和聊天室；直放時聊天室在下面，橫放時在右邊。
  歌詞和聊天室的字可以各自放大縮小，也可以隱藏聊天室。只是顯示，不會改到雷虎練唱台或直播。網址在「🎤 雷虎練唱台 → ⚙」。

#### 修正

- 一個兌換項目同時有特效和其他功能時，兩邊都可能標成完成或退還，互相蓋掉。現在只有主要用途會處理。
- 交給點歌系統管理的項目，換裝和特效的設定現在也會跟著換到複本（之前只有點歌和隨機點歌會）。
- 手機上的分頁列改成可以左右滑動，不會把分頁名稱擠成直的。
- 暫停清單、🤖 定時訊息、🔔 通知和 🎭 標記心情的時間，現在跟著控制台的語言顯示（之前跟著 Windows 的語言）。
- 🎭 情境點歌在片尾名單算點歌（之前算在兌換），聊天室也不會再把它標成要感謝的兌換。
- 揪團次數用完時，現在會說明 Twitch 每 10 分鐘只能揪團 10 次（被拒絕的也算），而不是只說「操作太頻繁」；被拒絕的揪團也會記在紀錄裡。
- 雷虎練唱台排隊的工作很多時（例如直播中它暫停背景處理），排在第 30 個以後的歌在歌單卡片上會顯示成失敗；現在只有雷虎練唱台
  真的回報錯誤才算失敗，其他都顯示處理中。
- 雷虎練唱台 2.3.1 起，YouTube 下載預設關閉：點歌系統會說明怎麼開啟（在雷虎練唱台 3 秒內點左上角標題五下），開啟前不會匯入，
  歌也不會被標成失敗。
- `!endingtk` 片尾名單：贈送訂閱的觀眾在「感謝訂閱」的名字後面會標出送了幾份（🎁×5）；收到的觀眾一樣列在「感謝訂閱」。
- `!endingtk` 片尾名單：用在 Power-ups（訊息特效、放大表情、慶祝特效）和連擊的小奇點，現在也算進「感謝小奇點」
  （之前只算聊天室裡的 Cheer）。需要重新授權一次，見上面。
- 🛡 管理 → 🚀 揪團：確認改成一個清楚的框，寫出要揪到哪裡（是否直播中、幾位觀眾、片尾名單何時播），下面有「**🚀 確定出發**」和「**先不要**」；
  之前是按鈕本身變成問句，看不出要再按一次。

### English

**Works with:** Node.js LTS · Leihu Singsing 1.6.x–2.3.x (checked with 2.3.5) · for modes, Streamlabs
Desktop or OBS Studio 30+ · for outfits, veadotube mini 2.1+.

#### ⚠ Action needed

- **Restart** the app (close it, run `start.bat` / `start_zh.bat` again) and refresh the dashboard.
- Reward settings moved to the new **🎟️ Rewards** tab; what you had set up is kept, nothing to redo.
- For the ending roll to thank Bits spent on Power-ups: press **Authorize again →** in the permission notice at the
  top of the dashboard, so Twitch gives one more permission (reading Bits). Without it everything else works as before.

#### What's new

- **🤖 Chat bot (instead of Nightbot)**: the new **🤖 Bot** tab sets up your own **commands** and **timers**.
  - Commands: a name and other names, the reply, who may use it (everyone / subscribers and up / VIPs and up /
    mods), and a cooldown for everyone and for each viewer. Replies can use `$(user)` `$(touser)` `$(query)`
    `$(count)` `$(uptime)` `$(followage)` `$(sheet)` (the song list link) `$(commands)` `$(pick a|b)`
    `$(random 1-100)`; **▶ Try** shows what it would say without posting it.
  - Timers: a message every so many minutes, optionally only after enough chat lines and only while live; one at a
    time, at least 2 minutes apart.
  - `!歌單` (the song sheet link) and `!commands` come ready. It posts as your Twitch account, only while the app runs.
  - Once it's set up, **turn the same commands and timers off in Nightbot**, or chat gets them twice.
- **🎭 Mood requests (情境點歌, AI picks a song for a mood)**: a viewer redeems a reward set to 🎭 and writes how
  they feel ("I'm feeling lonely today"); Claude (Anthropic's AI) picks one song from your list and writes a line for
  chat, in 中文 and in English. **Nothing goes out before you've seen it**: the pick waits in Pending Review, where you
  can change the lines and press **✓ Queue + post 中文** or **English** to queue the song and post that line, **🔁 Another** for a different song, or ✕ to refund.
  - In the **🎟️ Rewards** tab, set a reward to 🎭 Mood request (turn on "Require Viewer to Enter Text" for it on
    Twitch) and enter your Anthropic API key below the list (billed to your own Anthropic account, about
    US$0.01–0.05 per pick).
  - **🏷 Tag songs by mood**: Claude reads the lyrics in Leihu Singsing and notes each song's moods, for better picks
    (one batch at half price, roughly US$1–3 for a few hundred songs, once).
  - Every pick is written to `mood-picks.jsonl`: the viewer's words, the song, why, what it cost, and whether you
    sent the 中文, English or a changed line, or refunded it, to look back on after a stream.
- **⚠ Missing Twitch permissions notice**: when the Twitch authorization is older than a feature that needs it, the
  top of the dashboard says which features can't work and offers **Authorize again →**.
- **🔊 Even clip volume**: clips from !so and !watch play at about the same volume — quiet ones turned up,
  loud ones down, and loud moments (a scream) turned down as they play. A clip starts less than 0.1 s later.
  Turn it off in 💬 Chat → ⚙ → Shoutout clips. Set the clip player's volume in OBS once after updating.
  Needs ffmpeg (there with Leihu Singsing); without it, loud moments are still turned down.
- **＋ New reward**: create a reward right in the **🎟️ Rewards** tab (name, points, use, description, whether
  viewers type something). The app makes it, so the app manages it from the start (done and refund) — no
  taking over needed.
- **🎟️ Reward effects can show the reward's icon**: pick "🎟️ The reward's icon" as the picture: the reward's icon
  on Twitch (112 × 112; Twitch's standard one when it has none). A reward that gets an effect now starts with it,
  at 10 % (the icon is small and blurs when larger). Existing effects stay as they are. Change the icon on Twitch
  and the effect follows.
- **🎟️ Rewards tab**: every reward on your channel gets its use here — 🎤 song request, 🎲 random song (and the
  sheet tabs it draws from), 👕 outfit or none — and a 🎟️ Effect tick, on its own or on top of the main use (e.g.
  an outfit change with a sound). The main use decides done and refund. What was spread over 💬 Chat ⚙ (handing
  rewards over), 👕 Outfits (ticking outfit rewards) and 🔔 Alerts (adding a reward) is all here now. A song,
  random-song or outfit reward that can't give points back (not handed over yet, or “Skip Reward Requests Queue”
  on at Twitch) shows a ⚠ with how to fix it.
- **🎬 `!so` plays newer clips**: it used to pick from the broadcaster's 20 most-viewed clips only, so the same old
  ones kept coming up; now it picks at random from their newest 50 by default. For the old way, Chat tab ⚙ →
  **Shoutout clips** → **The 20 most viewed**.
- **📋 A practice tab, and tabs per reward**: 🎵 Song Queue → ⚙ → Sheet tabs now picks one **practice tab** (the tab
  you had unticked carries over): Pending's "＋ Add to" adds there, and its songs can't be requested or drawn, but
  **Leihu's "Prepare all" and the 🔗 link finder now take them too**, so the backing track is ready when you practise.
  Which tabs 🎤 song requests take is now ticked in the 🎟️ Rewards tab, like 🎲 (none = every tab but the practice tab).
- **🎤 A reminder when you forget the singing mode**: when Leihu plays a song while the mode on isn't a singing one
  (e.g. a talking mode's BGM still on), a banner at the top of the dashboard says so, with **Switch to 🎤 Sing**;
  nothing on stream changes until you click. Which modes are for singing: 🎛 Modes → Edit → **🎤 For singing**,
  ticked by default on modes that hold clips. Needs Leihu 1.4.3+.
- **📱 Prompter: lyrics and chat on a tablet**: for when a mic shield hides the screen. On a tablet or phone on the
  same Wi-Fi, open `http://<this PC>:3000/prompter`: Leihu's lyrics as they play (filled as you sing), the song's
  progress and the chat — below in portrait, beside in landscape. Lyrics and chat each have their own text size, and
  the chat can be hidden. It only shows; nothing on it changes Leihu or the stream. Its address: 🎤 Leihu → ⚙.

#### Fixes

- A reward with an effect and another use could be marked done by one and refunded by the other. Now only the
  main use does.
- Times in the held list, 🤖 timers, 🔔 alerts and 🎭 mood tagging now follow the dashboard's language (before,
  Windows' language).
- 🎭 Mood requests count as song requests on the ending roll (before, as redemptions), and the Chat tab no longer
  marks them as redemptions to thank.
- When raids run out, the dashboard now says Twitch allows 10 raid tries per 10 minutes, refused ones included
  (before, just "too many requests"). Refused raids are also written to the log.
- A reward handed over to the app now keeps its outfit and effect settings on the copy too (before, only song
  request and random song did).
- On a phone the tab bar scrolls sideways instead of squeezing the tab names into a column.
- With many jobs waiting in Leihu (e.g. while it pauses background work during a stream), songs past the 30th
  showed as failed on the queue cards; now only an error Leihu reports counts as failed, the rest show processing.
- From Leihu 2.3.1, YouTube downloads start off: the song queue says how to turn them on (click Leihu's title, top
  left, five times within 3 seconds); until then nothing is imported, and songs aren't marked failed.
- `!endingtk` ending roll: a viewer who gifted subs shows how many after their name under Subscribers (🎁×5);
  the viewers they gifted are listed there too.
- `!endingtk` ending roll: Bits spent on Power-ups (message effects, gigantified emotes, celebrations) and combos now
  count under Cheers (before, only cheers in chat did). Needs authorizing once more, see above.
- 🛡 Moderate → 🚀 Raid: the confirmation is now a clear box saying where the viewers go (live or not, viewers,
  when the ending roll plays), with **🚀 Raid now** and **Not now**; before, the button itself turned into a
  question, and nothing said to click it again.

---

## 2026.11-3 — 2026-11-23

### 繁體中文

**搭配**：Node.js LTS · 雷虎練唱台 1.6.x–2.0.x（以 2.0.0 確認過）· 模式需要 Streamlabs Desktop 或 OBS Studio 30
以上 · 換裝需要 veadotube mini 2.1 以上。

#### ⚠ 需要動手

- **重新啟動**程式（關掉後再執行 `start.bat`／`start_zh.bat`），並重新整理控制台。
- 從 **TriggerFyre** 換成 🎟️ 兌換特效：把音效和圖片存到 `alert-media`，設定好兌換項目，再到 TriggerFyre 把每一個關掉 ——
  否則會播兩次。
- 通知是選用的：加入它的瀏覽器來源之前，直播畫面上不會多出任何東西。如果你同時保留 Streamlabs 的 Alert Box
  （或其他通知服務），請把其中一個靜音或隱藏，否則每則通知會出現兩次。

#### 新功能

- **🔔 直播畫面上的通知**（`/overlay/alerts.html`），取代 Streamlabs 的 Alert Box：追隨、訂閱、贈訂、小奇點和揪團，
  一次一則，用疊加層的主題和語言；一次送出多份訂閱只顯示一則。在新的「**🔔 通知**」分頁，每一種都可以設定開關、
  最低門檻、顯示多久、`alert-media` 資料夾裡的圖片／GIF／影片和音效（或內建的提示音；全部共用一個「**🔊 預設音效**」，
  也可以各自選；每個音效檔播放時會自動調成一樣大聲），以及到達一定數量時的**大型通知**（例如 50 人以上的揪團）。
  「**▶ 測試**」只在直播畫面上顯示一則假的通知；「**↻ 重播**」再顯示一次最近的通知。兩種版面 —— 圖在上（800 × 600）
  或圖在左（1600 × 300）—— 都列在「🎨 外觀與疊加層」，可以「**複製**」。
- **🎟️ 兌換特效**（`/overlay/reward-effects.html`，在「🔔 通知」分頁），取代 TriggerFyre：頻道點數兌換時播放音效（放好幾個 =
  每次隨機一個）、放在你指定位置的圖片／GIF／影片，或兩者都有，也可以顯示兌換的人。播完 → 兌換標成完成；關閉、跳過、
  排隊超過 20 個或清除 → 退還點數。可以依序播放、一起播放（最多 3 個）或跳過新的。「**⏸ 暫停**」—— 或勾選「**🎟️ 這個模式時
  暫停兌換特效**」的模式（新的 🎤 唱歌模式預設勾選）—— 會讓兌換先排隊。
- **⏸ 等待中的 Clip 看得到了**：模式暫停 Clip（例如 🎤 唱歌）時，`!so`、`!watch`、`!tk`、`!endingtk` 會等到切換模式；
  現在最上面一列會顯示「**⏸ N 個等待中**」，按一下可以「**▶ 現在播放**」或「**✕ 不播**」（`!tk` 的名單會放回去）。
  模式按鈕上的 ⏸ 拿掉了。之前在唱歌時打 `!tk`，感謝名單會默默等到換模式才播，再打一次 `!tk` 還會說名單是空的。
- **📂 回報問題用的紀錄**：每次啟動都會把黑色視窗的內容存到 `logs/`，每次一個以日期時間命名的資料夾（`app.log`，點歌系統
  啟動雷虎練唱台時還有 `leihu.log`），token 和密碼會被遮掉。保留最近 30 次啟動，以及 14 天內的全部。「🎨 外觀與疊加層」→
  「**📂 這次執行的紀錄**」會打開目前這個。

#### 修正

- 直播中切換主題時，疊加層的文字可能變成亂碼（例如咖啡主題的「正在演唱」歌名），要再切一次才恢復：現在每個主題的字型
  只載入一次並保留，不再替換。
- 直播或網路斷線時：
  - 直播斷線 15 分鐘內恢復（Twitch 會開新的直播和 VOD）時，聊天室分頁的「**要宣讀**」會保留，斷線前的追隨、訂閱、
    揪團不會再消失。
  - 和 Twitch 斷線期間兌換的頻道點數（本系統建立的獎勵），連線恢復後會補收，不會停在 Twitch 的佇列裡沒人看到。
  - 沒有關閉、只是沒有回應的連線會在 15 秒內發現並重新連線；恢復時只訂閱到一部分（少了聊天室）的連線會重來，
    不會一直收不到直到重新啟動。
  - 點歌紀錄寫入失敗時會一直重試到試算表收到為止，不會遺失。

#### 說明文件

- 安裝說明：通知和兌換特效的瀏覽器來源要勾選「**透過 OBS 控制音訊**」，聲音才會出現在混音器、跟著來源的音量和靜音，
  並進到直播。
- 安裝說明：雷虎練唱台的聲音用「應用程式音訊擷取」時，如果人聲一下比音樂快、一下比音樂慢，有新的疑難排解（改擷取
  輸出裝置、錄音介面的硬體虛擬輸出或虛擬音訊線）。

### English

**Works with:** Node.js LTS · Leihu Singsing 1.6.x–2.0.x (checked with 2.0.0) · for modes, Streamlabs
Desktop or OBS Studio 30+ · for outfits, veadotube mini 2.1+.

#### ⚠ Action needed

- **Restart** the app (close it, run `start.bat` / `start_zh.bat` again) and refresh the dashboard.
- Moving from **TriggerFyre** to 🎟️ reward effects: save your sounds and pictures into `alert-media`, set the
  rewards up, then turn each one off in TriggerFyre — or it plays twice.
- Alerts are optional: nothing new shows on stream until you add their Browser Source. If you keep
  Streamlabs' Alert Box (or another alert service) too, mute or hide one of them, or each alert shows twice.

#### What's new

- **🔔 Alerts on stream** (`/overlay/alerts.html`), instead of Streamlabs' Alert Box: follows, subs, gift
  subs, cheers and raids, one at a time, in the overlay theme and language; a gift of several subs is one
  alert. In the new **🔔 Alerts** tab each kind has on / off, a minimum, how long it shows, a picture / GIF /
  video and a sound from the `alert-media` folder (or a built-in chime; one **🔊 default sound** for all of
  them, unless a kind picks its own; every sound file is evened out to the same loudness as it plays), and a
  **big version** from an amount up (e.g. raids from 50 viewers). **▶ Test** shows a made-up alert on stream
  only; **↻ Replay** shows a recent one again. Two layouts — picture above (800 × 600) or on the left
  (1600 × 300) — both listed under 🎨 Look & overlays with **Copy**.
- **🎟️ Reward effects** (`/overlay/reward-effects.html`, in the 🔔 Alerts tab), instead of TriggerFyre: a
  channel-point reward plays a sound (several = one at random), a picture / GIF / video where you put it, or
  both, and can show who redeemed it. Played → the redemption is marked done; turned off, skipped, past 20
  waiting or cleared → refunded. One after the other, together (up to 3) or skip the new one. **⏸ Pause** — or a
  mode with **🎟️ Pause reward effects** (new 🎤 singing modes have it) — keeps them waiting.
- **⏸ Held clips you can see**: while a mode holds clips (e.g. 🎤 singing), `!so`, `!watch`, `!tk` and `!endingtk` wait
  for the next mode; the top bar now shows **⏸ N waiting**, with **▶ Play now** and **✕ Drop** (a `!tk` roll's names go
  back on the list). The ⏸ on the mode button is gone. Before, a `!tk` while singing waited silently until the mode
  changed, and a second `!tk` said the list was empty.
- **📂 Logs for bug reports**: every start now saves what the black window shows in `logs/`, one folder per
  start named by date and time (`app.log`, plus `leihu.log` when the song queue starts Leihu), with tokens and
  passwords blanked. The last 30 starts and anything from the last 14 days are kept. 🎨 Look & overlays →
  **📂 This run's logs** opens the current one.

#### Fixes

- Changing the theme while an overlay is on stream could garble its text (e.g. the now-playing title in Coffee)
  until the next switch: each theme's fonts now load once and stay, instead of being swapped.
- When the stream or the network drops:
  - A stream that drops and is back within 15 minutes (Twitch starts a new broadcast and VOD) keeps
    the Chat tab's **To announce**: followers, subs and raids from before the drop no longer disappear.
  - Channel-point redemptions made while the connection to Twitch was down are picked up when it's back
    (rewards the app made), instead of waiting unseen in Twitch's queue.
  - A connection that goes quiet without closing is noticed within 15 seconds and made again, and one
    that comes back only partly subscribed (chat missing) starts over, instead of staying deaf until a restart.
  - A request-history write that fails is tried again until the sheet takes it, instead of being lost.

#### Docs

- Setup: tick **Control audio via OBS** on the alerts and reward-effects Browser Sources, so their sound is in
  the mixer, follows the source's volume and mute, and reaches the stream.
- Setup: new troubleshooting for the voice drifting ahead of and behind the music when Leihu's sound comes in
  through Application Audio Capture (capture an output device, an audio interface's virtual output or a
  virtual cable instead).

---

## 2026.11-2 — 2026-11-15

### 繁體中文

**搭配**：Node.js LTS · 雷虎練唱台 1.6.x–2.0.x（以 2.0.0 確認過）· 模式需要 Streamlabs Desktop 或 OBS Studio 30
以上 · 換裝需要 veadotube mini 2.1 以上。

#### ⚠ 需要動手

- **重新啟動**程式（關掉後再執行 `start.bat`／`start_zh.bat`），並重新整理控制台。
- 在 OBS／Streamlabs 把每個**瀏覽器來源重新整理**一次（內容 →「**重新整理目前頁面的快取**」）：歌單、休息卡和
  Clip 播放器要載入新的主題檔案。在你選別的主題之前，看起來都和原本一樣。
- 疊加層的面板不透明度、亮度和語言從「🎵 點歌佇列 → ⚙」移到最上面的「**🎨 外觀與疊加層**」；原本的數值不變。新功能都是
  選用的：其他什麼都不用改。
- 終端機版安裝精靈（`setup.bat`／`setup.ps1`、`setup_zh.*`）已移除：請用網頁版精靈（`start_zh.bat` 會開啟）或
  [SETUP_MANUAL.md](SETUP_MANUAL.md)。你的 `.env` 不受影響；資料夾裡留下的舊檔案可以刪掉。

#### 新功能

- **🎨 主題和文字大小**（最上面、EN／中文旁邊的「**🎨 外觀與疊加層**」）：五個主題 ——「**霓虹**」（原本的樣子）、「**日光**」、
  「**高對比**」、「**海洋**」、「**奶油咖啡**」—— 控制台和疊加層分開選；控制台的文字大小（85–140%，每個瀏覽器和
  手機都一樣）、歌單和休息卡的文字大小。疊加層立刻改變，在 OBS 裡的大小不變；疊加層網址加上 `?theme=…`
  可以單獨用別的主題。
- **💬 直播畫面上的聊天室**（`/overlay/chat.html`），取代 OneComme：四種樣式（面板、對話泡泡、簡單列表、橫向一排）、
  Twitch 徽章和表情符號、兌換和訂閱／贈訂／揪團／追隨；被刪除的訊息和被封鎖的觀眾會立刻消失。用過 OneComme 的模式
  會提供「**選擇替代…**」。
- **👕 換裝**（veadotube mini）：觀眾兌換獎勵後會跳出卡片（雷虎練唱台分頁不會跳），點一下要穿的衣服；兌換會自動
  完成，或退還。可以設定預設服裝（☆）和「**N 分鐘後換回預設服裝**」。
- **🚀 搭配片尾名單揪團**：🛡 管理 → 揪團，勾選「**🎬 搭配片尾名單**」會播 `!endingtk` 的片尾名單，名單結束 10 秒後
  出發。取消揪團，或這段期間有人揪團過來，兩個都會停止。
- 開場用的「**準備中／STARTING SOON**」卡片（`/overlay/break.html?card=opening`）；兩種卡片都可以用 `?min=10` 或
  `?at=20:00` 倒數。
- **歌單分頁和抽歌方式改在控制台設定**（🎵 點歌佇列 → ⚙）：勾選哪些分頁可以點歌，選擇加權或完全隨機 —— 不用再改 `.env`。
- **授權**：點歌系統現在以 [MIT 授權](LICENSE) 釋出。

#### 修正

- 同名但不同歌手的兩首歌，現在各自有自己的點歌紀錄（上次被點、被誰點、隨機點歌冷卻）。之前點其中一首會算到另一首；
  歷史試算表裡已經混在一起的舊紀錄不會改變。
- 點歌和隨機點歌的兌換不會再出現在 💬 聊天室分頁的「要宣讀」（歌單裡已經有了）。
- 停止 Clip 後馬上播的感謝名單不會再被清掉。
- 控制台的雷虎練唱台分頁現在會用它設定裡選的輸出裝置播放，和它自己的視窗一樣。之前瀏覽器不允許，雷虎練唱台只能用
  Windows 預設裝置播放。如果在雷虎練唱台分頁唱歌時，直播上的歌聲會稍微落後音樂（在它自己的視窗不會），這應該能修正。
- 切換 EN／中文時，最上面的雷虎練唱台狀態不會再暫時顯示成未開啟。
- 在手機上控制台不會超出畫面：最上面一列和手動點歌列會換行，很長的歌名也不會讓頁面變寬。

#### 雷虎練唱台 2.0

照常運作。它新的全域快捷鍵屬於雷虎練唱台自己的視窗：從控制台啟動（「**▶ 啟動雷虎練唱台**」）時沒有作用，而且控制的是
雷虎練唱台的視窗，不是控制台的雷虎練唱台分頁。

### English

**Works with:** Node.js LTS · Leihu Singsing 1.6.x–2.0.x (checked with 2.0.0) · for modes, Streamlabs
Desktop or OBS Studio 30+ · for outfits, veadotube mini 2.1+.

#### ⚠ Action needed

- **Restart** the app (close it, run `start.bat` / `start_zh.bat` again) and refresh the dashboard.
- **Refresh each Browser Source** in OBS / Streamlabs once (its properties → **Refresh cache of current
  page**): the song list, break card and clip player load the new theme files. They look as before until
  you pick another theme.
- The overlays' panel opacity, brightness and language moved from 🎵 Song Queue → ⚙ to **🎨 Look & overlays**
  at the top; your values stay. Everything new is optional: nothing else to change.
- The terminal setup wizard (`setup.bat` / `setup.ps1`, `setup_zh.*`) is gone: use the web wizard
  (`start.bat` opens it) or [SETUP_MANUAL.md](SETUP_MANUAL.md). Your `.env` stays as it is; the old
  files left in your folder can be deleted.

#### What's new

- **🎨 Themes and text sizes** (**🎨 Look & overlays** at the top, beside EN / 中文): five themes — **Neon** (the original),
  **Daylight**, **High contrast**, **Ocean**, **Cream & coffee** — chosen apart for the dashboard and the
  overlays; the dashboard's text size (85–140%, the same on every browser and phone), the song list's and
  the break card's. Overlays change at once and keep their size in OBS; `?theme=…` on an overlay URL gives
  it its own theme.
- **💬 Chat on stream** (`/overlay/chat.html`), instead of OneComme: four styles (panel, bubbles, plain
  lines, one row), Twitch badges and emotes, redemptions and subs / gifts / raids / follows; deleted
  messages and banned viewers leave at once. Modes that used OneComme offer **Pick a replacement…**.
- **👕 Outfits** with veadotube mini: viewers redeem a reward, a card pops up (not over the Leihu tab) and
  you click the outfit to wear; the redemption is completed, or refunded. A default outfit (☆) and
  **Back to the default after N minutes**.
- **🚀 Raid with the ending roll**: 🛡 Moderate → Raid with **🎬 With the ending roll** plays the
  `!endingtk` roll so the raid goes 10 seconds after it ends. Cancel, or someone raiding you meanwhile,
  stops both.
- **準備中 / STARTING SOON** card for the opening (`/overlay/break.html?card=opening`); both cards count
  down with `?min=10` or `?at=20:00`.
- **Sheet tabs and random pick in the dashboard** (🎵 Song Queue → ⚙): tick which tabs viewers can request,
  and choose weighted or pure random — no more editing `.env`.
- **License:** the song queue is now released under the [MIT License](LICENSE).

#### Fixes

- Two songs with the same title by different artists now each keep their own request history (last
  requested, by whom, the random cooldown). Before, requesting one updated the other's; past requests
  already mixed in the history sheet stay as they are.
- Song-request and random-song redemptions no longer show as "to announce" in the 💬 Chat tab (the queue
  already has them).
- Stopping a clip no longer blanks a sponsor roll that starts right after it.
- In the dashboard's Leihu tab, Leihu now plays on the output device chosen in its settings, like its own
  window. Before, the browser refused that and Leihu played on Windows' default device. If the singing on
  stream fell slightly behind the music in the Leihu tab (but not in Leihu's own window), this should fix it.
- Switching EN / 中文 no longer shows the top bar's Leihu as offline until the next check.
- On a phone the dashboard fits the screen: the top bar and the manual request bar wrap, and a long song
  title no longer makes the page wider than the screen.

#### Leihu Singsing 2.0

Works as before. Its new global hotkeys belong to Leihu's own window: they don't work when Leihu is
started from the dashboard (**▶ Start Leihu**), and act on Leihu's window, not the dashboard's Leihu tab.

---

## 2026.11-1 — 2026-11-08

### 繁體中文

第一個正式版本。

#### 🚀 第一次使用？

- 新手入門（從零開始，不需要會寫程式）：https://github.com/sheng7337/twitch-song-request-system/blob/v2026.11-1/docs/STARTER_GUIDE_zh_TW.md

**搭配**：Node.js LTS · 雷虎練唱台 1.6.x（以 1.6.8 確認過）· 模式需要 Streamlabs Desktop 或 OBS Studio 30 以上。

#### ⚠ 需要動手（只有之前用過舊版的人）

- **歌單瀏覽器來源**：高度改成 **1470**（原本 1362），在場景裡大小設為 **480 × 735**。顯示層現在高度固定；
  用 1362 時最下面會被切掉。
- **Twitch 權限**：如果 💬 聊天室分頁顯示「**重新授權 →**」，請做一次。發言、管理（封鎖／禁言／Shoutout／
  揪團／置頂）和兌換需要舊版沒有要求的權限。
- **重新啟動**程式（關掉後再執行 `start.bat`／`start_zh.bat`），並重新整理控制台。

#### 內容

**點歌**
- 頻道點數點歌，比對 Google 試算表歌單（完全相同、模糊、羅馬拼音和假名歌名），附隨機點歌與冷卻；
  不在歌單上的歌先放在待審核。
- 直播中重新啟動伺服器，佇列也不會不見；唱過的歌記錄到歷史試算表。
- 替歌單找 YouTube 連結，並有確認用的頁面。

**雷虎練唱台**
- 排隊的歌連到練唱台的伴奏；「**唱**」直接在練唱台打開那首歌和 KEY；可以事先準備整份歌單；練唱台顯示在控制台裡。

**控制台**
- 分頁：🎵 點歌佇列、🎤 雷虎練唱台、💬 聊天室、🎛 模式 —— 英文與繁體中文。
- **每個分頁都看得到聊天室**：右邊可調寬度的即時聊天；搜尋、篩選和之前的日期在聊天室分頁。
- 聊天室工具：標示要感謝或打招呼的事件、發言和回覆、封鎖／禁言／Shoutout／揪團／置頂、完成或退還兌換、
  疊加層上的歌曲註記。
- **模式**（🎤 唱歌／💬 聊天／☕ 休息…）：按一下設定 Streamlabs Desktop 或 OBS —— 場景、顯示項目、位置、音訊
  —— 並暫停 Clip、在聊天室發言、切換分頁。

**顯示層與指令**
- 歌單顯示層（960 × 1470）、`!so`、`!watch`、`!tk` 的 Clip 播放器、`!endingtk` 感謝名單，以及
  **休息中／ON BREAK** 卡片（`/overlay/break.html`，960 × 260）。

**安裝**
- Twitch、Google 試算表、獎勵和 OBS 的安裝精靈；給新手的入門指南。

### English

The first official release.

#### 🚀 First time?

- Starter Guide (English): https://github.com/sheng7337/twitch-song-request-system/blob/v2026.11-1/docs/STARTER_GUIDE.md

**Works with:** Node.js LTS · Leihu Singsing 1.6.x (checked with 1.6.8) · for modes, Streamlabs Desktop
or OBS Studio 30+.

#### ⚠ Action needed (only if you ran an earlier copy)

- **Song list Browser Source:** set Height to **1470** (was 1362) and size it **480 × 735** in your
  scene. The overlay is now always the same height; at 1362 its bottom was cut off.
- **Twitch permissions:** if the 💬 Chat tab shows **Authorize again →**, do it once. Sending messages,
  moderation (ban / timeout / Shoutout / raid / pin) and redemptions need permissions older setups
  didn't ask for.
- **Restart** the app (close it, run `start.bat` / `start_zh.bat` again) and refresh the dashboard.

#### What's in it

**Song requests**
- Channel-point song requests matched against your Google Sheet song list (exact, fuzzy, romanized and
  kana titles), with a random-song reward and a cooldown; songs not on the sheet wait in Pending Review.
- The queue survives a server restart mid-stream; sung songs are recorded to the history sheet.
- YouTube links found for the song sheet, with a page to review them.

**Leihu Singsing**
- Queued songs linked to Leihu's backing tracks; **Sing** opens the song in Leihu at its key; the whole
  sheet can be prepared ahead; Leihu shows inside the dashboard.

**Dashboard**
- Tabs: 🎵 Song Queue, 🎤 Leihu Singsing, 💬 Chat, 🎛 Modes — in English and 繁體中文.
- **Chat beside every tab:** live chat in a resizable panel on the right; search, filters and earlier
  days in the Chat tab.
- Chat tools: what to thank or greet on stream highlighted, sending and replying, ban / timeout /
  Shoutout / raid / pin, completing or refunding redemptions, song notes on the overlay.
- **Modes** (🎤 Singing / 💬 Talking / ☕ Break …): one click sets Streamlabs Desktop or OBS — scene, what
  shows, positions, sounds — and holds clips, posts in chat and opens a tab.

**Overlays and commands**
- Song list overlay (960 × 1470), clip player for `!so`, `!watch`, `!tk`, the `!endingtk` ending roll,
  and a **休息中 / ON BREAK** card (`/overlay/break.html`, 960 × 260).

**Setup**
- A setup wizard for Twitch, Google Sheets, rewards and OBS; a starter guide for newcomers.

