// ═══════════════════════════════════════════════════════════════
// QANAT Bot — Configuration & Constants
// ═══════════════════════════════════════════════════════════════

module.exports = {
  GUILD_ID: process.env.DISCORD_GUILD_ID || '1351174587517501440',

  CHANNELS: {
    WELCOME:          '1447611121283498025',
    RULES:            '1351658082316451911',
    FAQ:              '1351659381778944050',
    ROLES:            '1457645106214469783',
    INVITES:          '1450211258954416360',
    VERIFY:           '1450749927301972221',
    OFFICIAL_LINKS:   '1351658312633946183',
    ANNOUNCEMENTS:    '1351658245873471589',
    MINI_UPDATES:     '1450749927301972221', // UPDATE if different from Verify
    INTRODUCTION:     '1351659102929162301',
    GENERAL:          '1351659063523410041',
    GM_GN:            '1475300234098901206',
    X_TASKS:          '1449031881546010777',
    MEME:             '1351660069401657475',
    ENGAGE_ARENA:     '1449031888022016181',
    COMMUNITY_HANGOUT:'1351659203441201264',
    WEEKLY_MISSION:   '1475265402283102360',
    CONTENT_CREATION: '1475265618428170402',
    SUPPORT:          '1351659316498792529',
    MOD_REPORT:       '1447327527101137069',
    CONTRIBUTOR_CHAT: '1480546393126076566',
    TEAM_CHAT:        '1351659658699604118',
    STAFF_CHAT:       '1445817010893094942',
  },

  // Channels the bot must NEVER send messages in
  BLOCKED_CHANNELS: [
    '1351659658699604118', // Team chat — staff only, never post
  ],

  ROLES: {
    ADMIN:       process.env.ADMIN_ROLE_ID || '1351298275843768392',
    VERIFIED:    process.env.VERIFIED_ROLE_ID || '1450749925624250390',
    CONTRIBUTOR: '1475256476191817849',
  },

  X_ACCOUNT: 'QANAT_IO',
  X_BEARER: process.env.TWITTER_BEARER_TOKEN || '',

  POINTS: {
    LIKE:    1,
    COMMENT: 2,
    RETWEET: 3,
    QUOTE:   3,
  },

  // Official invite code (won't be flagged as spam)
  OFFICIAL_INVITE: 'sfsgExKuUw',

  // Safe domains — never flag these
  SAFE_DOMAINS: [
    'x.com', 'twitter.com',
    'tenor.com', 'giphy.com', 'imgur.com',
    'youtube.com', 'youtu.be',
    'qanat.io',
    'media.discordapp.net', 'cdn.discordapp.com',
    'github.com', 'linkedin.com',
  ],

  // Phishing patterns to detect
  PHISHING_PATTERNS: [
    /d[il1]sc[o0]rd[\-\.]?(?:gift|nitro|app\.com\.)/i,
    /free[\-\s]?n[i1]tro/i,
    /steam[\-\s]?community[\-\s]?\.(?!com)/i,
    /steamp[o0]wered\.(?!com)/i,
    /claim[\-\s]?(?:nitro|reward|gift)/i,
    /(?:discord|steam|roblox|epic)[\-\.](?:gift|promo|verify)\./i,
    /airdrop[\-\s]?(?:claim|free|reward)/i,
  ],

  // Timeout durations (escalating)
  TIMEOUTS: {
    FIRST:  5 * 60 * 1000,       // 5 minutes
    SECOND: 60 * 60 * 1000,      // 1 hour
    THIRD:  24 * 60 * 60 * 1000, // 24 hours
  },

  BOT_NAME: 'QANAT',
  BOT_COLOR: 0x00A8E8,

  X_POLL_INTERVAL_MS: 5 * 60 * 1000,
  CONTRIBUTOR_MOTIVATION_CRON: '0 9 * * *',
  GENERAL_ENGAGEMENT_CRON: '0 */4 * * *',
  STAFF_REMINDER_CRON: '0 8 * * *',
};
