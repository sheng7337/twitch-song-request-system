// dashboard/i18n-links.js — YouTube link finder page strings, English + 繁體中文 (see shared/i18n.js).
(function (strings) {
  if (typeof module !== 'undefined' && module.exports) module.exports = strings;
  else I18N.register(strings);
})({
  en: {
    links: {
      pageTitle: 'YouTube Links',
      back: '← dashboard',
      title: 'YouTube Links',
      start: 'Search songs without a link',
      stop: 'Stop',
      acceptConfident: ({ n }) => `Accept all confident (${n})`,
      save: ({ n }) => `Save ${n} to sheet`,
      saveNeedsAccess: 'Share as Editor to save',
      saveNeedsAccessTitle: 'Searching and reviewing work without it — see the box at the top',
      intro: 'Finds, for each song in your sheet without a YouTube link, the video whose recording matches the ' +
        'lyrics Leihu Singsing can find — so its backing track and timed lyrics line up. Nothing is written ' +
        'to your sheet until you accept a video and press <b>Save to sheet</b>. Links go into a <b>YTLink</b> column, ' +
        'which is added to a tab the first time you save links there; filled cells are never changed. ' +
        'Leihu Singsing must be running.' +
        '<br><b>Next step:</b> after saving, go back to the dashboard → ⚙ Settings → ' +
        '<b>② Prepare the songs in Leihu</b> to download them all.',
      job: {
        searching: ({ done, total, current, min }) => `Searching ${done} / ${total}${current ? ' — ' + current : ''} (about ${min} min left)`,
        found: ({ n }) => `${n} songs found so far`,
        written: ({ n }) => `${n} link${n === 1 ? '' : 's'} already saved to the sheet`,
        skippedTabs: 'skipped tabs without a song title column: {tabs}',
      },
      access: {
        ok: '✓ Links can be saved to your sheet (Editor access)',
        checkAgain: 'Check again',
        title: 'Step 1 — let this app write links into your sheet',
        hint: 'Your song list is read with view access; saving links needs <b>Editor</b>. In Google Sheets press ' +
          '<b>Share</b>, add this address as <b>Editor</b> (untick “Notify people”), then press Check access. ' +
          'You can search and review songs meanwhile.',
        serviceAccount: 'the service account',
        copy: 'Copy',
        openSheet: 'Open my sheet ↗',
        check: 'Check access',
      },
      filter: {
        review: 'Needs a look', confident: 'Confident', none: 'Nothing found', accepted: 'Accepted', skipped: 'Skipped',
      },
      status: { confident: 'confident', review: 'needs a look', none: 'nothing found' },
      tag: {
        exact: 'exact length', workable: 'Leihu re-times lyrics', off: 'different length',
        youtubeMusic: 'YouTube Music', official: 'official', accepted: 'accepted',
        instrumental: 'no vocals', compilation: 'compilation', live: 'live', 'tv show': 'TV show',
        cover: 'cover', remix: 'remix', karaoke: 'karaoke', 'fan edit': 'fan edit', 'title differs': 'title differs',
        'other language': 'other-language version', 'romanized title': 'title in romaji/pinyin',
      },
      song: {
        lyricsRef: 'lyrics {len} · {sources}',
        noLyrics: 'no lyrics found online — Leihu will rely on its own recognition',
        yourLink: 'your link: {url}',
        noResults: 'No YouTube results.',
        pastePlaceholder: 'or paste a YouTube link…',
        useLink: 'Use link',
        undo: 'Undo',
        skip: 'Skip',
        useThis: 'Use this',
        check: 'Check with Leihu',
        checkTitle: 'Import into Leihu Singsing and compare the sung lyrics with the online lyrics (downloads the song, uses the GPU for a minute or two)',
        views: ({ n }) => `${n} views`,
      },
      check: {
        of: 'Leihu check of {label}: {text}',
        running: 'checking in Leihu… (download + processing, a few minutes)',
        match: 'lyrics match ({p}%)',
        partial: 'lyrics partly match ({p}%)',
        nomatch: "lyrics don't match ({p}%)",
        inconclusive: 'inconclusive — {note}',
        failed: 'check failed — {note}',
      },
      empty: {
        group: 'Nothing in this group',
        start: 'Press “Search songs without a link” to start',
      },
      toast: {
        accessOk: 'Editor access confirmed — links can be saved',
        accessStill: 'still no Editor access',
        copied: 'copied',
        copyFailed: 'copy failed — select the address and copy it by hand',
        pasteFirst: 'paste a YouTube link first',
        checking: 'checking in Leihu — this takes a few minutes',
        accepted: ({ n }) => `accepted ${n} confident pick${n === 1 ? '' : 's'} — press Save to write them`,
        saved: ({ n }) => `saved ${n} link${n === 1 ? '' : 's'} to the sheet`,
        savedColumn: ', added the YTLink column to {tabs}',
        savedSkipped: ', {n} skipped (see notes)',
        requestFailed: 'request failed',
      },
    },
  },

  'zh-TW': {
    links: {
      pageTitle: 'YouTube 連結',
      back: '← 控制台',
      title: 'YouTube 連結',
      start: '搜尋沒有連結的歌曲',
      stop: '停止',
      acceptConfident: ({ n }) => `接受所有正確的（${n}）`,
      save: ({ n }) => `將 ${n} 首存入試算表`,
      saveNeedsAccess: '共用為編輯者後才能儲存',
      saveNeedsAccessTitle: '不需要編輯權限也能搜尋和檢視 — 請看上方的說明',
      intro: '幫試算表裡沒有 YouTube 連結的歌曲，找出錄音版本和雷虎練唱台找得到的歌詞相符的影片，' +
        '讓伴奏和同步歌詞對得上。在你接受影片並按下<b>存入試算表</b>之前，不會寫入任何東西。' +
        '連結會寫進 <b>YTLink</b> 欄位，第一次在某個分頁儲存時會自動新增這個欄位；已經有內容的格子不會被更改。' +
        '需要先開啟雷虎練唱台。' +
        '<br><b>下一步：</b>儲存後回到控制台 → ⚙ 設定 → <b>② 在雷虎練唱台準備這些歌</b>，把它們全部下載下來。',
      job: {
        searching: ({ done, total, current, min }) => `搜尋中 ${done} / ${total}${current ? ' — ' + current : ''}（大約還要 ${min} 分鐘）`,
        found: ({ n }) => `目前找到 ${n} 首`,
        written: ({ n }) => `已有 ${n} 個連結存入試算表`,
        skippedTabs: '略過沒有歌名欄位的分頁：{tabs}',
      },
      access: {
        ok: '✓ 可以把連結存入試算表（已有編輯權限）',
        checkAgain: '再檢查一次',
        title: '步驟 1 — 讓本程式可以把連結寫入試算表',
        hint: '讀取歌單只需要檢視權限；儲存連結需要<b>編輯者</b>權限。在 Google 試算表按<b>共用</b>，' +
          '把這個地址加為<b>編輯者</b>（取消勾選「通知使用者」），然後按「檢查權限」。這段時間可以先搜尋和檢視歌曲。',
        serviceAccount: '服務帳戶',
        copy: '複製',
        openSheet: '開啟我的試算表 ↗',
        check: '檢查權限',
      },
      filter: {
        review: '需要確認', confident: '正確', none: '找不到', accepted: '已接受', skipped: '已略過',
      },
      status: { confident: '正確', review: '需要確認', none: '找不到' },
      tag: {
        exact: '長度相符', workable: '雷虎練唱台會重新對時', off: '長度不同',
        youtubeMusic: 'YouTube Music', official: '官方', accepted: '已接受',
        instrumental: '無人聲', compilation: '合輯', live: '現場版', 'tv show': '電視節目',
        cover: '翻唱', remix: '混音', karaoke: 'KTV', 'fan edit': '剪輯版', 'title differs': '歌名不同',
        'other language': '其他語言版本', 'romanized title': '羅馬拼音歌名',
      },
      song: {
        lyricsRef: '歌詞 {len} · {sources}',
        noLyrics: '網路上找不到歌詞 — 雷虎練唱台會使用自己的辨識結果',
        yourLink: '你的連結：{url}',
        noResults: '沒有 YouTube 搜尋結果。',
        pastePlaceholder: '或貼上 YouTube 連結…',
        useLink: '使用連結',
        undo: '復原',
        skip: '略過',
        useThis: '用這個',
        check: '用雷虎練唱台檢查',
        checkTitle: '匯入雷虎練唱台，比對唱出來的歌詞和線上歌詞（會下載歌曲，並使用顯示卡一兩分鐘）',
        views: ({ n }) => `${n} 次觀看`,
      },
      check: {
        of: '雷虎練唱台檢查 {label}：{text}',
        running: '雷虎練唱台檢查中…（下載＋處理，約幾分鐘）',
        match: '歌詞相符（{p}%）',
        partial: '歌詞部分相符（{p}%）',
        nomatch: '歌詞不相符（{p}%）',
        inconclusive: '無法判斷 — {note}',
        failed: '檢查失敗 — {note}',
      },
      empty: {
        group: '這一組沒有歌曲',
        start: '按「搜尋沒有連結的歌曲」開始',
      },
      toast: {
        accessOk: '已確認編輯權限 — 可以儲存連結了',
        accessStill: '還是沒有編輯權限',
        copied: '已複製',
        copyFailed: '複製失敗 — 請選取地址手動複製',
        pasteFirst: '請先貼上 YouTube 連結',
        checking: '雷虎練唱台檢查中 — 需要幾分鐘',
        accepted: ({ n }) => `已接受 ${n} 首正確的 — 按「存入試算表」寫入`,
        saved: ({ n }) => `已將 ${n} 個連結存入試算表`,
        savedColumn: '，並在 {tabs} 新增了 YTLink 欄位',
        savedSkipped: '，略過 {n} 首（請看備註）',
        requestFailed: '請求失敗',
      },
    },
  },
});
