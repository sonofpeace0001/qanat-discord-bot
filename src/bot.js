// ═══════════════════════════════════════════════════════════════
//
//  QANAT -- Community Manager & Moderator Bot
//  Digital Sovereignty by Design
//
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();

const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, PermissionFlagsBits, Collection,
} = require('discord.js');

const cron = require('node-cron');
const voice = require('./voice');
const config = require('./config');
const { queries: q, awardPoints, recordEngagement, recordInvite } = require('./db');
const { matchFAQ, getAllFAQ } = require('./faq');
const { startXMonitor, handleTweetLink } = require('./xmonitor');
const ai = require('./ai');

// ═══════════════════════════════════════════════════════════════
// Client
// ═══════════════════════════════════════════════════════════════

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember],
});

const inviteCache = new Collection();
const cooldowns = new Map();

function isOnCooldown(key, seconds = 30) {
  const now = Date.now();
  if (cooldowns.has(key) && now - cooldowns.get(key) < seconds * 1000) return true;
  cooldowns.set(key, now);
  return false;
}

function isAdmin(member) {
  if (!member) return false;
  return member.roles?.cache?.has(config.ROLES.ADMIN) ||
    member.permissions?.has(PermissionFlagsBits.Administrator);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ═══════════════════════════════════════════════════════════════
// READY
// ═══════════════════════════════════════════════════════════════

client.once('ready', async () => {
  console.log(`\n  QANAT Bot online as ${client.user.tag}`);
  console.log(`  AI: ${ai.isAIEnabled() ? 'enabled' : 'DISABLED (set GEMINI_API_KEY)'}`);
  console.log(`  ${new Date().toISOString()}\n`);

  // Auto-register slash commands on startup
  try {
    const { REST, Routes } = require('discord.js');
    const commands = require('./commands');
    const rest = new REST().setToken(process.env.DISCORD_TOKEN);
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, config.GUILD_ID),
      { body: commands.map(c => c.toJSON()) }
    );
    console.log(`  Registered ${commands.length} slash commands`);
  } catch (err) {
    console.error('  Command registration failed:', err.message);
  }

  try {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (guild) {
      const invites = await guild.invites.fetch();
      invites.forEach(inv => inviteCache.set(inv.code, inv.uses));
    }
  } catch (err) { console.error('Invite cache error:', err.message); }

  startXMonitor(client);
  startScheduledTasks();
  await setupVerification(client);
  client.user.setPresence({ activities: [{ name: 'QANAT Community', type: 3 }], status: 'online' });
});

// ═══════════════════════════════════════════════════════════════
// VERIFICATION SYSTEM
// ═══════════════════════════════════════════════════════════════

async function setupVerification(client) {
  const guild = client.guilds.cache.get(config.GUILD_ID);
  if (!guild) return;

  const verifyChannel = guild.channels.cache.get(config.CHANNELS.VERIFY);
  if (!verifyChannel) return;

  // Check if bot already posted a verify message
  try {
    const messages = await verifyChannel.messages.fetch({ limit: 20 });
    const existing = messages.find(m =>
      m.author.id === client.user.id && m.components.length > 0
    );

    if (existing) {
      console.log('  Verification message already exists');
      return;
    }
  } catch {}

  // Post the verification message with button
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('qanat_verify')
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅')
  );

  await verifyChannel.send({
    content:
      `**Welcome to QANAT**\n\n` +
      `To get full access to the server, hit the button below. ` +
      `This confirms you've read the rules and you're ready to be part of the community.\n\n` +
      `Once verified, you'll unlock all channels and can start earning engagement points, ` +
      `participating in events, and connecting with the team.`,
    components: [row],
  });

  console.log('  Verification message posted');
}

// ═══════════════════════════════════════════════════════════════
// MEMBER JOIN
// ═══════════════════════════════════════════════════════════════

client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;
  q.upsertMember.run(member.id, member.user.username);

  const ch = member.guild.channels.cache.get(config.CHANNELS.WELCOME);
  if (ch) {
    const welcomes = [
      `Hey <@${member.id}>, welcome to QANAT! Good to have you here.\n\nGo say hi in <#${config.CHANNELS.INTRODUCTION}> when you get a chance, and check out <#${config.CHANNELS.RULES}> so you know how things work. Once you verify in <#${config.CHANNELS.VERIFY}> you'll have full access. No rush, settle in.`,

      `<@${member.id}> welcome! You picked a good time to join.\n\nDrop an intro in <#${config.CHANNELS.INTRODUCTION}> so we know who you are, then verify yourself in <#${config.CHANNELS.VERIFY}>. If you have any questions about QANAT or what we're building, just ask. We're friendly.`,

      `Welcome <@${member.id}>! Glad you found us.\n\nStart with an intro in <#${config.CHANNELS.INTRODUCTION}>, have a look at <#${config.CHANNELS.RULES}>, and get verified in <#${config.CHANNELS.VERIFY}>. After that you're all set. Looking forward to getting to know you.`,
    ];
    await ch.send(pick(welcomes));
  }

  // Invite tracking
  try {
    const newInvites = await member.guild.invites.fetch();
    const usedInvite = newInvites.find(inv => (inviteCache.get(inv.code) || 0) < inv.uses);
    newInvites.forEach(inv => inviteCache.set(inv.code, inv.uses));

    if (usedInvite?.inviter) {
      const inviterId = usedInvite.inviter.id;
      q.upsertMember.run(inviterId, usedInvite.inviter.username);
      recordInvite(inviterId, member.id, usedInvite.code);
      const count = q.getMember.get(inviterId)?.invite_count || 1;

      const invCh = member.guild.channels.cache.get(config.CHANNELS.INVITES);
      if (invCh) {
        await invCh.send(`**${member.user.displayName}** just joined through <@${inviterId}>'s invite. That's ${count} total now.`);
      }
    }
  } catch (err) { console.error('Invite tracking:', err.message); }

  // Welcome DM
  try {
    await member.user.send(
      `Hey ${member.user.displayName}, welcome to QANAT!\n\n` +
      `Quick intro: we're building Web X. OS, a decentralized operating system that puts people back in control of their data. Beta is coming Q1 2026, mainnet Q3 2026. You're early.\n\n` +
      `**Earning points**\n` +
      `Link your X account with \`/linkx\` in the server, follow @QANAT_IO, and when new posts drop you can engage and earn points. Like = 1pt, comment = 2pt, retweet = 3pt. Use \`/points\` to check your score and \`/leaderboard\` to see where you stand.\n\n` +
      `**Channels to know**\n` +
      `General chat for hanging out, GM/GN channel for your daily streak, and the task channel for X engagement quests. If you need help with anything, just ask in support or tag a staff member.\n\n` +
      `Take your time getting settled. No pressure, just be yourself and have fun. See you in there.`
    );
  } catch {
    // DMs might be disabled, that's fine
  }

  logModAction(member.guild, null, 'member_join', `${member.user.tag} joined`);
});

