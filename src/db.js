// ═══════════════════════════════════════════════════════════════
// QANAT Bot — SQLite Database Layer
// ═══════════════════════════════════════════════════════════════

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'qanat.db');

// Ensure data directory exists
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────────────
db.exec(`
  -- Members table
  CREATE TABLE IF NOT EXISTS members (
    discord_id    TEXT PRIMARY KEY,
    username      TEXT,
    x_handle      TEXT,
    x_verified    INTEGER DEFAULT 0,
    total_points  INTEGER DEFAULT 0,
    invite_count  INTEGER DEFAULT 0,
    joined_at     TEXT DEFAULT (datetime('now')),
    last_active   TEXT DEFAULT (datetime('now'))
  );

  -- Points ledger (every point transaction)
  CREATE TABLE IF NOT EXISTS points_ledger (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id  TEXT NOT NULL,
    points      INTEGER NOT NULL,
    reason      TEXT NOT NULL,
    tweet_id    TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (discord_id) REFERENCES members(discord_id)
  );

  -- Tracked X tweets
  CREATE TABLE IF NOT EXISTS x_tweets (
    tweet_id      TEXT PRIMARY KEY,
    tweet_url     TEXT,
    tweet_text    TEXT,
    message_id    TEXT,
    posted_at     TEXT DEFAULT (datetime('now'))
  );

  -- X engagement claims (one per member per tweet per action)
  CREATE TABLE IF NOT EXISTS x_engagements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id  TEXT NOT NULL,
    tweet_id    TEXT NOT NULL,
    action_type TEXT NOT NULL CHECK(action_type IN ('like','retweet','comment','quote')),
    points      INTEGER NOT NULL,
    claimed_at  TEXT DEFAULT (datetime('now')),
    UNIQUE(discord_id, tweet_id, action_type)
  );

  -- Invite tracking
  CREATE TABLE IF NOT EXISTS invites (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    inviter_id    TEXT NOT NULL,
    invited_id    TEXT NOT NULL,
    invite_code   TEXT,
    joined_at     TEXT DEFAULT (datetime('now'))
  );

  -- Moderation actions log
  CREATE TABLE IF NOT EXISTS mod_actions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id  TEXT,
    action_type TEXT NOT NULL,
    reason      TEXT,
    channel_id  TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
  );

  -- General engagement tracking (GM/GN streaks, etc.)
  CREATE TABLE IF NOT EXISTS daily_streaks (
    discord_id  TEXT NOT NULL,
    streak_type TEXT NOT NULL,
    streak_count INTEGER DEFAULT 1,
    last_date   TEXT,
    PRIMARY KEY (discord_id, streak_type)
  );
`);

// ═══════════════════════════════════════════════════════════════
// Query helpers
// ═══════════════════════════════════════════════════════════════

