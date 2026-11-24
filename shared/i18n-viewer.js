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
      // !endingtk headings
      credits: { raiders: 'Raiders', subs: 'Subscribers', cheers: 'Cheers', followers: 'New Followers', redeemers: 'Channel Points', requesters: 'Song Requests', chatters: 'Top Chatters' },
    },
    // The on-stream chat (overlay/chat.html)
    chatOverlay: {
      title: '// Chat',
      followed: '{name} followed',
      redeemed: '{name} redeemed {reward}',
      anonymous: 'An anonymous gifter',
      // Subs, gifts, raids… in our own words (Twitch's English line for anything not here)
      tier: { prime: 'Prime', 1000: 'Tier 1', 2000: 'Tier 2', 3000: 'Tier 3' },
      notice: {
        sub: ({ name, tier }) => tier ? `${name} subscribed with ${tier}!` : `${name} subscribed!`,
        resub: ({ name, months }) => months ? `${name} resubscribed — ${months} months!` : `${name} resubscribed!`,
        sub_gift: '{name} gifted a sub to {recipient}!',
        community_sub_gift: ({ name, count }) => `${name} gifted ${count} sub${count === 1 ? '' : 's'} to the chat!`,
        gift_paid_upgrade: '{name} is continuing their gifted sub!',
        prime_paid_upgrade: '{name} upgraded from Prime to a paid sub!',
        pay_it_forward: '{name} is paying their gifted sub forward!',
        raid: ({ name, viewers }) => `${name} is raiding with ${viewers} viewer${viewers === 1 ? '' : 's'}!`,
        bits_badge_tier: '{name} unlocked the {bitsTier} bits badge!',
        charity_donation: '{name} donated {amount} to {charity}!',
      },
    },
    // 🔔 Alerts on stream (overlay/alerts.html); subs, gifts and raids use chatOverlay.notice
    alerts: {
      follow: '{name} followed!',
      cheer: ({ name, bits }) => `${name} cheered ${bits} bit${bits === 1 ? '' : 's'}!`,
      giftOne: '{name} gifted a sub!',
    },
    // 🤖 Chat bot's variables (server/bot.js): $(uptime), $(followage)
    bot: {
      offline: 'not live right now',
      minutes: '{m} min',
      hoursMinutes: '{h} h {m} min',
      today: 'today',
      days: ({ d }) => `${d} day${d === 1 ? '' : 's'}`,
      months: ({ m }) => `${m} month${m === 1 ? '' : 's'}`,
      monthsDays: ({ m, d }) => `${m} month${m === 1 ? '' : 's'} ${d} day${d === 1 ? '' : 's'}`,
      years: ({ y }) => `${y} year${y === 1 ? '' : 's'}`,
      yearsMonths: ({ y, m }) => `${y} year${y === 1 ? '' : 's'} ${m} month${m === 1 ? '' : 's'}`,
      notFollowing: '{user} is not following yet',
      unknown: '(Twitch did not say)',
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
      credits: { raiders: '感謝揪團', subs: '感謝訂閱', cheers: '感謝小奇點', followers: '感謝追隨', redeemers: '感謝兌換', requesters: '感謝點歌', chatters: '感謝聊天' },
    },
    chatOverlay: {
      title: '// 聊天室',
      followed: '{name} 追隨了頻道',
      redeemed: '{name} 兌換了 {reward}',
      anonymous: '匿名觀眾',
      tier: { prime: 'Prime', 1000: '第 1 級', 2000: '第 2 級', 3000: '第 3 級' },
      notice: {
        sub: ({ name, tier }) => tier ? `${name} 訂閱了頻道（${tier}）！` : `${name} 訂閱了頻道！`,
        resub: ({ name, months }) => months ? `${name} 續訂了！已經訂閱 ${months} 個月` : `${name} 續訂了！`,
        sub_gift: '{name} 送了一份訂閱給 {recipient}！',
        community_sub_gift: ({ name, count }) => `${name} 送出 ${count} 份訂閱給聊天室！`,
        gift_paid_upgrade: '{name} 自己續訂了收到的禮物訂閱！',
        prime_paid_upgrade: '{name} 從 Prime 升級成付費訂閱！',
        pay_it_forward: '{name} 把收到的禮物訂閱傳給下一位！',
        raid: ({ name, viewers }) => `${name} 帶著 ${viewers} 位觀眾來揪團！`,
        bits_badge_tier: '{name} 解鎖了 {bitsTier} 小奇點徽章！',
        charity_donation: '{name} 為 {charity} 捐了 {amount}！',
      },
    },
    alerts: {
      follow: '{name} 追隨了頻道！',
      cheer: ({ name, bits }) => `${name} 送出了 ${bits} 小奇點！`,
      giftOne: '{name} 送出了一份訂閱！',
    },
    bot: {
      offline: '現在沒有在直播',
      minutes: '{m} 分鐘',
      hoursMinutes: '{h} 小時 {m} 分鐘',
      today: '今天',
      days: ({ d }) => `${d} 天`,
      months: ({ m }) => `${m} 個月`,
      monthsDays: ({ m, d }) => `${m} 個月 ${d} 天`,
      years: ({ y }) => `${y} 年`,
      yearsMonths: ({ y, m }) => `${y} 年 ${m} 個月`,
      notFollowing: '{user} 還沒有追隨',
      unknown: '（Twitch 沒有回應）',
    },
  },
});
