# 🎵 Song Queue

**English** · [繁體中文](queue_zh_TW.md) · [All pages](../README.md)

The songs viewers requested, in four panels: **Now Playing** above **Up Next** on the left, **Pending Review**
above **Played** on the right. The song overlay on stream shows the same list.

## Set up once

- The song list comes from your Google sheet ([SETUP → Google Sheets](../../SETUP.md#google-sheets-setup)).
  It reloads every 5 minutes, so new songs need no restart.
- Which tabs of the sheet each reward takes is set in [🎟️ Rewards](rewards.md).
- ⚙ → **Sheet tabs** → **Practice tab**: songs there can't be requested or drawn, but Leihu Singsing still
  prepares them, so a song you're practising has its backing track ready. Pending Review's **＋ Add to** adds there.

## During a stream

| To… | Do this |
|---|---|
| Finish a song | **✓ Finished** on Now Playing: it moves to Played and the next one comes up |
| Change the order | Drag the cards, within a panel or between panels |
| Remove a request | **✕** (the viewer's points are refunded) |
| Add a song yourself | The request bar: type a title, no channel points needed |
| Re-roll a random pick | **🎲** draws another from the same tabs |

Each card shows when the song was last requested and by whom, its key (**+3**, **−2**…), and its
Leihu Singsing state (**♫**, see [🎤 Leihu Singsing](leihu.md)).

**Pending Review** holds requests the app wasn't sure about:

| How sure | What happens |
|---|---|
| 80% or more | Queued at once |
| Less than 80% | Pending Review, with its best guess |
| No match | Pending Review, blank for you to fill in |

Fix the title and press **✓ Accept → Queue**, or **✕** to refund. For a song that isn't on your sheet,
**🔍 Find** searches lyric sites and YouTube (Leihu Singsing must be running), then **▶ Queue + prepare** or
**＋ Add to** the practice tab with its link. 🎭 mood requests wait here too, until you send them
([🎭 Mood requests](../features/mood-requests.md)).

**Points:** a song request is marked done when you press ✓ Finished (or drag the song to Played), and
refunded when you remove it from the queue or from Pending Review. **✕ Clear All** leaves the redemptions
waiting, so 💬 Chat → *Waiting redemptions* finds them. This works for rewards the app manages
([🎟️ Rewards](rewards.md)).

## ⚙ Settings

- **Sheet tabs**: the practice tab (above).
- **Random cooldown**: songs sung within this many days aren't drawn.
- **Pick**: **Weighted** favours songs not sung for a while (recommended), or **Pure random**. Songs already
  queued, playing or played, and songs within the cooldown, are never drawn.
- **Clear the queue**.

## When something goes wrong

- **A request keeps landing in Pending Review:** the sheet's title is far from what viewers type. Add the
  other spelling to the sheet, or loosen `MATCH_THRESHOLD` in `server/config.js` (0.2 stricter, 0.6 looser).
- **The queue came back after a restart:** it's kept for 6 hours (`queue-state.json`).