const queries = {
  // ── Members ──────────────────────────────────────────────
  upsertMember: db.prepare(`
    INSERT INTO members (discord_id, username)
    VALUES (?, ?)
    ON CONFLICT(discord_id) DO UPDATE SET
      username = excluded.username,
      last_active = datetime('now')
  `),

  getMember: db.prepare(`SELECT * FROM members WHERE discord_id = ?`),

  linkX: db.prepare(`
    UPDATE members SET x_handle = ?, x_verified = 1 WHERE discord_id = ?
  `),

  // ── Points ──────────────────────────────────────────────
  addPoints: db.prepare(`
    INSERT INTO points_ledger (discord_id, points, reason, tweet_id)
    VALUES (?, ?, ?, ?)
  `),

  updateTotalPoints: db.prepare(`
    UPDATE members SET total_points = (
      SELECT COALESCE(SUM(points), 0) FROM points_ledger WHERE discord_id = ?
    ) WHERE discord_id = ?
  `),

  getPoints: db.prepare(`
    SELECT total_points FROM members WHERE discord_id = ?
  `),

  getLeaderboard: db.prepare(`
    SELECT discord_id, username, total_points
    FROM members
    WHERE total_points > 0
    ORDER BY total_points DESC
    LIMIT ?
  `),

  // ── X Engagement ────────────────────────────────────────
  hasEngagement: db.prepare(`
    SELECT 1 FROM x_engagements
    WHERE discord_id = ? AND tweet_id = ? AND action_type = ?
  `),

  addEngagement: db.prepare(`
    INSERT OR IGNORE INTO x_engagements (discord_id, tweet_id, action_type, points)
    VALUES (?, ?, ?, ?)
  `),

  // ── X Tweets ────────────────────────────────────────────
  addTweet: db.prepare(`
    INSERT OR IGNORE INTO x_tweets (tweet_id, tweet_url, tweet_text, message_id)
    VALUES (?, ?, ?, ?)
  `),

  getTweet: db.prepare(`SELECT * FROM x_tweets WHERE tweet_id = ?`),

  getLatestTweetId: db.prepare(`
    SELECT tweet_id FROM x_tweets ORDER BY posted_at DESC LIMIT 1
  `),

  // ── Invites ─────────────────────────────────────────────
  addInvite: db.prepare(`
    INSERT INTO invites (inviter_id, invited_id, invite_code) VALUES (?, ?, ?)
  `),

  updateInviteCount: db.prepare(`
    UPDATE members SET invite_count = (
      SELECT COUNT(*) FROM invites WHERE inviter_id = ?
    ) WHERE discord_id = ?
  `),

  getInviteCount: db.prepare(`
    SELECT invite_count FROM members WHERE discord_id = ?
  `),

  getInviteLeaderboard: db.prepare(`
    SELECT discord_id, username, invite_count
    FROM members
    WHERE invite_count > 0
    ORDER BY invite_count DESC
    LIMIT ?
  `),

  // ── Moderation ──────────────────────────────────────────
  logModAction: db.prepare(`
    INSERT INTO mod_actions (discord_id, action_type, reason, channel_id)
    VALUES (?, ?, ?, ?)
  `),

  getModActions: db.prepare(`
    SELECT * FROM mod_actions ORDER BY created_at DESC LIMIT ?
  `),

  getRecentOffenses: db.prepare(`
    SELECT COUNT(*) as count FROM mod_actions
    WHERE discord_id = ? AND action_type IN ('timeout', 'auto_delete', 'phishing_delete')
    AND created_at > datetime('now', '-30 days')
  `),

  // ── Streaks ─────────────────────────────────────────────
  upsertStreak: db.prepare(`
    INSERT INTO daily_streaks (discord_id, streak_type, streak_count, last_date)
    VALUES (?, ?, 1, date('now'))
    ON CONFLICT(discord_id, streak_type) DO UPDATE SET
      streak_count = CASE
        WHEN last_date = date('now', '-1 day') THEN streak_count + 1
        WHEN last_date = date('now') THEN streak_count
        ELSE 1
      END,
      last_date = date('now')
  `),

  getStreak: db.prepare(`
    SELECT streak_count FROM daily_streaks
    WHERE discord_id = ? AND streak_type = ?
  `),
};

// ── Transactional helpers ────────────────────────────────────

function awardPoints(discordId, points, reason, tweetId = null) {
  const txn = db.transaction(() => {
    queries.addPoints.run(discordId, points, reason, tweetId);
    queries.updateTotalPoints.run(discordId, discordId);
  });
  txn();
}

function recordEngagement(discordId, tweetId, actionType, points) {
  const existing = queries.hasEngagement.get(discordId, tweetId, actionType);
  if (existing) return false;

  const txn = db.transaction(() => {
    queries.addEngagement.run(discordId, tweetId, actionType, points);
    queries.addPoints.run(discordId, points, `x_${actionType}`, tweetId);
    queries.updateTotalPoints.run(discordId, discordId);
  });
  txn();
  return true;
}

function recordInvite(inviterId, invitedId, code) {
  const txn = db.transaction(() => {
    queries.addInvite.run(inviterId, invitedId, code);
    queries.updateInviteCount.run(inviterId, inviterId);
  });
  txn();
}

module.exports = {
  db,
  queries,
  awardPoints,
  recordEngagement,
  recordInvite,
};
