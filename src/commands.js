// ═══════════════════════════════════════════════════════════════
// QANAT Bot — Slash Command Definitions
// ═══════════════════════════════════════════════════════════════

const { SlashCommandBuilder } = require('discord.js');

const commands = [
  // ── /points — Check your engagement points ─────────────
  new SlashCommandBuilder()
    .setName('points')
    .setDescription('Check your QANAT engagement points')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Check another member\'s points')
        .setRequired(false)
    ),

  // ── /leaderboard — Top point holders ───────────────────
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View the top QANAT engagement leaderboard')
    .addIntegerOption(opt =>
      opt.setName('limit')
        .setDescription('Number of entries to show (default: 10)')
        .setMinValue(5)
        .setMaxValue(25)
        .setRequired(false)
    ),

  // ── /invites — Check your invite count ─────────────────
  new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check your invite count')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Check another member\'s invites')
        .setRequired(false)
    ),

  // ── /invitesleaderboard — Top inviters ────────────────
  new SlashCommandBuilder()
    .setName('invitesleaderboard')
    .setDescription('View the top inviters leaderboard')
    .addIntegerOption(opt =>
      opt.setName('limit')
        .setDescription('Number of entries to show (default: 10)')
        .setMinValue(5)
        .setMaxValue(25)
        .setRequired(false)
    ),

  // ── /linkx — Link your X/Twitter account ──────────────
  new SlashCommandBuilder()
    .setName('linkx')
    .setDescription('Link your X/Twitter account to earn engagement points')
    .addStringOption(opt =>
      opt.setName('handle')
        .setDescription('Your X handle (e.g. QANAT_IO)')
        .setRequired(true)
    ),

  // ── /faq — Ask a question ─────────────────────────────
  new SlashCommandBuilder()
    .setName('faq')
    .setDescription('Get answers to frequently asked questions about QANAT')
    .addStringOption(opt =>
      opt.setName('question')
        .setDescription('Your question about QANAT')
        .setRequired(false)
    ),

  // ── /joinvc — Bot joins your voice channel ────────────
  new SlashCommandBuilder()
    .setName('joinvc')
    .setDescription('Invite QANAT Guardian to join your voice channel'),

  // ── /leavevc — Bot leaves voice channel ───────────────
  new SlashCommandBuilder()
    .setName('leavevc')
    .setDescription('Ask QANAT Guardian to leave the voice channel'),

  // ── /help — Bot help & feature overview ───────────────
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Learn about QANAT Guardian and available commands'),

  // ── /xcheck — Check X engagement status ───────────────
  new SlashCommandBuilder()
    .setName('xcheck')
    .setDescription('Check your X engagement point breakdown')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Check another member\'s X engagement')
        .setRequired(false)
    ),

  // ── /myprofile — View full member profile ─────────────
  new SlashCommandBuilder()
    .setName('myprofile')
    .setDescription('View your complete QANAT community profile'),

  // ── /modstats — Moderation stats (admin only) ─────────
  new SlashCommandBuilder()
    .setName('modstats')
    .setDescription('View recent moderation actions (admin only)')
    .addIntegerOption(opt =>
      opt.setName('limit')
        .setDescription('Number of actions to show (default: 10)')
        .setMinValue(5)
        .setMaxValue(50)
        .setRequired(false)
    ),

  // ── /announce — Send an embed announcement (admin only)
  new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Send a rich embed announcement (admin only)')
    .addStringOption(opt =>
      opt.setName('title')
        .setDescription('Announcement title')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('body')
        .setDescription('Announcement body text (supports Discord markdown)')
        .setRequired(true)
    )
    .addChannelOption(opt =>
      opt.setName('channel')
        .setDescription('Channel to send to (default: announcements)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('color')
        .setDescription('Embed color')
        .addChoices(
          { name: '🔵 Blue (Default)', value: '#00A8E8' },
          { name: '🟢 Green', value: '#57F287' },
          { name: '🔴 Red / Urgent', value: '#ED4245' },
          { name: '🟡 Yellow / Warning', value: '#FEE75C' },
          { name: '🟣 Purple', value: '#9B59B6' },
          { name: '🟠 Orange', value: '#E67E22' },
          { name: '⚪ White', value: '#FFFFFF' },
        )
        .setRequired(false)
    )
    .addBooleanOption(opt =>
      opt.setName('ping_everyone')
        .setDescription('Ping @everyone? (default: false)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('image')
        .setDescription('Image URL to include (optional)')
        .setRequired(false)
    )
    .addStringOption(opt =>
      opt.setName('footer')
        .setDescription('Footer text (optional)')
        .setRequired(false)
    ),
  // ── /verifyx — Check/revoke a member's X link (admin only)
  new SlashCommandBuilder()
    .setName('verifyx')
    .setDescription('Check or revoke a member\'s linked X account (admin only)')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Member to check')
        .setRequired(true)
    )
    .addBooleanOption(opt =>
      opt.setName('revoke')
        .setDescription('Revoke their X link and points?')
        .setRequired(false)
    ),

  // ── /vcsummary — Get a summary of the current VC session
  new SlashCommandBuilder()
    .setName('vcsummary')
    .setDescription('Get a summary of the current voice channel session'),

  // ── /vcrecord — Toggle VC recording (admin only)
  new SlashCommandBuilder()
    .setName('vcrecord')
    .setDescription('Toggle voice channel recording on/off (admin only)'),

  // ── /posttweet — Post a tweet for engagement tracking (admin only)
  new SlashCommandBuilder()
    .setName('posttweet')
    .setDescription('Create an engagement tracking post for a tweet (admin only)')
    .addStringOption(opt =>
      opt.setName('url')
        .setDescription('Tweet URL (e.g. https://x.com/QANAT_IO/status/123456)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('message')
        .setDescription('Custom message to add (optional)')
        .setRequired(false)
    ),
];

module.exports = commands;
