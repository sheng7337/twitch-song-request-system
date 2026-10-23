// shared/i18n-viewer.js — what viewers see in OBS (song overlay + clip player), English +
// 繁體中文. The language comes from the dashboard's "Overlay language" setting.
(function (strings) {
  if (typeof module !== 'undefined' && module.exports) module.exports = strings;
  else I18N.register(strings);
})({
  en: {
    overlay: {
      title: 'Song Queue',
      waiting: ({ n }) => `${n} waiting`,
      nowPlaying: 'NOW PLAYING',
      noSong: 'no song loaded',
      requestedBy: '> requested by @{name}',
      upNext: '// UP NEXT',
      played: '// PLAYED',
      playedCount: ({ n }) => `${n} song${n === 1 ? '' : 's'}`,
      noRequests: 'no requests yet…',
      nothingPlayed: 'nothing played yet…',
      // Songs named in chat, floating over the Played section: "title - 99 days" since last sung (server/song-notes.js)
      days: ({ n }) => n === 0 ? 'today' : n === 1 ? '1 day ago' : `${n} days ago`,
      never: 'never',
    },
    clip: {
      shoutout: 'Shoutout',
      watching: 'Now Watching',
    },
  },
  'zh-TW': {
    overlay: {
      title: '點歌歌單',
      waiting: ({ n }) => `${n} 首等待中`,
      nowPlaying: '正在演唱',
      noSong: '目前沒有歌曲',
      requestedBy: '> 點歌者 @{name}',
      upNext: '// 待唱歌單',
      played: '// 已唱歌單',
      playedCount: ({ n }) => `${n} 首`,
      noRequests: '還沒有人點歌…',
      nothingPlayed: '還沒有唱過的歌…',
      days: ({ n }) => n === 0 ? '今天' : `${n} 天前`,
      never: '未唱過',
    },
    clip: {
      shoutout: '推薦頻道',
      watching: '現在播放',
    },
  },
});
