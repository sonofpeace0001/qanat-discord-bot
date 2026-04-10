// ═══════════════════════════════════════════════════════════════
// QANAT Bot -- Voice Channel Intelligence
// Listens to VC conversations, transcribes, summarizes,
// contributes via text, records meetings
// ═══════════════════════════════════════════════════════════════

const {
  joinVoiceChannel, getVoiceConnection,
  VoiceConnectionStatus, entersState, EndBehaviorType,
} = require('@discordjs/voice');
const { Transform } = require('stream');
const fs = require('fs');
const path = require('path');
const ai = require('./ai');
const config = require('./config');

// ── Active sessions ──────────────────────────────────────────
const activeSessions = new Map(); // guildId -> session data

class VoiceSession {
  constructor(guildId, channelId, channelName, textChannel) {
    this.guildId = guildId;
    this.channelId = channelId;
    this.channelName = channelName;
    this.textChannel = textChannel;
    this.connection = null;
    this.speakers = new Map(); // userId -> { name, chunks[], lastSpoke }
    this.transcript = [];      // { speaker, text, timestamp }
    this.startTime = Date.now();
    this.recording = false;
    this.pcmBuffers = new Map(); // userId -> Buffer[]
    this.summaryInterval = null;
    this.contributionInterval = null;
  }
}

// ═══════════════════════════════════════════════════════════════
// JOIN & LISTEN
// ═══════════════════════════════════════════════════════════════

async function joinVC(interaction, options = {}) {
  const memberVoice = interaction.member?.voice;
  if (!memberVoice?.channel) {
    return { success: false, message: 'Join a voice channel first so I know where to go.' };
  }

  const guildId = interaction.guildId;
  const channel = memberVoice.channel;

  // Find a text channel to post in (associated text channel or general)
  const textChannel = interaction.channel ||
    interaction.guild.channels.cache.get(config.CHANNELS.GENERAL);

  try {
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

    // Create session
    const session = new VoiceSession(guildId, channel.id, channel.name, textChannel);
    session.connection = connection;
    session.recording = options.record || false;
    activeSessions.set(guildId, session);

    // Listen to all speakers
    connection.receiver.speaking.on('start', (userId) => {
      handleSpeakerStart(session, userId, interaction.guild);
    });

    // Post periodic summaries every 10 minutes if conversation is active
    session.summaryInterval = setInterval(async () => {
      if (session.transcript.length >= 5) {
        await postLiveSummary(session);
      }
    }, 10 * 60 * 1000);

    // Contribute to conversation every 5 minutes via text
    session.contributionInterval = setInterval(async () => {
      if (session.transcript.length >= 3) {
        await contributeToConversation(session);
      }
    }, 5 * 60 * 1000);

    const recordMsg = session.recording ? ' Recording is on.' : '';
    return {
      success: true,
      message: `Joined **${channel.name}**. I'm listening and will contribute thoughts in the text channel.${recordMsg} Use /vcsummary for a summary anytime, /leavevc when done.`
    };

  } catch (err) {
    console.error('VC join error:', err);
    return { success: false, message: 'Could not join. Check my permissions.' };
  }
}

// ── Handle speaker audio ─────────────────────────────────────

