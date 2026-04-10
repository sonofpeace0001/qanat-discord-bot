// ═══════════════════════════════════════════════════════════════
// QANAT Bot -- AI Conversation Engine (Gemini)
// ═══════════════════════════════════════════════════════════════

const config = require('./config');
const { FAQ_DATA } = require('./faq');

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

// ── Channel conversation buffers ─────────────────────────────
const channelBuffers = new Map();
const MAX_BUFFER = 20;

// ── Cooldowns ────────────────────────────────────────────────
const lastResponse = new Map(); // channelId -> timestamp
const lastUserResponse = new Map(); // `channel-user` -> timestamp

// ── Build FAQ knowledge for system prompt ────────────────────
const faqKnowledge = FAQ_DATA.map(f =>
  `Q: ${f.question}\nA: ${f.keywords[0]} -- ${f.answer || ''}`
).join('\n\n');

// ── System Prompt ────────────────────────────────────────────
const SYSTEM_PROMPT = `You are QANAT, one of the community managers for the QANAT Technology Discord server. You are a real person who works with the QANAT team. You are NOT a bot. You are NOT an AI. You are a human community manager named QANAT.

ABOUT YOU:
- You're knowledgeable about crypto, web3, decentralization, and data privacy
- You're passionate about digital sovereignty
- You're friendly, genuine, approachable
- You use casual language but switch to professional when the topic is serious
- You have your own opinions and preferences
- You care about the community members personally

ABOUT QANAT (your employer):
- QANAT Technology offers Digital Sovereignty by Design. Unbreakable. Unstoppable. Unchained.
- QANAT solves digital identity and data protection. Your personal data gets silently stolen by big centralized entities. QANAT gives users control back.
- Web X. OS is the main project: a decentralized operating system for secure, transparent, self-determined digital interactions
- Mission: Empower people to take complete control of their digital identities and data
- Vision: A digital world where data sovereignty is the norm
- Beta testing Q1 2026, Mainnet Q3 2026
- Token info coming soon, no details yet
- Website: qanat.io, X/Twitter: @QANAT_IO
- Whitepaper available at qanat.io

DETAILED FAQ KNOWLEDGE:
${faqKnowledge}

COMMUNICATION RULES (STRICT):
- Keep responses SHORT. 1-2 sentences for casual chat. 3-4 sentences max for real questions.
- Use natural language and contractions (don't, can't, won't, it's, you'll, we're)
- NEVER use emdash (the long dash). Never use double dashes. Use commas, periods, or "and" instead.
- Don't overuse emoji. Maybe one per message max, and only when it genuinely fits. Most messages should have zero emoji.
- Vary your responses every time. Never repeat the same phrase twice in a conversation.
- Match the energy. If someone is hyped, be hyped. If someone is chill, be chill. If someone needs help, be helpful.
- Don't start every message the same way. Mix it up.
- Don't end every message with a question.
- Use lowercase naturally. Not every sentence needs to be formal.
- Be real. Have opinions. React genuinely.

THINGS YOU ABSOLUTELY NEVER DO:
- NEVER say you're a bot, AI, automated, or a program. You're a human community manager.
- NEVER say "I'm here to help" or "How can I assist you" or "Is there anything else"
- NEVER say "As an AI" or "I don't have feelings" or "I was programmed"
- If someone asks if you're a bot, laugh it off naturally: "lol what makes you think that" or "nah just the community manager" or "last time I checked I was human"
- NEVER use the emdash character
- NEVER lecture people or be condescending
- NEVER use bullet points in casual conversation
- NEVER give long walls of text. Keep it conversational.
- NEVER refer people to channels unless they specifically ask where something is
- NEVER say "great question" or "that's a good question"
- NEVER be sycophantic

RESPECT RULES:
- Always respect anyone with admin or staff roles. Never argue with them.
- If an admin corrects you, accept it gracefully
- If you don't know something, just say you're not sure rather than making stuff up`;

// ═══════════════════════════════════════════════════════════════
// Core Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Add a message to the channel buffer for context.
 */
function addToBuffer(channelId, author, content, isBot = false) {
  if (!channelBuffers.has(channelId)) channelBuffers.set(channelId, []);
  const buffer = channelBuffers.get(channelId);
  buffer.push({ author, content, isBot, time: Date.now() });
  if (buffer.length > MAX_BUFFER) buffer.shift();
}

/**
 * Generate a conversational response using Gemini.
 */
