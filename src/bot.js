// ═══════════════════════════════════════════════════════════════
//
//  QANAT -- Community Manager & Moderator Bot
//  Digital Sovereignty by Design
//
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();

const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, Collection,
} = require('discord.js');

const {
  joinVoiceChannel, getVoiceConnection,
  VoiceConnectionStatus, entersState,
} = require('@discordjs/voice');

const cron = require('node-cron');
const config = require('./config');
const { queries: q, awardPoints, recordEngagement, recordInvite } = require('./db');
const { matchFAQ, getAllFAQ } = require('./faq');
const { startXMonitor } = require('./xmonitor');
const { thinkAndReply, isQANATRelated, isQuestion, findTopic, getTopicResponse } = require('./knowledge');

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
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.GuildMember,
  ],
});

const inviteCache = new Collection();

const cooldowns = new Map();
function isOnCooldown(key, seconds = 30) {
  const now = Date.now();
  if (cooldowns.has(key) && now - cooldowns.get(key) < seconds * 1000) return true;
  cooldowns.set(key, now);
  return false;
}

// Track recent messages per channel to avoid repeating ourselves
const recentBotMessages = new Map();

function isAdmin(member) {
  if (!member) return false;
  return member.roles?.cache?.has(config.ROLES.ADMIN) ||
    member.permissions?.has(PermissionFlagsBits.Administrator);
}

// ═══════════════════════════════════════════════════════════════
// CONVERSATIONAL ENGINE
// Uses knowledge.js for deep QANAT understanding
// Thinks before replying, never gives generic responses
// ═══════════════════════════════════════════════════════════════

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Track recent messages to understand conversation flow
const conversationHistory = [];
const MAX_HISTORY = 20;

function trackMessage(channelId, authorName, content) {
  conversationHistory.push({ channelId, authorName, content, time: Date.now() });
  if (conversationHistory.length > MAX_HISTORY) conversationHistory.shift();
}

function getRecentContext(channelId, limit = 5) {
  return conversationHistory
    .filter(m => m.channelId === channelId)
    .slice(-limit);
}

// ═══════════════════════════════════════════════════════════════
// READY
// ═══════════════════════════════════════════════════════════════

client.once('ready', async () => {
  console.log(`\n  QANAT Bot is online as ${client.user.tag}`);
  console.log(`  Guild: ${config.GUILD_ID}`);
  console.log(`  ${new Date().toISOString()}\n`);

  try {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (guild) {
      const invites = await guild.invites.fetch();
      invites.forEach(inv => inviteCache.set(inv.code, inv.uses));
      console.log(`  Cached ${invites.size} invites`);
    }
  } catch (err) {
    console.error('Invite cache error:', err.message);
  }

  startXMonitor(client);
  startScheduledTasks();

  client.user.setPresence({
    activities: [{ name: 'Guarding QANAT', type: 3 }],
    status: 'online',
  });
});

// ═══════════════════════════════════════════════════════════════
// MEMBER JOIN -- Welcome & Invite Tracking
// ═══════════════════════════════════════════════════════════════