// ═══════════════════════════════════════════════════════════════
// MESSAGE CREATE -- The main brain
// ═══════════════════════════════════════════════════════════════

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const channelId = message.channel.id;
  if (config.BLOCKED_CHANNELS.includes(channelId)) return;

  const content = message.content;
  const lower = content.toLowerCase().trim();
  const memberIsAdmin = isAdmin(message.member);
  const authorName = message.member?.displayName || message.author.displayName;

  q.upsertMember.run(message.author.id, message.author.username);

  // Always add to AI conversation buffer
  ai.addToBuffer(channelId, authorName, content, false);

  // ── X Task: detect tweet links posted in #x-tasks ──────
  if (channelId === config.CHANNELS.X_TASKS) {
    const handled = await handleTweetLink(message);
    if (handled) return;
  }

  // ── GM/GN Channel ──────────────────────────────────────
  if (channelId === config.CHANNELS.GM_GN) {
    await handleGMGN(message, lower, memberIsAdmin);
    return;
  }

  // ── Phishing/spam link check (skip admins) ──────────────
  if (!memberIsAdmin) {
    const wasPhishing = await handlePhishingCheck(message, lower);
    if (wasPhishing) return;
  }

  // ── Quick rule checks (pattern-based, no AI call) ───────
  if (!memberIsAdmin) {
    const wasViolation = await handleQuickRuleCheck(message, lower, authorName);
    if (wasViolation) return;
  }

  // ── Meme & Content reactions ───────────────────────────
  if (channelId === config.CHANNELS.CONTENT_CREATION && (content.includes('http') || message.attachments.size > 0)) {
    await message.react('🔥');
  }
  if (channelId === config.CHANNELS.MEME && (message.attachments.size > 0 || content.includes('http'))) {
    await message.react('😂');
  }

  // ── AI Conversation (reads ALL channels except silent ones)
  if (!config.SILENT_CHANNELS.includes(channelId)) {
    await handleConversation(message, channelId, lower, authorName);
  }
});

// ── AI Conversation Handler (reads ALL channels) ────────────

async function handleConversation(message, channelId, lower, authorName) {
  const mentioned = message.mentions.has(client.user);

  const shouldReply = mentioned || ai.shouldRespond(message, channelId);
  if (!shouldReply) return;

  try {
    const response = await ai.generateResponse(channelId, authorName, message.content);

    if (response) {
      ai.recordResponse(channelId, message.author.id);
      ai.addToBuffer(channelId, 'QANAT', response, true);

      if (mentioned) {
        await message.reply(response);
      } else {
        await message.channel.send(response);
      }
    } else {
      console.log(`[Chat] No AI response for "${message.content.substring(0, 50)}..." in #${message.channel.name}`);
    }
  } catch (err) {
    console.error(`[Chat] Error responding:`, err.message);
  }
}

// ── AI-Powered Rule Enforcement ──────────────────────────────

async function handleQuickRuleCheck(message, lower, authorName) {
  // Fast pattern-based checks only. NO AI calls here.
  // AI moderation only runs when patterns flag something suspicious.

  // Impersonation (rule 12)
  const displayName = (message.member?.displayName || '').toLowerCase();
  if (/\b(staff|support|admin|moderator)\b/i.test(displayName) && !isAdmin(message.member)) {
    await handleViolation(message, { rule: 12, severity: 'serious',
      warning: `Your display name contains restricted words. Change it or you'll be removed.` });
    return true;
  }

  // NSFW (rule 5)
  if (/\b(porn|hentai|nude|naked|xxx|onlyfans|sex ?tape)\b/i.test(lower)) {
    await message.delete().catch(() => {});
    await handleViolation(message, { rule: 5, severity: 'serious',
      warning: `That kind of content isn't allowed here. Keep it clean.` }, true);
    return true;
  }

  // Begging (rule 10)
  if (/\b(send me|give me|donate|need money|send crypto|send sol|send eth|send btc|please send|i need \$|can someone send|help me with money)\b/i.test(lower)) {
    await handleViolation(message, { rule: 10, severity: 'moderate',
      warning: `Asking for money or crypto isn't allowed here.` });
    return true;
  }

  // Excessive mentions (rule 7)
  if ((message.content.match(/<@&?\d+>/g) || []).length > 4) {
    await message.delete().catch(() => {});
    await handleViolation(message, { rule: 7, severity: 'moderate',
      warning: `Easy on the tags. Only tag staff for actual emergencies.` }, true);
    return true;
  }

  // Hate speech / slurs (rule 1) - only the clearest patterns
  if (/\b(n[i1]gg|f[a4]gg|k[yi]ke|sp[i1]c|ch[i1]nk|ret[a4]rd)\b/i.test(lower)) {
    await message.delete().catch(() => {});
    await handleViolation(message, { rule: 1, severity: 'serious',
      warning: `That language isn't tolerated here. Respect everyone.` }, true);
    return true;
  }

  return false;
}

// ── Handle Violation: warn publicly, auto-delete warning, log to mod channel ──

