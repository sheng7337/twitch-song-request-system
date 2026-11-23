// dashboard/i18n-prompter.js — the prompter page's strings, English + 繁體中文 (see shared/i18n.js).
(function (strings) {
  if (typeof module !== 'undefined' && module.exports) module.exports = strings;
  else I18N.register(strings);
})({
  en: {
    prompter: {
      pageTitle: 'Prompter',
      offline: 'Leihu Singsing isn’t running',
      noServer: 'Can’t reach the song queue — reconnecting…',
      idle: 'No song open — open one in Leihu’s practice view',
      noLyrics: 'This song has no lyrics in Leihu',
      paused: 'Paused',
      key: 'KEY {key}',
      chat: 'Chat',
      chatEmpty: 'New chat shows here',
      lyricsSmaller: 'Smaller lyrics',
      lyricsBigger: 'Bigger lyrics',
      chatSmaller: 'Smaller chat',
      chatBigger: 'Bigger chat',
      hideChat: 'Hide chat',
      showChat: 'Show chat',
    },
  },
  'zh-TW': {
    prompter: {
      pageTitle: '提詞機',
      offline: '雷虎練唱台沒有開啟',
      noServer: '連不到點歌系統，重新連線中…',
      idle: '還沒有開歌：在雷虎練唱台的練唱畫面開一首歌',
      noLyrics: '這首歌在雷虎練唱台沒有歌詞',
      paused: '暫停中',
      key: 'KEY {key}',
      chat: '聊天室',
      chatEmpty: '新的聊天訊息會顯示在這裡',
      lyricsSmaller: '歌詞縮小',
      lyricsBigger: '歌詞放大',
      chatSmaller: '聊天室縮小',
      chatBigger: '聊天室放大',
      hideChat: '隱藏聊天室',
      showChat: '顯示聊天室',
    },
  },
});