client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;

  q.upsertMember.run(member.id, member.user.username);

  // Welcome -- warm, step-by-step, not overwhelming
  const welcomeChannel = member.guild.channels.cache.get(config.CHANNELS.WELCOME);
  if (welcomeChannel) {
    const name = member.user.displayName;
    const welcomes = [
      `Hey <@${member.id}>, welcome to QANAT! Glad you're here.\n\n` +
      `First thing, go say hi in <#${config.CHANNELS.INTRODUCTION}> so people know who you are. ` +
      `After that, take a quick look at <#${config.CHANNELS.RULES}> and then verify yourself in <#${config.CHANNELS.VERIFY}> to get full access. ` +
      `No rush though, settle in at your own pace.`,

      `<@${member.id}> just joined, welcome! Good to have you.\n\n` +
      `Quick start: drop an intro about yourself in <#${config.CHANNELS.INTRODUCTION}> and check out <#${config.CHANNELS.RULES}>. ` +
      `Once you're verified in <#${config.CHANNELS.VERIFY}>, you'll have full access to everything. See you around.`,

      `Welcome in, <@${member.id}>! You picked a good time to join.\n\n` +
      `Start by introducing yourself in <#${config.CHANNELS.INTRODUCTION}>, then hop over to <#${config.CHANNELS.VERIFY}> to get your verified role. ` +
      `If you want to know more about what QANAT is building, just ask. We're friendly here.`,
    ];

    await welcomeChannel.send(pick(welcomes));
  }

  // Invite tracking
  try {
    const newInvites = await member.guild.invites.fetch();
    const usedInvite = newInvites.find(inv => {
      const oldUses = inviteCache.get(inv.code) || 0;
      return inv.uses > oldUses;
    });

    newInvites.forEach(inv => inviteCache.set(inv.code, inv.uses));

    if (usedInvite && usedInvite.inviter) {
      const inviterId = usedInvite.inviter.id;
      q.upsertMember.run(inviterId, usedInvite.inviter.username);
      recordInvite(inviterId, member.id, usedInvite.code);

      const inviterData = q.getMember.get(inviterId);
      const count = inviterData?.invite_count || 1;

      const inviteChannel = member.guild.channels.cache.get(config.CHANNELS.INVITES);
      if (inviteChannel) {
        await inviteChannel.send(
          `**${member.user.displayName}** just joined through <@${inviterId}>'s invite. ` +
          `That's ${count} total now.`
        );
      }
    }
  } catch (err) {
    console.error('Invite tracking error:', err.message);
  }

  logModAction(member.guild, null, 'member_join', `${member.user.tag} joined the server`);
});

// ═══════════════════════════════════════════════════════════════
// MESSAGE CREATE
// ═══════════════════════════════════════════════════════════════

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const channelId = message.channel.id;

  // Never respond in blocked channels
  if (config.BLOCKED_CHANNELS.includes(channelId)) return;

  const content = message.content;
  const lower = content.toLowerCase().trim();

  q.upsertMember.run(message.author.id, message.author.username);

  // Respect admin -- never correct, moderate, or lecture admins
  const memberIsAdmin = isAdmin(message.member);

  // ── GM/GN Channel ──────────────────────────────────────
  if (channelId === config.CHANNELS.GM_GN) {
    await handleGMGN(message, lower, memberIsAdmin);
    return;
  }

  // ── Moderation -- phishing detection (skip admins) ─────
  if (!memberIsAdmin) {
    const wasPhishing = await handlePhishingCheck(message, lower);
    if (wasPhishing) return;
  }

  // Track all messages for context awareness
  const authorName = message.member?.displayName || message.author.displayName || message.author.username;
  trackMessage(channelId, authorName, content);

  // ── Conversational channels (General, FAQ, Introduction) ──
  const talkChannels = [config.CHANNELS.GENERAL, config.CHANNELS.FAQ, config.CHANNELS.INTRODUCTION];
  if (talkChannels.includes(channelId)) {
    await handleConversation(message, lower, memberIsAdmin, authorName);
  }

  // ── Content & Meme reactions ───────────────────────────
  if (channelId === config.CHANNELS.CONTENT_CREATION) {
    if (content.includes('http') || message.attachments.size > 0) {
      await message.react('🔥');
    }
  }

  if (channelId === config.CHANNELS.MEME) {
    if (message.attachments.size > 0 || content.includes('http')) {
      await message.react('😂');
    }
  }

  // ── Self-promo detection (warning only, skip admins) ───
  if (!memberIsAdmin) {
    await handleSelfPromoCheck(message, lower);
  }
});

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
    // Only correct non-admins, and keep it casual
    await message.reply(
      `This one's just for GM and GN. General chat is over in <#${config.CHANNELS.GENERAL}>.`
    );
  }
}

// ── Conversation Handler ─────────────────────────────────────
// Reads messages, thinks, and replies only when it has something real to say