async function handleViolation(message, result, messageDeleted = false) {
  const { rule, severity, warning } = result;
  const userId = message.author.id;
  const channelName = message.channel?.name || 'unknown';

  // Count recent offenses for escalation
  const offenses = q.getRecentOffenses.get(userId);
  const count = (offenses?.count || 0) + 1;

  // Determine action based on severity + repeat offenses
  let action = 'warning';
  let timeoutMs = 0;
  let timeoutLabel = '';

  if (severity === 'serious' || count >= 3) {
    timeoutMs = count >= 4 ? config.TIMEOUTS.THIRD : count >= 3 ? config.TIMEOUTS.SECOND : config.TIMEOUTS.FIRST;
    timeoutLabel = count >= 4 ? '24 hours' : count >= 3 ? '1 hour' : '5 minutes';
    action = 'timeout';
  }

  // Apply timeout if needed
  if (timeoutMs > 0) {
    try {
      await message.member.timeout(timeoutMs, `Rule ${rule} violation (${severity})`);
    } catch (e) {
      console.error('Timeout failed:', e.message);
    }
  }

  // Send public warning (then auto-delete after 60 seconds)
  let warningMsg;
  try {
    const publicWarning = timeoutMs > 0
      ? `<@${userId}> ${warning} Timed out for ${timeoutLabel}. (Rule ${rule})`
      : `<@${userId}> ${warning} (Rule ${rule})`;

    warningMsg = await message.channel.send(publicWarning);

    // Auto-delete the warning after 60 seconds
    setTimeout(async () => {
      try { await warningMsg.delete(); } catch {}
    }, 60_000);
  } catch {}

  // Log to mod report channel with full details
  const guild = message.guild;
  const modChannel = guild.channels.cache.get(config.CHANNELS.MOD_REPORT);
  if (modChannel) {
    const originalContent = messageDeleted ? message.content.substring(0, 500) : '[message not deleted]';
    await modChannel.send(
      `**Rule ${rule} Violation** (${severity}) <@&${config.ROLES.ADMIN}>\n` +
      `**User:** <@${userId}> (${message.author.tag})\n` +
      `**Channel:** #${channelName}\n` +
      `**Action:** ${action}${timeoutLabel ? ` (${timeoutLabel})` : ''}\n` +
      `**Offense #:** ${count} in last 30 days\n` +
      `**Message:** ${originalContent}\n` +
      `**Warning given:** ${warning}\n` +
      `<t:${Math.floor(Date.now() / 1000)}:f>`
    );
  }

  // Log to DB
  logModAction(guild, userId, action,
    `Rule ${rule} (${severity}) in #${channelName}: ${warning}${timeoutLabel ? ` Timeout: ${timeoutLabel}` : ''}`,
    message.channel.id
  );
}


// ── GM/GN Handler ────────────────────────────────────────────

async function handleGMGN(message, lower, memberIsAdmin) {
  const isGM = /\bgm\b|good\s*morning/i.test(lower);
  const isGN = /\bgn\b|good\s*night/i.test(lower);

  if (isGM) {
    await message.react('☀️');
    q.upsertStreak.run(message.author.id, 'gm');
    const streak = q.getStreak.get(message.author.id, 'gm');
    if (streak && streak.streak_count > 0 && streak.streak_count % 7 === 0) {
      await message.reply(`${streak.streak_count} days straight. Consistent.`);
    }
  } else if (isGN) {
    await message.react('🌙');
    q.upsertStreak.run(message.author.id, 'gn');
  } else if (!memberIsAdmin) {
    await message.reply(`This one's just for GM and GN. Chat's in <#${config.CHANNELS.GENERAL}>.`);
  }
}

// ── Phishing Detection ──────────────────────────────────────

async function handlePhishingCheck(message, lower) {
  const urls = message.content.match(/https?:\/\/[^\s<]+/gi);
  if (!urls) return false;

  for (const url of urls) {
    const urlLower = url.toLowerCase();
    const isSafe = config.SAFE_DOMAINS.some(d => {
      try { const h = new URL(urlLower).hostname; return h === d || h.endsWith('.' + d); }
      catch { return urlLower.includes(d); }
    });
    if (isSafe) continue;
    if (urlLower.includes(`discord.gg/${config.OFFICIAL_INVITE}`) || urlLower.includes(`discord.com/invite/${config.OFFICIAL_INVITE}`)) continue;

    const isPhishing = config.PHISHING_PATTERNS.some(p => p.test(urlLower));
    const isUnauthorizedInvite = /discord\.gg\/|discord\.com\/invite\//i.test(urlLower);

    if (isPhishing || isUnauthorizedInvite) {
      try {
        await message.delete();
        const offenses = q.getRecentOffenses.get(message.author.id);
        const count = offenses?.count || 0;
        let timeoutMs, label;
        if (count >= 2) { timeoutMs = config.TIMEOUTS.THIRD; label = '24 hours'; }
        else if (count >= 1) { timeoutMs = config.TIMEOUTS.SECOND; label = '1 hour'; }
        else { timeoutMs = config.TIMEOUTS.FIRST; label = '5 minutes'; }

        try { await message.member.timeout(timeoutMs, 'Suspicious link'); } catch {}

        await message.channel.send(
          `Removed a suspicious link from <@${message.author.id}>. Timed out for ${label}.` +
          (count >= 2 ? ` <@&${config.ROLES.ADMIN}> repeat offense.` : '')
        );
        logModAction(message.guild, message.author.id, 'phishing_delete',
          `${isPhishing ? 'Phishing' : 'Unauthorized invite'} in #${message.channel.name}. Timeout: ${label}.`, message.channel.id);
        return true;
      } catch (err) { console.error('Phishing delete:', err.message); }
    }
  }
  return false;
}

// (Self-promo check removed, handled by AI moderation now)

// ═══════════════════════════════════════════════════════════════
// REACTION ADD -- X Engagement
// ═══════════════════════════════════════════════════════════════

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
  if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }

  const msg = reaction.message;
  if (msg.channel.id !== config.CHANNELS.X_TASKS || msg.author.id !== client.user.id) return;

  // Ensure member exists
  q.upsertMember.run(user.id, user.username);
  const member = q.getMember.get(user.id);

  if (!member || !member.x_verified) {
    // Only DM once per hour per user to avoid spam
    if (!isOnCooldown(`linkx-dm-${user.id}`, 3600)) {
      try {
        await user.send(
          `To claim engagement points, you need to link your X account first. ` +
          `Go to the server and use the \`/linkx\` command with your X handle.`
        );
      } catch {}
    }
    return;
  }

  const emoji = reaction.emoji.name;
  const db = require('./db').db;
  const tweet = db.prepare('SELECT tweet_id FROM x_tweets WHERE message_id = ?').get(msg.id);
  if (!tweet) return;

  // ⭐ = did all three (like + comment + retweet)
  if (emoji === '⭐') {
    let earned = 0;
    const actions = [
      ['like', config.POINTS.LIKE],
      ['comment', config.POINTS.COMMENT],
      ['retweet', config.POINTS.RETWEET],
    ];
    for (const [action, pts] of actions) {
      if (recordEngagement(user.id, tweet.tweet_id, action, pts)) earned += pts;
    }
    if (earned > 0) {
      const total = q.getPoints.get(user.id);
      try { await user.send(`+${earned} points for the full engagement. You're at ${total?.total_points || earned} total. Respect.`); } catch {}
    }
    return;
  }

  // Individual claims
  let actionType, points;
  if (emoji === '👍') { actionType = 'like'; points = config.POINTS.LIKE; }
  else if (emoji === '💬') { actionType = 'comment'; points = config.POINTS.COMMENT; }
  else if (emoji === '🔄') { actionType = 'retweet'; points = config.POINTS.RETWEET; }
  else return;

  if (recordEngagement(user.id, tweet.tweet_id, actionType, points)) {
    const total = q.getPoints.get(user.id);
    try { await user.send(`+${points} for the ${actionType}. You're at ${total?.total_points || points} total.`); } catch {}
  }
});