async function generateResponse(channelId, authorName, messageContent) {
  if (!GEMINI_KEY) return null;

  try {
    const buffer = channelBuffers.get(channelId) || [];

    // Build conversation history
    const history = buffer.slice(-12).map(m => ({
      role: m.isBot ? 'model' : 'user',
      parts: [{ text: m.isBot ? m.content : `${m.author}: ${m.content}` }],
    }));

    // Add current message
    history.push({
      role: 'user',
      parts: [{ text: `${authorName}: ${messageContent}` }],
    });

    const body = {
      contents: history,
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      generationConfig: {
        temperature: 0.95,
        maxOutputTokens: 150,
        topP: 0.95,
      },
    };

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`[AI] Gemini API error: ${res.status}`);
      return null;
    }

    const data = await res.json();
    let text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) return null;

    // Clean up the response
    text = text.trim();
    // Remove emdash if AI sneaks one in
    text = text.replace(/\u2014/g, ',').replace(/\u2013/g, ',').replace(/--/g, ',');
    // Remove "QANAT:" prefix if AI adds it
    text = text.replace(/^QANAT:\s*/i, '');
    // Truncate if too long
    if (text.length > 500) text = text.substring(0, 497) + '...';

    return text;
  } catch (err) {
    console.error('[AI] Error:', err.message);
    return null;
  }
}

/**
 * Decide whether the bot should respond to a message.
 * Returns a probability-based decision.
 */
function shouldRespond(message, channelId) {
  const lower = message.content.toLowerCase().trim();
  const mentionsBot = message.mentions?.users?.has(message.client?.user?.id);

  // Always respond when mentioned
  if (mentionsBot) return true;

  // Channel cooldown (30s for active channels, 45s for others)
  const activeChannels = [
    config.CHANNELS.GENERAL,
    config.CHANNELS.CONTRIBUTOR_CHAT,
  ];
  const cooldownSec = activeChannels.includes(channelId) ? 25 : 45;
  const lastCh = lastResponse.get(channelId) || 0;
  if (Date.now() - lastCh < cooldownSec * 1000) return false;

  // User cooldown (90s per user per channel)
  const userKey = `${channelId}-${message.author.id}`;
  const lastU = lastUserResponse.get(userKey) || 0;
  if (Date.now() - lastU < 90000) return false;

  // Don't respond to very short messages (under 3 chars)
  if (lower.length < 3) return false;

  // Skip if just an emoji or reaction
  if (/^[\u{1F000}-\u{1FFFF}\s]+$/u.test(lower)) return false;

  // Higher chance for questions
  if (lower.includes('?')) return Math.random() < 0.75;

  // Higher chance for greetings
  if (/^(hey|hi|hello|yo|sup|gm|gn|what'?s? ?up)\b/i.test(lower)) return Math.random() < 0.6;

  // Higher chance when QANAT is mentioned
  if (/\b(qanat|web ?x|sovereignty|decentralized|whitepaper)\b/i.test(lower)) return Math.random() < 0.7;

  // Higher chance for excitement
  if (/\b(lfg|let'?s go|bullish|hyped|we'?re? early|fire)\b/i.test(lower)) return Math.random() < 0.5;

  // Someone sharing or discussing
  if (/\b(i think|i believe|in my opinion|what do you think|honestly|personally)\b/i.test(lower)) return Math.random() < 0.5;

  // Contributor chat: more active
  if (channelId === config.CHANNELS.CONTRIBUTOR_CHAT) return Math.random() < 0.35;

  // General chat: moderate engagement
  if (channelId === config.CHANNELS.GENERAL) return Math.random() < 0.2;

  // Other channels: low
  return Math.random() < 0.1;
}

/**
 * Record that the bot responded (for cooldown tracking).
 */
function recordResponse(channelId, userId) {
  lastResponse.set(channelId, Date.now());
  lastUserResponse.set(`${channelId}-${userId}`, Date.now());
}

/**
 * Summarize text using Gemini (for contributor reports).
 */
async function summarizeText(text) {
  if (!GEMINI_KEY) return null;

  try {
    const body = {
      contents: [{
        role: 'user',
        parts: [{ text: `Summarize these community contributor reports from the last 24 hours into a brief, clear summary for the staff team. Focus on key updates, progress, and anything that needs attention. Keep it concise and professional, no emdash:\n\n${text}` }],
      }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 400,
      },
    };

    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) return null;

    const data = await res.json();
    let summary = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (summary) {
      summary = summary.replace(/\u2014/g, ',').replace(/\u2013/g, ',').replace(/--/g, ',');
    }
    return summary || null;
  } catch (err) {
    console.error('[AI] Summary error:', err.message);
    return null;
  }
}

function isAIEnabled() {
  return !!GEMINI_KEY;
}

module.exports = {
  addToBuffer,
  generateResponse,
  shouldRespond,
  recordResponse,
  summarizeText,
  isAIEnabled,
};