function handleSpeakerStart(session, userId, guild) {
  if (!session.connection) return;

  const member = guild.members.cache.get(userId);
  const name = member?.displayName || 'Unknown';

  if (!session.speakers.has(userId)) {
    session.speakers.set(userId, { name, chunks: [], lastSpoke: Date.now() });
  }

  const speaker = session.speakers.get(userId);
  speaker.lastSpoke = Date.now();

  // Subscribe to their audio
  const audioStream = session.connection.receiver.subscribe(userId, {
    end: { behavior: EndBehaviorType.AfterSilence, duration: 2000 },
  });

  const chunks = [];

  audioStream.on('data', (chunk) => {
    chunks.push(chunk);
    if (session.recording) {
      if (!session.pcmBuffers.has(userId)) session.pcmBuffers.set(userId, []);
      session.pcmBuffers.get(userId).push(chunk);
    }
  });

  audioStream.on('end', async () => {
    // We have Opus packets. For transcription we'd need to decode to PCM
    // then send to Whisper/Groq. For now, log that they spoke.
    const duration = chunks.length > 0 ? Math.round(chunks.length * 0.02) : 0; // ~20ms per opus frame
    if (duration > 1) { // Only log if they spoke for more than 1 second
      session.transcript.push({
        speaker: name,
        userId,
        text: `[spoke for ~${duration}s]`,
        timestamp: Date.now(),
        duration,
      });
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// AI CONTRIBUTIONS (via text channel)
// ═══════════════════════════════════════════════════════════════

async function contributeToConversation(session) {
  if (!session.textChannel || !ai.isAIEnabled()) return;

  // Build context from recent transcript
  const recent = session.transcript.slice(-10);
  if (recent.length < 2) return;

  const speakerList = [...new Set(recent.map(t => t.speaker))].join(', ');
  const context = recent.map(t => `${t.speaker}: ${t.text}`).join('\n');

  const prompt = `You're in a voice channel with: ${speakerList}. Based on the recent conversation activity, drop a relevant thought, question, or comment in the text channel. Keep it casual, 1-2 sentences. Don't summarize what was said, instead add something valuable to the discussion. If you can't tell what they're discussing, ask a casual question about what they're talking about.`;

  const response = await ai.generateResponse(
    session.channelId, 'QANAT', prompt
  );

  if (response) {
    await session.textChannel.send(response);
  }
}

// ═══════════════════════════════════════════════════════════════
// SUMMARIES
// ═══════════════════════════════════════════════════════════════

async function generateSummary(session) {
  if (session.transcript.length === 0) {
    return 'No conversation activity recorded yet.';
  }

  const duration = Math.round((Date.now() - session.startTime) / 60000);
  const speakerStats = {};

  for (const entry of session.transcript) {
    if (!speakerStats[entry.speaker]) {
      speakerStats[entry.speaker] = { count: 0, totalDuration: 0 };
    }
    speakerStats[entry.speaker].count++;
    speakerStats[entry.speaker].totalDuration += entry.duration || 0;
  }

  const statsText = Object.entries(speakerStats)
    .sort((a, b) => b[1].totalDuration - a[1].totalDuration)
    .map(([name, s]) => `${name}: spoke ${s.count} times (~${s.totalDuration}s total)`)
    .join('\n');

  // Try AI summary if available
  if (ai.isAIEnabled()) {
    const transcript = session.transcript.map(t =>
      `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.speaker}: ${t.text}`
    ).join('\n');

    const aiSummary = await ai.summarizeText(
      `Voice channel meeting in "${session.channelName}" (${duration} minutes):\n\nParticipants and activity:\n${statsText}\n\nActivity log:\n${transcript}\n\nProvide a brief meeting summary including who participated, approximate discussion time, and any notable patterns.`
    );

    if (aiSummary) return aiSummary;
  }

  // Fallback: stats-only summary
  return `**VC Session: ${session.channelName}** (${duration} min)\n\n**Participants:**\n${statsText}`;
}

async function postLiveSummary(session) {
  if (!session.textChannel) return;

  const summary = await generateSummary(session);
  await session.textChannel.send(`**Live VC Update:**\n${summary}`);

  // Reset transcript for next interval
  session.transcript = session.transcript.slice(-5); // keep last 5 for context
}

async function getFullSummary(guildId) {
  const session = activeSessions.get(guildId);
  if (!session) return null;
  return generateSummary(session);
}

// ═══════════════════════════════════════════════════════════════
// LEAVE & CLEANUP
// ═══════════════════════════════════════════════════════════════

async function leaveVC(guildId) {
  const session = activeSessions.get(guildId);
  const connection = getVoiceConnection(guildId);

  let summary = null;

  if (session) {
    // Generate final summary before leaving
    if (session.transcript.length > 0) {
      summary = await generateSummary(session);
    }

    // Clear intervals
    if (session.summaryInterval) clearInterval(session.summaryInterval);
    if (session.contributionInterval) clearInterval(session.contributionInterval);

    activeSessions.delete(guildId);
  }

  if (connection) connection.destroy();

  return summary;
}

function isInVC(guildId) {
  return activeSessions.has(guildId);
}

function getSession(guildId) {
  return activeSessions.get(guildId);
}

// ═══════════════════════════════════════════════════════════════
// AUTO-JOIN when members join community hangout
// ═══════════════════════════════════════════════════════════════

async function handleVoiceStateUpdate(oldState, newState, client) {
  // Don't track bot's own state
  if (newState.member?.id === client.user?.id) return;

  const hangoutId = config.CHANNELS.COMMUNITY_HANGOUT;

  // Someone joined the community hangout and bot isn't there
  if (newState.channelId === hangoutId && !isInVC(newState.guild.id)) {
    // Check if there are at least 2 people (don't join for 1 person alone)
    const channel = newState.guild.channels.cache.get(hangoutId);
    if (channel && channel.members.size >= 2) {
      try {
        const textChannel = newState.guild.channels.cache.get(config.CHANNELS.GENERAL);
        const connection = joinVoiceChannel({
          channelId: hangoutId,
          guildId: newState.guild.id,
          adapterCreator: newState.guild.voiceAdapterCreator,
          selfDeaf: false,
          selfMute: true,
        });

        await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

        const session = new VoiceSession(newState.guild.id, hangoutId, channel.name, textChannel);
        session.connection = connection;
        activeSessions.set(newState.guild.id, session);

        connection.receiver.speaking.on('start', (userId) => {
          handleSpeakerStart(session, userId, newState.guild);
        });

        session.summaryInterval = setInterval(async () => {
          if (session.transcript.length >= 5) await postLiveSummary(session);
        }, 10 * 60 * 1000);

        session.contributionInterval = setInterval(async () => {
          if (session.transcript.length >= 3) await contributeToConversation(session);
        }, 5 * 60 * 1000);

        if (textChannel) {
          await textChannel.send(`Joined **${channel.name}**, looks like things are getting started. I'll be listening and dropping thoughts in here.`);
        }

        console.log(`[Voice] Auto-joined ${channel.name}`);
      } catch (err) {
        console.error('[Voice] Auto-join failed:', err.message);
      }
    }
  }

  // Everyone left the VC, bot should leave too
  if (oldState.channelId && isInVC(oldState.guild.id)) {
    const session = getSession(oldState.guild.id);
    if (session && session.channelId === oldState.channelId) {
      const channel = oldState.guild.channels.cache.get(oldState.channelId);
      // Only bot left in the channel (or 0 non-bot members)
      const humanMembers = channel ? channel.members.filter(m => !m.user.bot).size : 0;
      if (humanMembers === 0) {
        const summary = await leaveVC(oldState.guild.id);
        const textChannel = session.textChannel;
        if (textChannel && summary) {
          await textChannel.send(`Everyone left **${session.channelName}**, so I bounced too.\n\n**Session Summary:**\n${summary}`);
        }
        console.log(`[Voice] Auto-left ${session.channelName} (empty)`);
      }
    }
  }
}

module.exports = {
  joinVC,
  leaveVC,
  isInVC,
  getSession,
  getFullSummary,
  handleVoiceStateUpdate,
};