// ═══════════════════════════════════════════════════════════════
// INVITE & VOICE TRACKING
// ═══════════════════════════════════════════════════════════════

client.on('inviteCreate', (inv) => inviteCache.set(inv.code, inv.uses));
client.on('inviteDelete', (inv) => inviteCache.delete(inv.code));
client.on('voiceStateUpdate', (oldState, newState) => {
  voice.handleVoiceStateUpdate(oldState, newState, client);
});

// ═══════════════════════════════════════════════════════════════
// SLASH COMMANDS
// ═══════════════════════════════════════════════════════════════

client.on('interactionCreate', async (interaction) => {
  // ── Verify button ──────────────────────────────────────
  if (interaction.isButton() && interaction.customId === 'qanat_verify') {
    try {
      const role = interaction.guild.roles.cache.get(config.ROLES.VERIFIED);
      if (!role) {
        return interaction.reply({ content: 'Verification role not found. Let a staff member know.', ephemeral: true });
      }

      if (interaction.member.roles.cache.has(role.id)) {
        return interaction.reply({ content: 'You\'re already verified.', ephemeral: true });
      }

      await interaction.member.roles.add(role);
      await interaction.reply({
        content: `You're verified now. Welcome to the full QANAT experience. Head to <#${config.CHANNELS.GENERAL}> and say hi.`,
        ephemeral: true,
      });

      // Log it
      logModAction(interaction.guild, interaction.user.id, 'verification',
        `${interaction.user.tag} verified themselves`);

    } catch (err) {
      console.error('Verification error:', err);
      await interaction.reply({ content: 'Something went wrong. Tag a staff member for help.', ephemeral: true });
    }
    return;
  }

  // ── Follow confirmation button (from /linkx) ───────────
  if (interaction.isButton() && interaction.customId.startsWith('confirm_follow_')) {
    const handle = interaction.customId.replace('confirm_follow_', '');
    try {
      // Make sure user exists in DB first
      q.upsertMember.run(interaction.user.id, interaction.user.username);
      // Set x_handle and x_verified directly to avoid UPDATE miss
      const db = require('./db').db;
      db.prepare('UPDATE members SET x_handle = ?, x_verified = 1 WHERE discord_id = ?')
        .run(handle, interaction.user.id);

      // Verify it actually saved
      const check = q.getMember.get(interaction.user.id);
      if (!check || !check.x_verified) {
        // Force insert if update missed
        db.prepare('INSERT OR REPLACE INTO members (discord_id, username, x_handle, x_verified) VALUES (?, ?, ?, 1)')
          .run(interaction.user.id, interaction.user.username, handle);
      }

      await interaction.update({
        content: `Linked **@${handle}** to your account. You're all set.\n\nWhen new @QANAT_IO posts drop in <#${config.CHANNELS.X_TASKS}>, engage on X then react to claim your points.\n\n👍 Like = 1pt | 💬 Comment = 2pt | 🔄 Retweet = 3pt | ⭐ All three = 6pt`,
        components: [],
      });

      console.log(`[LinkX] ${interaction.user.tag} linked @${handle}`);
    } catch (err) {
      console.error('Follow confirm error:', err);
      try {
        await interaction.reply({ content: 'Something went wrong. Try /linkx again.', ephemeral: true });
      } catch {}
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  try {
    switch (interaction.commandName) {
      case 'points':              await cmdPoints(interaction); break;
      case 'leaderboard':         await cmdLeaderboard(interaction); break;
      case 'invites':             await cmdInvites(interaction); break;
      case 'invitesleaderboard':  await cmdInvitesLeaderboard(interaction); break;
      case 'linkx':               await cmdLinkX(interaction); break;
      case 'faq':                 await cmdFAQ(interaction); break;
      case 'joinvc':              await cmdJoinVC(interaction); break;
      case 'leavevc':             await cmdLeaveVC(interaction); break;
      case 'vcsummary':           await cmdVCSummary(interaction); break;
      case 'vcrecord':            await cmdVCRecord(interaction); break;
      case 'help':                await cmdHelp(interaction); break;
      case 'xcheck':              await cmdXCheck(interaction); break;
      case 'myprofile':           await cmdMyProfile(interaction); break;
      case 'modstats':            await cmdModStats(interaction); break;
      case 'announce':            await cmdAnnounce(interaction); break;
      case 'posttweet':           await cmdPostTweet(interaction); break;
      case 'verifyx':             await cmdVerifyX(interaction); break;
      default: await interaction.reply({ content: 'Unknown command.', ephemeral: true });
    }
  } catch (err) {
    console.error(`Cmd error (${interaction.commandName}):`, err);
    const r = { content: 'Something went wrong.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(r);
    else await interaction.reply(r);
  }
});

// ═══════════════════════════════════════════════════════════════
// COMMAND IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

async function cmdPoints(interaction) {
  const t = interaction.options.getUser('user') || interaction.user;
  q.upsertMember.run(t.id, t.username);
  const m = q.getMember.get(t.id);
  const embed = new EmbedBuilder().setColor(config.BOT_COLOR).setTitle('Engagement Points')
    .addFields(
      { name: 'Member', value: `<@${t.id}>`, inline: true },
      { name: 'Total', value: `**${m?.total_points || 0}**`, inline: true },
      { name: 'X', value: m?.x_verified ? `@${m.x_handle}` : 'Not linked', inline: true },
    );
  await interaction.reply({ embeds: [embed] });
}

async function cmdLeaderboard(interaction) {
  const limit = interaction.options.getInteger('limit') || 10;
  const rows = q.getLeaderboard.all(limit);
  if (!rows.length) return interaction.reply({ content: 'No points yet.', ephemeral: true });
  const lines = rows.map((r, i) => {
    const rank = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i+1}th`;
    return `**${rank}** <@${r.discord_id}> ${r.total_points} pts`;
  });
  const embed = new EmbedBuilder().setColor(0xFFD700).setTitle('Engagement Leaderboard')
    .setDescription(lines.join('\n')).setFooter({ text: `Top ${rows.length}` });
  await interaction.reply({ embeds: [embed] });
}

async function cmdInvites(interaction) {
  const t = interaction.options.getUser('user') || interaction.user;
  q.upsertMember.run(t.id, t.username);
  const m = q.getMember.get(t.id);
  await interaction.reply(`<@${t.id}> has **${m?.invite_count || 0}** invite${(m?.invite_count||0) !== 1 ? 's' : ''}.`);
}

async function cmdInvitesLeaderboard(interaction) {
  const limit = interaction.options.getInteger('limit') || 10;
  const rows = q.getInviteLeaderboard.all(limit);
  if (!rows.length) return interaction.reply({ content: 'No invites yet.', ephemeral: true });
  const lines = rows.map((r, i) => {
    const rank = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i+1}th`;
    return `**${rank}** <@${r.discord_id}> ${r.invite_count} invites`;
  });
  const embed = new EmbedBuilder().setColor(0x57F287).setTitle('Invite Leaderboard')
    .setDescription(lines.join('\n')).setFooter({ text: `Top ${rows.length}` });
  await interaction.reply({ embeds: [embed] });
}

async function cmdLinkX(interaction) {
  let handle = interaction.options.getString('handle').trim();
  if (handle.startsWith('@')) handle = handle.substring(1);
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
    return interaction.reply({ content: `That doesn't look like a valid X handle. Just the username, no @ symbol. Example: \`/linkx handle:QANAT_IO\``, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  // Step 1: Verify the handle actually exists on X
  try {
    const checkUrl = `https://publish.twitter.com/oembed?url=https://x.com/${handle}&omit_script=true`;
    const res = await fetch(checkUrl);
    if (res.status === 404 || !res.ok) {
      return interaction.editReply(`The handle **@${handle}** doesn't exist on X. Double check the spelling and try again.`);
    }
  } catch {
    return interaction.editReply(`Couldn't verify that handle right now. Try again in a minute.`);
  }

  // Step 2: Check they're not linking someone else's already-linked handle
  const db = require('./db').db;
  const existingUser = db.prepare('SELECT discord_id FROM members WHERE x_handle = ? AND discord_id != ?').get(handle.toLowerCase(), interaction.user.id);
  if (existingUser) {
    return interaction.editReply(`That handle is already linked to another member. If this is your account, contact a staff member.`);
  }

  q.upsertMember.run(interaction.user.id, interaction.user.username);

  // Step 3: Show follow confirmation button
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Open @QANAT_IO on X')
      .setStyle(ButtonStyle.Link)
      .setURL('https://x.com/QANAT_IO'),
    new ButtonBuilder()
      .setCustomId(`confirm_follow_${handle}`)
      .setLabel('I follow @QANAT_IO')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
  );

  await interaction.editReply({
    content: `Found **@${handle}** on X.\n\nBefore I link your account, make sure you follow **@QANAT_IO**. If you haven't yet, click the button below to open their profile and follow them.\n\nOnce you're following, click **"I follow @QANAT_IO"** to confirm and link your account.`,
    components: [row],
  });
}

async function cmdFAQ(interaction) {
  const question = interaction.options.getString('question');
  if (!question) {
    const faqs = getAllFAQ();
    const embed = new EmbedBuilder().setColor(config.BOT_COLOR).setTitle('QANAT FAQ')
      .setDescription(faqs.map(f => `**${f.index}.** ${f.question}`).join('\n'))
      .setFooter({ text: 'Use /faq followed by your question' });
    return interaction.reply({ embeds: [embed] });
  }
  const m = matchFAQ(question);
  if (m) await interaction.reply(m.answer);
  else await interaction.reply(`Not sure about that one. Ask here and someone from the team will help.`);
}

async function cmdJoinVC(interaction) {
  const result = await voice.joinVC(interaction);
  if (result.success) {
    await interaction.reply(result.message);
    logModAction(interaction.guild, interaction.user.id, 'vc_join', `Joined VC via command`);
  } else {
    await interaction.reply({ content: result.message, ephemeral: true });
  }
}

async function cmdLeaveVC(interaction) {
  if (!voice.isInVC(interaction.guildId)) {
    return interaction.reply({ content: 'Not in a voice channel.', ephemeral: true });
  }
  await interaction.deferReply();
  const summary = await voice.leaveVC(interaction.guildId);
  if (summary) {
    await interaction.editReply(`Left the channel.\n\n**Session Summary:**\n${summary}`);
  } else {
    await interaction.editReply('Left. Later.');
  }
}

async function cmdVCSummary(interaction) {
  if (!voice.isInVC(interaction.guildId)) {
    return interaction.reply({ content: 'I\'m not in a voice channel right now.', ephemeral: true });
  }
  await interaction.deferReply();
  const summary = await voice.getFullSummary(interaction.guildId);
  await interaction.editReply(summary || 'No activity to summarize yet.');
}

async function cmdVCRecord(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
  const session = voice.getSession(interaction.guildId);
  if (!session) return interaction.reply({ content: 'I\'m not in a voice channel.', ephemeral: true });
  session.recording = !session.recording;
  await interaction.reply(`Recording is now **${session.recording ? 'ON' : 'OFF'}**.`);
}

async function cmdHelp(interaction) {
  const embed = new EmbedBuilder().setColor(config.BOT_COLOR).setTitle('QANAT Bot')
    .addFields(
      { name: 'Engagement', value: '`/points` `/leaderboard` `/linkx` `/xcheck`', inline: false },
      { name: 'Invites', value: '`/invites` `/invitesleaderboard`', inline: false },
      { name: 'Info', value: '`/faq` `/myprofile` `/help`', inline: false },
      { name: 'Voice', value: '`/joinvc` `/leavevc` `/vcsummary` `/vcrecord`', inline: false },
      { name: 'Staff', value: '`/announce` `/modstats`', inline: false },
      { name: 'Points', value: 'Link X with /linkx, follow @QANAT_IO, engage on X, react here. Like=1 Comment=2 RT=3', inline: false },
    );
  await interaction.reply({ embeds: [embed] });
}

async function cmdXCheck(interaction) {
  const t = interaction.options.getUser('user') || interaction.user;
  const m = q.getMember.get(t.id);
  if (!m?.x_verified) return interaction.reply({ content: 'X account not linked. Use /linkx.', ephemeral: true });
  const db = require('./db').db;
  const bd = db.prepare('SELECT action_type, COUNT(*) as count, SUM(points) as total FROM x_engagements WHERE discord_id = ? GROUP BY action_type').all(t.id);
  const likes = bd.find(b => b.action_type === 'like') || { count:0, total:0 };
  const rts = bd.find(b => b.action_type === 'retweet') || { count:0, total:0 };
  const cmts = bd.find(b => b.action_type === 'comment') || { count:0, total:0 };
  const embed = new EmbedBuilder().setColor(0x1DA1F2).setTitle(`X Engagement @${m.x_handle}`)
    .addFields(
      { name: 'Likes', value: `${likes.count} (${likes.total}pts)`, inline: true },
      { name: 'Comments', value: `${cmts.count} (${cmts.total}pts)`, inline: true },
      { name: 'Retweets', value: `${rts.count} (${rts.total}pts)`, inline: true },
      { name: 'Total', value: `**${m.total_points}**`, inline: false },
    );
  await interaction.reply({ embeds: [embed] });
}

async function cmdMyProfile(interaction) {
  q.upsertMember.run(interaction.user.id, interaction.user.username);
  const d = q.getMember.get(interaction.user.id);
  const s = q.getStreak.get(interaction.user.id, 'gm');
  const embed = new EmbedBuilder().setColor(config.BOT_COLOR).setTitle(interaction.user.displayName)
    .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Points', value: `${d?.total_points||0}`, inline: true },
      { name: 'Invites', value: `${d?.invite_count||0}`, inline: true },
      { name: 'GM Streak', value: `${s?.streak_count||0} days`, inline: true },
      { name: 'X', value: d?.x_verified ? `@${d.x_handle}` : 'Not linked', inline: true },
    );
  await interaction.reply({ embeds: [embed] });
}

async function cmdModStats(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
  const limit = interaction.options.getInteger('limit') || 10;
  const actions = q.getModActions.all(limit);
  if (!actions.length) return interaction.reply({ content: 'No actions yet.', ephemeral: true });
  const lines = actions.map(a => {
    const t = `<t:${Math.floor(new Date(a.created_at).getTime()/1000)}:R>`;
    return `${t} **${a.action_type}** ${a.discord_id?`<@${a.discord_id}>`:'System'}\n${a.reason}`;
  });
  const embed = new EmbedBuilder().setColor(0xED4245).setTitle('Mod Log').setDescription(lines.join('\n\n')).setFooter({ text: `Last ${actions.length}` });
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function cmdAnnounce(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });
  const title = interaction.options.getString('title');
  const body = interaction.options.getString('body');
  const targetChannel = interaction.options.getChannel('channel') || interaction.guild.channels.cache.get(config.CHANNELS.ANNOUNCEMENTS) || interaction.channel;
  const color = interaction.options.getString('color') || '#00A8E8';
  const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;
  const imageUrl = interaction.options.getString('image');
  const footerText = interaction.options.getString('footer');

  const embed = new EmbedBuilder().setColor(parseInt(color.replace('#',''),16)).setTitle(title).setDescription(body).setTimestamp();
  if (imageUrl) embed.setImage(imageUrl);
  embed.setFooter({ text: footerText || interaction.user.displayName });

  try {
    await targetChannel.send({ content: pingEveryone ? '@everyone' : undefined, embeds: [embed], allowedMentions: pingEveryone ? { parse: ['everyone'] } : {} });
    if (targetChannel.id === config.CHANNELS.ANNOUNCEMENTS) {
      const gen = interaction.guild.channels.cache.get(config.CHANNELS.GENERAL);
      if (gen) await gen.send('New announcement just went up, check it out.');
    }
    await interaction.reply({ content: `Sent to <#${targetChannel.id}>.`, ephemeral: true });
    logModAction(interaction.guild, interaction.user.id, 'announcement', `"${title}" in #${targetChannel.name}`);
  } catch { await interaction.reply({ content: 'Could not send. Check permissions.', ephemeral: true }); }
}

async function cmdVerifyX(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });

  const targetUser = interaction.options.getUser('user');
  const revoke = interaction.options.getBoolean('revoke') || false;
  const member = q.getMember.get(targetUser.id);

  if (!member || !member.x_verified) {
    return interaction.reply({ content: `<@${targetUser.id}> hasn't linked an X account.`, ephemeral: true });
  }

  if (revoke) {
    const db = require('./db').db;
    db.prepare('UPDATE members SET x_handle = NULL, x_verified = 0, total_points = 0 WHERE discord_id = ?').run(targetUser.id);
    db.prepare('DELETE FROM x_engagements WHERE discord_id = ?').run(targetUser.id);
    db.prepare('DELETE FROM points_ledger WHERE discord_id = ?').run(targetUser.id);

    await interaction.reply({
      content: `Revoked **@${member.x_handle}** from <@${targetUser.id}>. Their X link and all engagement points have been reset.`,
      ephemeral: true,
    });

    logModAction(interaction.guild, targetUser.id, 'x_revoke',
      `X link @${member.x_handle} revoked by ${interaction.user.tag}. Points reset.`);
    return;
  }

  // Show info
  const db = require('./db').db;
  const engagements = db.prepare('SELECT COUNT(*) as count FROM x_engagements WHERE discord_id = ?').get(targetUser.id);

  await interaction.reply({
    content: `**X Verification Check**\n` +
      `Member: <@${targetUser.id}>\n` +
      `Linked handle: **@${member.x_handle}** ([view profile](https://x.com/${member.x_handle}))\n` +
      `Points: **${member.total_points}**\n` +
      `Engagements claimed: **${engagements?.count || 0}**\n\n` +
      `Check their X profile to confirm they follow @QANAT_IO. Use \`/verifyx user:@${targetUser.username} revoke:True\` to remove their link and reset points if they're not following.`,
    ephemeral: true,
  });
}