async function handleConversation(message, lower, memberIsAdmin, authorName) {
  const mentionsBot = message.mentions.has(client.user);
  const isBotQuestion = isQuestion(lower);
  const isAboutQANAT = isQANATRelated(lower);

  // PRIORITY 1: Always respond when directly mentioned
  if (mentionsBot) {
    // Clean the mention from the text for better matching
    const cleanText = message.content.replace(/<@!?\d+>/g, '').trim();
    const result = thinkAndReply(cleanText || lower, authorName);

    if (result) {
      await message.reply(result.response);
    } else if (isBotQuestion) {
      // It's a question we can't match to a topic
      const fallbacks = [
        `Hmm, I'm not sure about that one, ${authorName}. Can you give me a bit more context?`,
        `Good question. I don't have a solid answer on that. If it's product-specific, try tagging <@377033754083983361>.`,
        `Not 100% sure on that. What specifically are you looking for? I'll try to help.`,
      ];
      await message.reply(pick(fallbacks));
    } else {
      // Not a question, just a mention. Engage naturally.
      const result2 = thinkAndReply(cleanText || lower, authorName);
      if (result2) {
        await message.reply(result2.response);
      }
      // If still nothing matches, stay quiet. Don't force "what's on your mind"
    }
    return;
  }

  // PRIORITY 2: Questions about QANAT in conversation channels
  if (isBotQuestion && isAboutQANAT && !isOnCooldown(`conv-${message.author.id}`, 60)) {
    const result = thinkAndReply(lower, authorName);
    if (result) {
      await message.reply(result.response);
      return;
    }
  }

  // PRIORITY 3: Someone asks a clear question (even if not about QANAT)
  if (isBotQuestion && !isOnCooldown(`conv-${message.author.id}`, 120)) {
    const result = thinkAndReply(lower, authorName);
    if (result) {
      await message.reply(result.response);
      return;
    }
  }

  // PRIORITY 4: Jump into QANAT-related conversations occasionally
  if (isAboutQANAT && !isOnCooldown('qanat-engage', 600)) {
    // Only if the message is substantial (not just "qanat" in passing)
    if (lower.length > 30) {
      const result = thinkAndReply(lower, authorName);
      if (result) {
        // Don't reply to every QANAT mention, be selective
        const shouldReply = Math.random() < 0.4;
        if (shouldReply) {
          await message.reply(result.response);
          return;
        }
      }
    }
  }

  // PRIORITY 5: React naturally to certain messages (no text reply)
  if (!isOnCooldown('react-engage', 120)) {
    if (/\b(lfg|let'?s go|bullish|we'?re? early|love this|hyped)\b/i.test(lower)) {
      await message.react('🔥');
    }
  }
}

// ── Phishing Detection ──────────────────────────────────────

async function handlePhishingCheck(message, lower) {
  const urlRegex = /https?:\/\/[^\s<]+/gi;
  const urls = message.content.match(urlRegex);
  if (!urls || urls.length === 0) return false;

  for (const url of urls) {
    const urlLower = url.toLowerCase();

    // Skip safe domains (X, GIFs, YouTube, etc.)
    const isSafe = config.SAFE_DOMAINS.some(domain => {
      try {
        const hostname = new URL(urlLower).hostname;
        return hostname === domain || hostname.endsWith('.' + domain);
      } catch {
        return urlLower.includes(domain);
      }
    });
    if (isSafe) continue;

    // Skip official QANAT invite
    if (urlLower.includes(`discord.gg/${config.OFFICIAL_INVITE}`)) continue;
    if (urlLower.includes(`discord.com/invite/${config.OFFICIAL_INVITE}`)) continue;

    // Check phishing patterns
    const isPhishing = config.PHISHING_PATTERNS.some(pattern => pattern.test(urlLower));

    // Unauthorized Discord invites to other servers
    const isUnauthorizedInvite = /discord\.gg\/|discord\.com\/invite\//i.test(urlLower);

    if (isPhishing || isUnauthorizedInvite) {
      try {
        await message.delete();

        const offenses = q.getRecentOffenses.get(message.author.id);
        const count = offenses?.count || 0;

        let timeoutMs, timeoutLabel;
        if (count >= 2) {
          timeoutMs = config.TIMEOUTS.THIRD;
          timeoutLabel = '24 hours';
        } else if (count >= 1) {
          timeoutMs = config.TIMEOUTS.SECOND;
          timeoutLabel = '1 hour';
        } else {
          timeoutMs = config.TIMEOUTS.FIRST;
          timeoutLabel = '5 minutes';
        }

        try {
          await message.member.timeout(timeoutMs, 'Suspicious/phishing link detected');
        } catch (e) {
          console.error('Timeout failed:', e.message);
        }

        const warning = isPhishing
          ? `Removed a suspicious link from <@${message.author.id}>. Timed out for ${timeoutLabel}.`
          : `Removed an unauthorized server invite from <@${message.author.id}>. Timed out for ${timeoutLabel}.`;

        await message.channel.send(
          warning + (count >= 2 ? ` <@&${config.ROLES.ADMIN}> heads up, repeat offense.` : '')
        );

        logModAction(message.guild, message.author.id,
          isPhishing ? 'phishing_delete' : 'auto_delete',
          `${isPhishing ? 'Phishing link' : 'Unauthorized invite'} in #${message.channel.name}. Timeout: ${timeoutLabel}.`,
          message.channel.id
        );

        return true;
      } catch (err) {
        console.error('Phishing deletion failed:', err.message);
      }
    }
  }

  return false;
}

