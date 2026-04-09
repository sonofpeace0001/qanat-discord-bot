// ═══════════════════════════════════════════════════════════════
//
//  QANAT — Community Manager & Moderator Bot
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
// MEMBER JOIN — Welcome & Invite Tracking
// ═══════════════════════════════════════════════════════════════

client.on('guildMemberAdd', async (member) => {
  if (member.user.bot) return;

  q.upsertMember.run(member.id, member.user.username);

  // Welcome — plain text, human tone
  const welcomeChannel = member.guild.channels.cache.get(config.CHANNELS.WELCOME);
  if (welcomeChannel) {
    await welcomeChannel.send(
      `Hey <@${member.id}>, welcome to QANAT. Glad you found us.\n\n` +
      `We're a community building toward real digital sovereignty — a future where you actually own your data, not big tech. ` +
      `Our main project is Web X. OS, a decentralized operating system that puts you in control.\n\n` +
      `Here's what to do first:\n` +
      `- Introduce yourself in <#${config.CHANNELS.INTRODUCTION}> — tell us who you are and what brought you here\n` +
      `- Read through <#${config.CHANNELS.RULES}> so you know how things work\n` +
      `- Get verified in <#${config.CHANNELS.VERIFY}> to unlock full access\n` +
      `- Check <#${config.CHANNELS.ROLES}> for roles you might want\n\n` +
      `If you need anything, just ask in <#${config.CHANNELS.SUPPORT}> or tag a staff member. We're friendly around here.`
    );
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
          `**${member.user.displayName}** has been invited by <@${inviterId}> — ` +
          `that's **${count}** invite${count !== 1 ? 's' : ''} now.`
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

  // ── GM/GN Channel ──────────────────────────────────────
  if (channelId === config.CHANNELS.GM_GN) {
    await handleGMGN(message, lower);
    return;
  }

  // ── Moderation — phishing detection (runs everywhere) ──
  const wasPhishing = await handlePhishingCheck(message, lower);
  if (wasPhishing) return;

  // ── General Chat ───────────────────────────────────────
  if (channelId === config.CHANNELS.GENERAL) {
    await handleGeneralChat(message, lower);
  }

  // ── FAQ auto-detect (FAQ, General, Introduction only) ──
  const faqChannels = [config.CHANNELS.FAQ, config.CHANNELS.GENERAL, config.CHANNELS.INTRODUCTION];
  if (faqChannels.includes(channelId)) {
    if (lower.includes('?') || /^(what|how|where|when|why|can i|is qanat|does qanat|will there)\b/.test(lower)) {
      await handleFAQDetection(message, lower);
    }
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

  // ── Self-promo detection (soft warning, no deletion) ───
  await handleSelfPromoCheck(message, lower);
});

// ── GM/GN Handler ────────────────────────────────────────────

async function handleGMGN(message, lower) {
  const isGM = /\bgm\b|good\s*morning/i.test(lower);
  const isGN = /\bgn\b|good\s*night/i.test(lower);

  if (isGM) {
    await message.react('☀️');
    q.upsertStreak.run(message.author.id, 'gm');
    const streak = q.getStreak.get(message.author.id, 'gm');
    if (streak && streak.streak_count > 0 && streak.streak_count % 7 === 0) {
      await message.reply(`${streak.streak_count}-day GM streak. Respect.`);
    }
  } else if (isGN) {
    await message.react('🌙');
    q.upsertStreak.run(message.author.id, 'gn');
  } else {
    await message.reply(
      `This channel is just for GM and GN — head over to <#${config.CHANNELS.GENERAL}> for everything else.`
    );
  }
}

// ── General Chat Handler ─────────────────────────────────────

async function handleGeneralChat(message, lower) {
  if (!message.mentions.has(client.user)) return;

  const faqMatch = matchFAQ(message.content);
  if (faqMatch && faqMatch.score >= 3) {
    await message.reply(
      `**${faqMatch.question}**\n\n${faqMatch.answer}`
    );
    return;
  }

  await message.reply(
    `What's up? If you've got a question about QANAT, just ask and I'll do my best. ` +
    `For support issues, head to <#${config.CHANNELS.SUPPORT}>.`
  );
}

// ── FAQ Detection ────────────────────────────────────────────

async function handleFAQDetection(message, lower) {
  if (isOnCooldown(`faq-${message.author.id}`, 60)) return;

  const faqMatch = matchFAQ(message.content);
  if (faqMatch && faqMatch.score >= 4) {
    await message.reply(
      `**${faqMatch.question}**\n\n${faqMatch.answer}`
    );
  }
}

// ── Phishing Detection ──────────────────────────────────────

async function handlePhishingCheck(message, lower) {
  // Don't check staff messages
  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return false;

  // Check if message has URLs
  const urlRegex = /https?:\/\/[^\s<]+/gi;
  const urls = message.content.match(urlRegex);
  if (!urls || urls.length === 0) return false;

  // Check each URL
  for (const url of urls) {
    const urlLower = url.toLowerCase();

    // Skip safe domains
    const isSafe = config.SAFE_DOMAINS.some(domain => {
      try {
        const hostname = new URL(urlLower).hostname;
        return hostname === domain || hostname.endsWith('.' + domain);
      } catch {
        return urlLower.includes(domain);
      }
    });
    if (isSafe) continue;

    // Skip official QANAT Discord invite
    if (urlLower.includes(`discord.gg/${config.OFFICIAL_INVITE}`)) continue;

    // Check phishing patterns
    const isPhishing = config.PHISHING_PATTERNS.some(pattern => pattern.test(urlLower));

    // Check unauthorized Discord invites (other servers)
    const isUnauthorizedInvite = /discord\.gg\/(?!sfsgExKuUw)/i.test(urlLower) ||
      /discord\.com\/invite\/(?!sfsgExKuUw)/i.test(urlLower);

    if (isPhishing || isUnauthorizedInvite) {
      try {
        await message.delete();

        const offenses = q.getRecentOffenses.get(message.author.id);
        const count = offenses?.count || 0;

        // Determine timeout duration
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

        // Apply timeout
        try {
          await message.member.timeout(timeoutMs, 'Phishing/spam link detected');
        } catch (e) {
          console.error('Timeout failed:', e.message);
        }

        await message.channel.send(
          `I removed a suspicious link from <@${message.author.id}> and timed them out for ${timeoutLabel}. ` +
          `If that was a mistake, a staff member can review it.` +
          (count >= 2 ? ` <@&${config.ROLES.ADMIN}> — this is their ${count + 1}rd offense.` : '')
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

// ── Self-Promo Check (warning only, no deletion) ─────────────

async function handleSelfPromoCheck(message, lower) {
  if (message.member?.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const promoPatterns = /\b(buy now|check out my|subscribe to my|follow my|join my server|dm me for deals)\b/i;
  if (!promoPatterns.test(lower)) return;

  if (isOnCooldown(`promo-${message.author.id}`, 300)) return;

  await message.reply(
    `Just a heads up — self-promotion needs staff permission first. ` +
    `Check <#${config.CHANNELS.RULES}> for the details on that.`
  );

  logModAction(message.guild, message.author.id, 'warning',
    `Self-promotion detected in #${message.channel.name}`, message.channel.id);
}

// ═══════════════════════════════════════════════════════════════
// REACTION ADD — X Engagement Claims
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
        `You need to link your X account first — use /linkx in the server with your handle. ` +
        `Make sure you're following @QANAT_IO too.`
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
        `+${points} point${points > 1 ? 's' : ''} for the ${actionType}. Total: ${newTotal?.total_points || points} points.`
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
// VOICE STATE — track joins
// ═══════════════════════════════════════════════════════════════

client.on('voiceStateUpdate', async (oldState, newState) => {
  if (newState.member?.id === client.user?.id) return;
});

// ═══════════════════════════════════════════════════════════════
// INTERACTION CREATE — Slash Commands
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
      { name: 'X Account', value: member?.x_verified ? `@${member.x_handle}` : 'Not linked — use /linkx', inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}

async function cmdLeaderboard(interaction) {
  const limit = interaction.options.getInteger('limit') || 10;
  const rows = q.getLeaderboard.all(limit);

  if (rows.length === 0) {
    return interaction.reply({ content: 'No points on the board yet. Be the first — engage with @QANAT_IO posts in the task channel.', ephemeral: true });
  }

  const lines = rows.map((r, i) => {
    const rank = i === 0 ? '1st' : i === 1 ? '2nd' : i === 2 ? '3rd' : `${i + 1}th`;
    return `**${rank}** — <@${r.discord_id}> — ${r.total_points} pts`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xFFD700)
    .setTitle('Engagement Leaderboard')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Top ${rows.length} members` });

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
    return `**${rank}** — <@${r.discord_id}> — ${r.invite_count} invites`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('Invite Leaderboard')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Top ${rows.length} inviters` });

  await interaction.reply({ embeds: [embed] });
}

async function cmdLinkX(interaction) {
  let handle = interaction.options.getString('handle').trim();
  if (handle.startsWith('@')) handle = handle.substring(1);

  q.upsertMember.run(interaction.user.id, interaction.user.username);
  q.linkX.run(handle, interaction.user.id);

  await interaction.reply({
    content:
      `Your X account **@${handle}** is now linked.\n\n` +
      `Make sure you follow [@QANAT_IO](https://x.com/QANAT_IO) on X, then react to tweet notifications ` +
      `in <#${config.CHANNELS.X_TASKS}> after you engage. Points: like = 1, comment = 2, retweet = 3.`,
    ephemeral: true,
  });
}

async function cmdFAQ(interaction) {
  const question = interaction.options.getString('question');

  if (!question) {
    const faqs = getAllFAQ();
    const embed = new EmbedBuilder()
      .setColor(config.BOT_COLOR)
      .setTitle('QANAT — Frequently Asked Questions')
      .setDescription(faqs.map(f => `**${f.index}.** ${f.question}`).join('\n'))
      .setFooter({ text: 'Use /faq followed by your question for a specific answer' });

    return interaction.reply({ embeds: [embed] });
  }

  const faqMatch = matchFAQ(question);

  if (faqMatch) {
    await interaction.reply(`**${faqMatch.question}**\n\n${faqMatch.answer}`);
  } else {
    await interaction.reply({
      content: `I don't have a specific answer for that one. Try asking in <#${config.CHANNELS.SUPPORT}> — ` +
        `the team can help you out directly.`,
    });
  }
}

async function cmdJoinVC(interaction) {
  const memberVoice = interaction.member?.voice;

  if (!memberVoice?.channel) {
    return interaction.reply({
      content: 'You need to be in a voice channel first so I know where to join.',
      ephemeral: true,
    });
  }

  try {
    const connection = joinVoiceChannel({
      channelId: memberVoice.channel.id,
      guildId: interaction.guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,  // Not deafened — listening
      selfMute: true,   // Muted — not speaking
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

    // Subscribe to audio from all members so the bot "listens"
    connection.receiver.speaking.on('start', (userId) => {
      // Audio reception is active — framework for future transcription
      const audioStream = connection.receiver.subscribe(userId, {
        end: { behavior: 1, duration: 1000 }, // EndBehaviorType.AfterSilence
      });
      // For now, just consume the stream so the bot stays connected
      audioStream.on('data', () => {});
      audioStream.on('end', () => {});
    });

    await interaction.reply(
      `Joined **${memberVoice.channel.name}**. I'm listening — if you want to ask me something, ` +
      `just type in the text channel and mention me. Use /leavevc when you want me to go.`
    );

    logModAction(interaction.guild, interaction.user.id, 'vc_join',
      `Bot joined VC: ${memberVoice.channel.name}`);

  } catch (err) {
    console.error('VC join error:', err);
    await interaction.reply({
      content: 'Couldn\'t join the channel. Make sure I have permission to connect.',
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
  await interaction.reply('Left the voice channel. Catch you later.');
}

async function cmdHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(config.BOT_COLOR)
    .setTitle('QANAT Bot — Commands')
    .addFields(
      {
        name: 'Engagement',
        value: '`/points` — check your points\n`/leaderboard` — top point holders\n`/linkx` — connect your X account\n`/xcheck` — X engagement breakdown',
        inline: false,
      },
      {
        name: 'Invites',
        value: '`/invites` — your invite count\n`/invitesleaderboard` — top inviters',
        inline: false,
      },
      {
        name: 'Info',
        value: '`/faq` — browse FAQs\n`/myprofile` — your full profile\n`/help` — this message',
        inline: false,
      },
      {
        name: 'Voice',
        value: '`/joinvc` — I\'ll join your VC\n`/leavevc` — I\'ll leave',
        inline: false,
      },
      {
        name: 'Staff',
        value: '`/announce` — send an embed announcement\n`/modstats` — recent mod actions',
        inline: false,
      },
      {
        name: 'How Points Work',
        value:
          '1. Link your X with `/linkx`\n' +
          '2. Follow @QANAT_IO on X\n' +
          `3. Watch for new posts in <#${config.CHANNELS.X_TASKS}>\n` +
          '4. Engage on X, then react on the notification\n' +
          '   Like = 1pt, Comment = 2pt, Retweet = 3pt',
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
      content: `${targetUser.id === interaction.user.id ? 'You haven\'t' : 'They haven\'t'} linked an X account yet. Use /linkx to get started.`,
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
    .setTitle(`X Engagement — @${member.x_handle}`)
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
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: 'Staff only.', ephemeral: true });
  }

  const limit = interaction.options.getInteger('limit') || 10;
  const actions = q.getModActions.all(limit);

  if (actions.length === 0) {
    return interaction.reply({ content: 'No moderation actions recorded yet.', ephemeral: true });
  }

  const lines = actions.map(a => {
    const time = `<t:${Math.floor(new Date(a.created_at).getTime() / 1000)}:R>`;
    const user = a.discord_id ? `<@${a.discord_id}>` : 'System';
    return `${time} | **${a.action_type}** | ${user} — ${a.reason}`;
  });

  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Moderation Log')
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: `Last ${actions.length} actions` });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function cmdAnnounce(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
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
  embed.setFooter({ text: footerText || `— ${interaction.user.displayName}` });

  try {
    await targetChannel.send({
      content: pingEveryone ? '@everyone' : undefined,
      embeds: [embed],
      allowedMentions: pingEveryone ? { parse: ['everyone'] } : {},
    });

    if (targetChannel.id === config.CHANNELS.ANNOUNCEMENTS) {
      const general = interaction.guild.channels.cache.get(config.CHANNELS.GENERAL);
      if (general) {
        await general.send(`New announcement just dropped — check <#${config.CHANNELS.ANNOUNCEMENTS}>.`);
      }
    }

    await interaction.reply({ content: `Sent to <#${targetChannel.id}>.`, ephemeral: true });

    logModAction(interaction.guild, interaction.user.id, 'announcement',
      `"${title}" posted to #${targetChannel.name}`);
  } catch (err) {
    console.error('Announce error:', err);
    await interaction.reply({ content: 'Couldn\'t send to that channel. Check my permissions there.', ephemeral: true });
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
        `**${actionType.replace(/_/g, ' ')}** — ${user}\n` +
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
        `Morning team. <@&${config.ROLES.ADMIN}> Here's today's rundown (${day}):\n\n` +
        `**Community**\n` +
        `- Check <#${config.CHANNELS.SUPPORT}> for any open tickets\n` +
        `- Review <#${config.CHANNELS.MOD_REPORT}> for overnight actions\n` +
        `- Engage in <#${config.CHANNELS.GENERAL}> — keep things active\n` +
        `- Look through new intros in <#${config.CHANNELS.INTRODUCTION}>\n\n` +
        `**Growth**\n` +
        `- Post on X @QANAT_IO and drop it in <#${config.CHANNELS.X_TASKS}>\n` +
        `- Update <#${config.CHANNELS.WEEKLY_MISSION}> if there's a new mission\n` +
        `- Check <#${config.CHANNELS.CONTENT_CREATION}> for new community content\n\n` +
        `**Moderation**\n` +
        `- Verify any pending members in <#${config.CHANNELS.VERIFY}>\n` +
        `- Review any flagged messages\n\n` +
        `Let's have a good one.`,
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
      `Morning, <@&${config.ROLES.CONTRIBUTOR}>. Quick check-in — what's everyone working on today? Even small progress counts. Let's hear it.`,
      `New day. <@&${config.ROLES.CONTRIBUTOR}>, QANAT doesn't build itself. What are you focused on? Drop it below so we can keep each other accountable.`,
      `<@&${config.ROLES.CONTRIBUTOR}> — just a reminder that the work you're putting in matters. Every contribution moves us closer to real digital sovereignty. What's on your plate today?`,
      `<@&${config.ROLES.CONTRIBUTOR}>, consistency is what separates those who talk about building from those who actually build. What's your focus today?`,
      `Checking in, <@&${config.ROLES.CONTRIBUTOR}>. Whether you're writing code, creating content, or spreading the word — it all adds up. What's today's plan?`,
      `<@&${config.ROLES.CONTRIBUTOR}> — another day, another chance to move the needle. Share what you're tackling and let's keep the energy going.`,
      `GM <@&${config.ROLES.CONTRIBUTOR}>. The people who show up every day are the ones who shape the future. That's you. What are we building today?`,
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
      `Something to think about — how many apps have access to your personal data right now? That's exactly what QANAT is solving with Web X. OS. A decentralized OS where you control everything. Worth looking into if you haven't yet: qanat.io`,
      `The QANAT whitepaper breaks down exactly how we're approaching digital sovereignty. If you haven't read it, it's at qanat.io. Curious what you all think about the approach.`,
      `Quick reminder — if you want to earn engagement points, link your X account with /linkx and start engaging with @QANAT_IO posts when they drop in <#${config.CHANNELS.X_TASKS}>.`,
      `Beta testing is coming up and mainnet follows after that. If you're here now, you're early. Bring your friends in — the community is strongest when it grows organically.`,
      `Anyone working on anything interesting lately? Doesn't have to be QANAT-related. Curious what people in this community are building.`,
      `Just dropped a reminder — check <#${config.CHANNELS.OFFICIAL_LINKS}> for all the official QANAT resources. Whitepaper, socials, everything in one place.`,
      `Digital sovereignty isn't just a concept — it's the direction the internet needs to go. QANAT is building the infrastructure to make it real. If you want to understand the vision deeper, the whitepaper is a solid starting point.`,
      `Use /leaderboard to see where you stand. And if you've been engaging on X but haven't claimed your points, make sure to react to the posts in <#${config.CHANNELS.X_TASKS}>.`,
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
        await general.send(`New announcement just dropped — check <#${config.CHANNELS.ANNOUNCEMENTS}>.`);
      }
    });
  }, 5000);

  console.log('[Scheduler] All tasks started');
}

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