async function cmdPostTweet(interaction) {
  if (!isAdmin(interaction.member)) return interaction.reply({ content: 'Staff only.', ephemeral: true });

  const url = interaction.options.getString('url').trim();
  const customMsg = interaction.options.getString('message') || '';

  // Validate URL
  const tweetMatch = url.match(/https?:\/\/(?:x\.com|twitter\.com)\/(\w+)\/status\/(\d+)/i);
  if (!tweetMatch) {
    return interaction.reply({ content: 'That doesn\'t look like a valid tweet URL. Use something like `https://x.com/QANAT_IO/status/123456`', ephemeral: true });
  }

  const tweetUser = tweetMatch[1];
  const tweetId = tweetMatch[2];

  // Check if already tracked
  const { queries: dbq } = require('./db');
  const existing = dbq.getTweet.get(tweetId);
  if (existing) {
    return interaction.reply({ content: 'That tweet is already being tracked.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  // Fetch tweet text via oEmbed
  let tweetText = '';
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      tweetText = (data.html || '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n').trim();
      if (tweetText.length > 300) tweetText = tweetText.substring(0, 297) + '...';
    }
  } catch {}

  // Send to X Tasks channel
  const taskChannel = interaction.guild.channels.cache.get(config.CHANNELS.X_TASKS);
  if (!taskChannel) {
    return interaction.editReply('Could not find the X Tasks channel.');
  }

  const postContent =
    (customMsg ? `${customMsg}\n\n` : `**New post from @${tweetUser} just dropped!** @everyone\n\n`) +
    `Engage on X, then react below to claim your points.\n\n` +
    (tweetText ? `> ${tweetText.split('\n').join('\n> ')}\n\n` : '') +
    `**Claim your points:**\n` +
    `👍 I liked it = **1 point**\n` +
    `💬 I commented = **2 points**\n` +
    `🔄 I retweeted/quoted = **3 points**\n` +
    `⭐ I did all three = **6 points**\n\n` +
    `You must follow @QANAT_IO and link your X with \`/linkx\` first.\n\n` +
    url;

  const trackingMsg = await taskChannel.send({
    content: postContent,
    allowedMentions: { parse: ['everyone'] },
  });

  await trackingMsg.react('👍');
  await trackingMsg.react('💬');
  await trackingMsg.react('🔄');
  await trackingMsg.react('⭐');

  dbq.addTweet.run(tweetId, url, tweetText || 'No text', trackingMsg.id);

  await interaction.editReply(`Posted in <#${config.CHANNELS.X_TASKS}>. Tracking engagement for tweet ${tweetId}.`);
  logModAction(interaction.guild, interaction.user.id, 'tweet_post', `Posted tweet tracking for @${tweetUser}/status/${tweetId}`);
}

// ═══════════════════════════════════════════════════════════════
// MOD ACTION LOG
// ═══════════════════════════════════════════════════════════════

async function logModAction(guild, discordId, actionType, reason, channelId = null) {
  q.logModAction.run(discordId, actionType, reason, channelId);
  try {
    const ch = guild.channels.cache.get(config.CHANNELS.MOD_REPORT);
    if (ch) {
      const ts = `<t:${Math.floor(Date.now()/1000)}:f>`;
      await ch.send(`**${actionType.replace(/_/g,' ')}** ${discordId?`<@${discordId}>`:'System'}\n${reason}\n${ts}`);
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULED TASKS
// ═══════════════════════════════════════════════════════════════

function startScheduledTasks() {
  const getGuild = () => client.guilds.cache.get(config.GUILD_ID);
  const getCh = (id) => getGuild()?.channels.cache.get(id);

  // ── Game Night Announcement (Tue, Thu, Fri 9AM UTC) ────
  cron.schedule(config.GAME_NIGHT_ANNOUNCE_CRON, async () => {
    const ch = getCh(config.CHANNELS.MINI_UPDATES);
    if (!ch) return;

    await ch.send({
      content: `# <a:gamer:1410856341324431370>  GAME NIGHT INCOMING <:QANAT:1458029632367362151> \n\n**Get ready everyone! Game Night starts at 3 PM UTC**\n\n*Come join the fun, connect with the community, and earn points.* <a:BlobGame:954634525630156821> \n\n<a:GIFT3:1169855474745745439>  Raffle incoming, so make sure you stack your points to enter. There will be raffle each moment we hit milestones after completing mission. \n\n**__You can earn points by:__**\n<:Purple_Arrow:1325962822802473023>  Actively engaging in meaningful discussions (no spam)\n<:Purple_Arrow:1325962822802473023>  Attending community events\n<:Purple_Arrow:1325962822802473023>  Completing missions and quests\n<:Purple_Arrow:1325962822802473023>  Participating in games and activities\n<:Purple_Arrow:1325962822802473023>  post about QANAT\n\n*Show up, have fun, and earn your chance to win.* <a:TCL_partykirby:1425476212431655032> \n\n**See you at 3 PM UTC!** <a:greenfire:989753310737207366> \n\n|| @everyone <@&${config.ROLES.VERIFIED}>  ||`,
      allowedMentions: { parse: ['everyone'], roles: [config.ROLES.VERIFIED] },
    });
    console.log('[Scheduler] Game Night announcement sent');
  });

  // ── Game Night Reminder (30 min before, 2:30 PM UTC) ───
  cron.schedule(config.GAME_NIGHT_REMINDER_CRON, async () => {
    const ch = getCh(config.CHANNELS.MINI_UPDATES);
    if (!ch) return;

    await ch.send({
      content: `**30 minutes until Game Night!** <a:gamer:1410856341324431370>\n\nGet ready, we're starting at **3 PM UTC**. Don't miss out on the fun and points! @everyone`,
      allowedMentions: { parse: ['everyone'] },
    });
    console.log('[Scheduler] Game Night reminder sent');
  });

  // ── Wednesday X Space Reminder (for admin in staff chat) ─
  cron.schedule(config.XSPACE_REMINDER_CRON, async () => {
    const ch = getCh(config.CHANNELS.STAFF_CHAT);
    if (!ch) return;

    await ch.send({
      content: `<@&${config.ROLES.ADMIN}> Quick reminder, it's Wednesday. Time to set up the X Space announcement if there's one planned this week. Drop the details and I can help push it to the community.`,
      allowedMentions: { roles: [config.ROLES.ADMIN] },
    });
    console.log('[Scheduler] X Space reminder sent');
  });

  // ── Contributor Report Summary (8 AM UTC) ──────────────
  cron.schedule(config.CONTRIBUTOR_SUMMARY_CRON, async () => {
    const guild = getGuild();
    if (!guild) return;

    const reportCh = getCh(config.CHANNELS.CONTRIBUTOR_REPORT);
    const staffCh = getCh(config.CHANNELS.STAFF_CHAT);
    if (!reportCh || !staffCh) return;

    try {
      // Fetch last 24h of messages
      const messages = await reportCh.messages.fetch({ limit: 50 });
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const recent = messages.filter(m => m.createdTimestamp > cutoff && !m.author.bot);

      if (recent.size === 0) {
        await staffCh.send(`<@&${config.ROLES.ADMIN}> No new contributor reports in the last 24 hours.`);
        return;
      }

      const reportText = recent.map(m => `${m.author.displayName}: ${m.content}`).reverse().join('\n');
      const summary = await ai.summarizeText(reportText);

      if (summary) {
        await staffCh.send({
          content: `<@&${config.ROLES.ADMIN}> **Contributor Report Summary** (last 24h, ${recent.size} reports):\n\n${summary}`,
          allowedMentions: { roles: [config.ROLES.ADMIN] },
        });
      } else {
        await staffCh.send({
          content: `<@&${config.ROLES.ADMIN}> ${recent.size} contributor reports came in yesterday. Check <#${config.CHANNELS.CONTRIBUTOR_REPORT}> for details.`,
          allowedMentions: { roles: [config.ROLES.ADMIN] },
        });
      }
    } catch (err) {
      console.error('[Scheduler] Report summary error:', err.message);
    }

    console.log('[Scheduler] Contributor summary sent');
  });

  // ── Staff Reminder (8:30 AM UTC) ──────────────────────
  cron.schedule(config.STAFF_REMINDER_CRON, async () => {
    const ch = getCh(config.CHANNELS.STAFF_CHAT);
    if (!ch) return;
    const day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getUTCDay()];
    await ch.send({
      content: `Morning team. <@&${config.ROLES.ADMIN}> ${day} rundown:\n\nCommunity: check support tickets, review mod log, engage in general, check new intros\nGrowth: post on @QANAT_IO, update weekly mission, review community content\nModeration: verify pending members, check flagged messages\n\nLet's have a solid day.`,
      allowedMentions: { roles: [config.ROLES.ADMIN] },
    });
    console.log('[Scheduler] Staff reminder sent');
  });

  // ── Contributor Motivation (9 AM UTC) ──────────────────
  cron.schedule(config.CONTRIBUTOR_MOTIVATION_CRON, async () => {
    const ch = getCh(config.CHANNELS.CONTRIBUTOR_CHAT);
    if (!ch) return;
    const msgs = [
      `Morning <@&${config.ROLES.CONTRIBUTOR}>. What's everyone working on today?`,
      `New day <@&${config.ROLES.CONTRIBUTOR}>. Even small progress adds up. What's the focus?`,
      `<@&${config.ROLES.CONTRIBUTOR}> check in. The builders make this real. What are you tackling?`,
      `<@&${config.ROLES.CONTRIBUTOR}>, consistency wins. What's today's focus?`,
      `Checking in <@&${config.ROLES.CONTRIBUTOR}>. Code, content, community, whatever it is. Share what you're doing.`,
      `<@&${config.ROLES.CONTRIBUTOR}> another day, another push. What's on the agenda?`,
      `GM <@&${config.ROLES.CONTRIBUTOR}>. The ones who show up daily are the ones who shape what comes next.`,
    ];
    await ch.send({ content: pick(msgs), allowedMentions: { roles: [config.ROLES.CONTRIBUTOR] } });
    console.log('[Scheduler] Contributor motivation sent');
  });

  // ── General Engagement (every 4h) ─────────────────────
  cron.schedule(config.GENERAL_ENGAGEMENT_CRON, async () => {
    const ch = getCh(config.CHANNELS.GENERAL);
    if (!ch) return;
    const msgs = [
      `Something worth thinking about: how many apps have access to your personal data right now? That's what QANAT is solving with Web X. OS.`,
      `The whitepaper breaks down how QANAT approaches digital sovereignty. It's at qanat.io if you haven't checked it out.`,
      `Want to earn engagement points? Link your X with /linkx and engage with @QANAT_IO posts when they drop.`,
      `Beta is coming, mainnet after that. If you're here now, you're ahead of most people.`,
      `Anyone building anything interesting lately? Curious what people in this community are up to.`,
      `Every time you use an app without knowing what data they collect, you're giving something away. QANAT is building a world where that changes.`,
      `Use /leaderboard to see where you stand. If you've been engaging on X, make sure to claim your points.`,
      `Digital sovereignty is the direction the internet needs to go. QANAT is building the infrastructure to make it real.`,
    ];
    const idx = Math.floor(Date.now() / (4*3600*1000)) % msgs.length;
    await ch.send(msgs[idx]);
    console.log('[Scheduler] General engagement sent');
  });

  // ── AI Conversation Starter (every 2 hours) ────────────
  cron.schedule(config.CONVO_STARTER_CRON, async () => {
    const ch = getCh(config.CHANNELS.GENERAL);
    if (!ch) return;

    const starter = await ai.generateConvoStarter();
    if (starter) {
      await ch.send(starter);
      ai.addToBuffer(config.CHANNELS.GENERAL, 'QANAT', starter, true);
      console.log('[Scheduler] Convo starter sent');
    }
  });

  // ── Announcement Watcher ───────────────────────────────
  setTimeout(() => {
    const ch = getCh(config.CHANNELS.ANNOUNCEMENTS);
    if (!ch) return;
    const collector = ch.createMessageCollector({ filter: m => !m.author.bot });
    collector.on('collect', async () => {
      const gen = getCh(config.CHANNELS.GENERAL);
      if (gen && !isOnCooldown('ann-notify', 300)) {
        await gen.send('New announcement just went up, worth checking out.');
      }
    });
  }, 5000);

  console.log('[Scheduler] All tasks started');
}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════

const http = require('http');
http.createServer((req, res) => { res.writeHead(200); res.end('OK'); })
  .listen(process.env.PORT || 3000);

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════

if (!process.env.DISCORD_TOKEN) { console.error('Missing DISCORD_TOKEN'); process.exit(1); }
client.login(process.env.DISCORD_TOKEN).catch(err => { console.error('Login failed:', err.message); process.exit(1); });
process.on('SIGINT', () => { client.destroy(); process.exit(0); });
process.on('unhandledRejection', (err) => console.error('Unhandled:', err));