// ── Self-Promo Check ─────────────────────────────────────────

async function handleSelfPromoCheck(message, lower) {
  const promoPatterns = /\b(buy now|check out my|subscribe to my|follow my|join my server|dm me for deals)\b/i;
  if (!promoPatterns.test(lower)) return;
  if (isOnCooldown(`promo-${message.author.id}`, 300)) return;

  const name = message.member?.displayName || message.author.displayName;
  await message.reply(
    `Hey ${name}, just so you know, self-promotion needs staff approval first. Nothing personal, just how we keep things fair for everyone.`
  );

  logModAction(message.guild, message.author.id, 'warning',
    `Self-promotion detected in #${message.channel.name}`, message.channel.id);
}

// ═══════════════════════════════════════════════════════════════
// REACTION ADD -- X Engagement Claims
// ═══════════════════════════════════════════════════════════════

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) { try { await reaction.fetch(); } catch { return; } }
  if (reaction.message.partial) { try { await reaction.message.fetch(); } catch { return; } }

  const message = reaction.message;

  if (message.channel.id !== config.CHANNELS.X_TASKS) return;
  if (message.author.id !== client.user.id) return;

  const emoji = reaction.emoji.name;
  const member = q.getMember.get(user.id);

  if (!member || !member.x_verified) {
    try {
      await user.send(
        `You need to link your X account first. Use /linkx in the server with your handle, ` +
        `and make sure you're following @QANAT_IO.`
      );
    } catch {}
    return;
  }

  let actionType, points;
  if (emoji === '❤️') { actionType = 'like'; points = config.POINTS.LIKE; }
  else if (emoji === '🔁') { actionType = 'retweet'; points = config.POINTS.RETWEET; }
  else if (emoji === '💬') { actionType = 'comment'; points = config.POINTS.COMMENT; }
  else return;

  const db = require('./db').db;
  const tweet = db.prepare('SELECT tweet_id FROM x_tweets WHERE message_id = ?').get(message.id);
  if (!tweet) return;

  const success = recordEngagement(user.id, tweet.tweet_id, actionType, points);

  if (success) {
    const newTotal = q.getPoints.get(user.id);
    try {
      await user.send(
        `+${points} for the ${actionType}. You're at ${newTotal?.total_points || points} points total.`
      );
    } catch {}
  }
});

// ═══════════════════════════════════════════════════════════════
// INVITE TRACKING
// ═══════════════════════════════════════════════════════════════

client.on('inviteCreate', (invite) => inviteCache.set(invite.code, invite.uses));
client.on('inviteDelete', (invite) => inviteCache.delete(invite.code));

// ═══════════════════════════════════════════════════════════════
// VOICE STATE
// ═══════════════════════════════════════════════════════════════

client.on('voiceStateUpdate', async (oldState, newState) => {
  if (newState.member?.id === client.user?.id) return;
});

// ═══════════════════════════════════════════════════════════════
// INTERACTION CREATE -- Slash Commands
// ═══════════════════════════════════════════════════════════════

client.on('interactionCreate', async (interaction) => {
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
      case 'help':                await cmdHelp(interaction); break;
      case 'xcheck':              await cmdXCheck(interaction); break;
      case 'myprofile':           await cmdMyProfile(interaction); break;
      case 'modstats':            await cmdModStats(interaction); break;
      case 'announce':            await cmdAnnounce(interaction); break;
      default:
        await interaction.reply({ content: 'Unknown command.', ephemeral: true });
    }
  } catch (err) {
    console.error(`Command error (${interaction.commandName}):`, err);
    const reply = { content: 'Something went wrong. Try again in a moment.', ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply);
    else await interaction.reply(reply);
  }
});

// ═══════════════════════════════════════════════════════════════
// COMMAND IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

async function cmdPoints(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  q.upsertMember.run(targetUser.id, targetUser.username);
  const member = q.getMember.get(targetUser.id);

  const embed = new EmbedBuilder()
    .setColor(config.BOT_COLOR)
    .setTitle('Engagement Points')
    .addFields(
      { name: 'Member', value: `<@${targetUser.id}>`, inline: true },
      { name: 'Total Points', value: `**${member?.total_points || 0}**`, inline: true },
      { name: 'X Account', value: member?.x_verified ? `@${member.x_handle}` : 'Not linked', inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}

async function cmdLeaderboard(interaction) {
  const limit = interaction.options.getInteger('limit') || 10;
  const rows = q.getLeaderboard.all(limit);

  if (rows.length === 0) {
    return interaction.reply({ content: 'No points on the board yet. Be the first.', ephemeral: true });
  }

  const lines = rows.map((r, i) => {
    const rank = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
    return `**${rank}** <@${r.discord_id}> ${r.total_points} pts`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('Engagement Leaderboard')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Top ${rows.length}` });

  await interaction.reply({ embeds: [embed] });
}

async function cmdInvites(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  q.upsertMember.run(targetUser.id, targetUser.username);
  const member = q.getMember.get(targetUser.id);

  await interaction.reply(
    `<@${targetUser.id}> has **${member?.invite_count || 0}** invite${(member?.invite_count || 0) !== 1 ? 's' : ''}.`
  );
}

async function cmdInvitesLeaderboard(interaction) {
  const limit = interaction.options.getInteger('limit') || 10;
  const rows = q.getInviteLeaderboard.all(limit);

  if (rows.length === 0) {
    return interaction.reply({ content: 'No invites tracked yet.', ephemeral: true });
  }

  const lines = rows.map((r, i) => {
    const rank = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
    return `**${rank}** <@${r.discord_id}> ${r.invite_count} invites`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Invite Leaderboard')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Top ${rows.length}` });

  await interaction.reply({ embeds: [embed] });
}

async function cmdLinkX(interaction) {
  let handle = interaction.options.getString('handle').trim();
  if (handle.startsWith('@')) handle = handle.substring(1);

  q.upsertMember.run(interaction.user.id, interaction.user.username);
  q.linkX.run(handle, interaction.user.id);

  await interaction.reply({
    content:
      `Linked **@${handle}** to your account. Make sure you follow @QANAT_IO on X. ` +
      `When new posts drop, engage on X then react on the notification here to claim your points. ` +
      `Like is 1 point, comment is 2, retweet is 3.`,
    ephemeral: true,
  });
}

async function cmdFAQ(interaction) {
  const question = interaction.options.getString('question');

  if (!question) {
    const faqs = getAllFAQ();
    const embed = new EmbedBuilder()
      .setColor(config.BOT_COLOR)
      .setTitle('QANAT FAQ')
      .setDescription(faqs.map(f => `**${f.index}.** ${f.question}`).join('\n'))
      .setFooter({ text: 'Use /faq followed by your question for a specific answer' });

    return interaction.reply({ embeds: [embed] });
  }

  const faqMatch = matchFAQ(question);

  if (faqMatch) {
    await interaction.reply(faqMatch.answer);
  } else {
    await interaction.reply(
      `I don't have a specific answer for that one. Feel free to ask here though and someone from the team will get back to you.`
    );
  }
}

async function cmdJoinVC(interaction) {
  const memberVoice = interaction.member?.voice;

  if (!memberVoice?.channel) {
    return interaction.reply({
      content: 'Join a voice channel first so I know where to go.',
      ephemeral: true,
    });
  }

  try {
    const connection = joinVoiceChannel({
      channelId: memberVoice.channel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

    // Subscribe to audio streams so the bot actually listens
    connection.receiver.speaking.on('start', (userId) => {
      const audioStream = connection.receiver.subscribe(userId, {
        end: { behavior: 1, duration: 1000 },
      });
      audioStream.on('data', () => {});
      audioStream.on('end', () => {});
    });

    await interaction.reply(
      `Joined **${memberVoice.channel.name}**. I'm listening. ` +
      `If you want to ask me something, mention me in the text channel. /leavevc when you want me out.`
    );

    logModAction(interaction.guild, interaction.user.id, 'vc_join',
      `Bot joined VC: ${memberVoice.channel.name}`);

  } catch (err) {
    console.error('VC join error:', err);
    await interaction.reply({
      content: 'Could not join the channel. Check my permissions.',
      ephemeral: true,
    });
  }
}

async function cmdLeaveVC(interaction) {
  const connection = getVoiceConnection(interaction.guildId);

  if (!connection) {
    return interaction.reply({ content: 'I\'m not in a voice channel right now.', ephemeral: true });
  }

  connection.destroy();
  await interaction.reply('Left the channel. Later.');
}

async function cmdHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(config.BOT_COLOR)
    .setTitle('QANAT Bot')
    .addFields(
      {
        name: 'Engagement',
        value: '`/points` check your points\n`/leaderboard` top holders\n`/linkx` connect X account\n`/xcheck` engagement breakdown',
        inline: false,
      },
      {
        name: 'Invites',
        value: '`/invites` your count\n`/invitesleaderboard` top inviters',
        inline: false,
      },
      {
        name: 'Info',
        value: '`/faq` browse or search FAQs\n`/myprofile` your profile\n`/help` this',
        inline: false,
      },
      {
        name: 'Voice',
        value: '`/joinvc` join your VC\n`/leavevc` leave',
        inline: false,
      },
      {
        name: 'Staff',
        value: '`/announce` send an announcement\n`/modstats` mod log',
        inline: false,
      },
      {
        name: 'How Points Work',
        value:
          'Link your X with /linkx, follow @QANAT_IO. ' +
          'When posts drop, engage on X then react here. ' +
          'Like = 1pt, Comment = 2pt, Retweet = 3pt.',
        inline: false,
      },
    );

  await interaction.reply({ embeds: [embed] });
}

async function cmdXCheck(interaction) {
  const targetUser = interaction.options.getUser('user') || interaction.user;
  const member = q.getMember.get(targetUser.id);

  if (!member || !member.x_verified) {
    return interaction.reply({
      content: `${targetUser.id === interaction.user.id ? 'You haven\'t' : 'They haven\'t'} linked an X account yet. Use /linkx to start.`,
      ephemeral: true,
    });
  }

  const db = require('./db').db;
  const breakdown = db.prepare(`
    SELECT action_type, COUNT(*) as count, SUM(points) as total
    FROM x_engagements WHERE discord_id = ? GROUP BY action_type
  `).all(targetUser.id);

  const likes = breakdown.find(b => b.action_type === 'like') || { count: 0, total: 0 };
  const retweets = breakdown.find(b => b.action_type === 'retweet') || { count: 0, total: 0 };
  const comments = breakdown.find(b => b.action_type === 'comment') || { count: 0, total: 0 };

  const embed = new EmbedBuilder()
    .setColor(0x1DA1F2)
    .setTitle(`X Engagement for @${member.x_handle}`)
    .addFields(
      { name: 'Likes', value: `${likes.count} (${likes.total} pts)`, inline: true },
      { name: 'Comments', value: `${comments.count} (${comments.total} pts)`, inline: true },
      { name: 'Retweets', value: `${retweets.count} (${retweets.total} pts)`, inline: true },
      { name: 'Total', value: `**${member.total_points}** pts`, inline: false },
    );

  await interaction.reply({ embeds: [embed] });
}

async function cmdMyProfile(interaction) {
  q.upsertMember.run(interaction.user.id, interaction.user.username);
  const data = q.getMember.get(interaction.user.id);
  const streak = q.getStreak.get(interaction.user.id, 'gm');

  const embed = new EmbedBuilder()
    .setColor(config.BOT_COLOR)
    .setTitle(`${interaction.user.displayName}`)
    .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Points', value: `${data?.total_points || 0}`, inline: true },
      { name: 'Invites', value: `${data?.invite_count || 0}`, inline: true },
      { name: 'GM Streak', value: `${streak?.streak_count || 0} days`, inline: true },
      { name: 'X Account', value: data?.x_verified ? `@${data.x_handle}` : 'Not linked', inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}

async function cmdModStats(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Staff only.', ephemeral: true });
  }

  const limit = interaction.options.getInteger('limit') || 10;
  const actions = q.getModActions.all(limit);

  if (actions.length === 0) {
    return interaction.reply({ content: 'No actions recorded yet.', ephemeral: true });
  }

  const lines = actions.map(a => {
    const time = `<t:${Math.floor(new Date(a.created_at).getTime() / 1000)}:R>`;
    const user = a.discord_id ? `<@${a.discord_id}>` : 'System';
    return `${time} **${a.action_type}** ${user}\n${a.reason}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Moderation Log')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `Last ${actions.length}` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function cmdAnnounce(interaction) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ content: 'Staff only.', ephemeral: true });
  }

  const title = interaction.options.getString('title');
  const body = interaction.options.getString('body');
  const targetChannel = interaction.options.getChannel('channel')
    || interaction.guild.channels.cache.get(config.CHANNELS.ANNOUNCEMENTS)
    || interaction.channel;
  const color = interaction.options.getString('color') || '#00A8E8';
  const pingEveryone = interaction.options.getBoolean('ping_everyone') || false;
  const imageUrl = interaction.options.getString('image');
  const footerText = interaction.options.getString('footer');

  const embed = new EmbedBuilder()
    .setColor(parseInt(color.replace('#', ''), 16))
    .setTitle(title)
    .setDescription(body)
    .setTimestamp();

  if (imageUrl) embed.setImage(imageUrl);
  embed.setFooter({ text: footerText || interaction.user.displayName });

  try {
    await targetChannel.send({
      content: pingEveryone ? '@everyone' : undefined,
      embeds: [embed],
      allowedMentions: pingEveryone ? { parse: ['everyone'] } : {},
    });

    if (targetChannel.id === config.CHANNELS.ANNOUNCEMENTS) {
      const general = interaction.guild.channels.cache.get(config.CHANNELS.GENERAL);
      if (general) {
        await general.send(`New announcement just went up, check it out.`);
      }
    }

    await interaction.reply({ content: `Sent to <#${targetChannel.id}>.`, ephemeral: true });

    logModAction(interaction.guild, interaction.user.id, 'announcement',
      `"${title}" posted to #${targetChannel.name}`);
  } catch (err) {
    console.error('Announce error:', err);
    await interaction.reply({ content: 'Could not send to that channel. Check my permissions.', ephemeral: true });
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Log Mod Action
// ═══════════════════════════════════════════════════════════════

async function logModAction(guild, discordId, actionType, reason, channelId = null) {
  q.logModAction.run(discordId, actionType, reason, channelId);

  try {
    const modChannel = guild.channels.cache.get(config.CHANNELS.MOD_REPORT);
    if (modChannel) {
      const timestamp = `<t:${Math.floor(Date.now() / 1000)}:f>`;
      const user = discordId ? `<@${discordId}>` : 'System';

      await modChannel.send(
        `**${actionType.replace(/_/g, ' ')}** ${user}\n` +
        `${reason}\n` +
        `${timestamp}`
      );
    }
  } catch (err) {
    console.error('Mod log error:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// SCHEDULED TASKS
// ═══════════════════════════════════════════════════════════════

function startScheduledTasks() {

  // ── Daily Staff Reminder (8 AM UTC) ────────────────────
  cron.schedule(config.STAFF_REMINDER_CRON, async () => {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (!guild) return;

    const staffChannel = guild.channels.cache.get(config.CHANNELS.STAFF_CHAT);
    if (!staffChannel) return;

    const today = new Date();
    const day = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][today.getUTCDay()];

    await staffChannel.send({
      content:
        `Morning team. <@&${config.ROLES.ADMIN}> Quick rundown for ${day}:\n\n` +
        `Community: check support tickets, review mod log, engage in general, check new intros\n` +
        `Growth: post on @QANAT_IO, update weekly mission if needed, review community content\n` +
        `Moderation: verify pending members, review any flagged messages\n\n` +
        `Let's have a solid day.`,
      allowedMentions: { roles: [config.ROLES.ADMIN] },
    });

    console.log('[Scheduler] Staff reminder sent');
  });

  // ── Daily Contributor Motivation (9 AM UTC) ────────────
  cron.schedule(config.CONTRIBUTOR_MOTIVATION_CRON, async () => {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (!guild) return;

    const channel = guild.channels.cache.get(config.CHANNELS.CONTRIBUTOR_CHAT);
    if (!channel) return;

    const messages = [
      `Morning <@&${config.ROLES.CONTRIBUTOR}>. What's everyone working on today? Drop it below.`,
      `New day, <@&${config.ROLES.CONTRIBUTOR}>. Even small progress adds up. What's the focus?`,
      `<@&${config.ROLES.CONTRIBUTOR}> check in. The builders are the ones who make this thing real. What are you tackling?`,
      `<@&${config.ROLES.CONTRIBUTOR}>, consistency wins. What are you focused on today?`,
      `Checking in <@&${config.ROLES.CONTRIBUTOR}>. Code, content, community, whatever it is, share what you're doing.`,
      `<@&${config.ROLES.CONTRIBUTOR}> another day, another push forward. What's on the agenda?`,
      `GM <@&${config.ROLES.CONTRIBUTOR}>. The ones who show up every day are the ones who shape what comes next. What are we building?`,
    ];

    const msg = messages[Math.floor(Math.random() * messages.length)];
    await channel.send({
      content: msg,
      allowedMentions: { roles: [config.ROLES.CONTRIBUTOR] },
    });

    console.log('[Scheduler] Contributor motivation sent');
  });

  // ── General Chat Engagement (every 4 hours) ────────────
  cron.schedule(config.GENERAL_ENGAGEMENT_CRON, async () => {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (!guild) return;

    const channel = guild.channels.cache.get(config.CHANNELS.GENERAL);
    if (!channel) return;

    const messages = [
      `Something worth thinking about: how many apps have access to your personal data right now? That's the problem QANAT is solving with Web X. OS. A decentralized OS where you control everything.`,
      `The whitepaper breaks down exactly how QANAT approaches digital sovereignty. It's at qanat.io if you haven't checked it out.`,
      `Quick reminder, if you want to earn engagement points, link your X with /linkx and engage with @QANAT_IO posts when they drop.`,
      `Beta is coming, mainnet after that. If you're here now, you're ahead of most people. Bring your people in.`,
      `Anyone building anything interesting lately? Doesn't have to be QANAT related. Curious what people in this community are up to.`,
      `Digital sovereignty isn't just a concept. QANAT is building the infrastructure to make it real. The whitepaper is worth a read if you haven't gone through it.`,
      `Use /leaderboard to see where you stand. And if you've been engaging on X but haven't claimed your points, react to the posts in the task channel.`,
      `Every time you use an app without knowing what data they collect, you're giving something away for free. QANAT is building a world where that doesn't have to happen.`,
    ];

    const idx = Math.floor(Date.now() / (4 * 3600 * 1000)) % messages.length;
    await channel.send(messages[idx]);

    console.log('[Scheduler] General engagement sent');
  });

  // ── Announcement Watcher ───────────────────────────────
  setTimeout(() => {
    const guild = client.guilds.cache.get(config.GUILD_ID);
    if (!guild) return;
    const annChannel = guild.channels.cache.get(config.CHANNELS.ANNOUNCEMENTS);
    if (!annChannel) return;

    const collector = annChannel.createMessageCollector({ filter: m => !m.author.bot });
    collector.on('collect', async () => {
      const general = guild.channels.cache.get(config.CHANNELS.GENERAL);
      if (general && !isOnCooldown('ann-notify', 300)) {
        await general.send(`New announcement just went up, worth checking out.`);
      }
    });
  }, 5000);

  console.log('[Scheduler] All tasks started');
}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK -- Railway port
// ═══════════════════════════════════════════════════════════════

const http = require('http');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('QANAT Bot is running');
}).listen(PORT, () => {
  console.log(`  Health check on port ${PORT}`);
});

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error('Login failed:', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  client.destroy();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});
