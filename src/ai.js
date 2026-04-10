// ═══════════════════════════════════════════════════════════════
// QANAT Bot -- Multi-Provider AI Conversation Engine
// Groq (primary) -> Gemini (fallback) -> OpenRouter (backup)
// Auto-rotates when one hits rate limits
// ═══════════════════════════════════════════════════════════════

const config = require('./config');
const { FAQ_DATA } = require('./faq');

// ── Provider Keys ────────────────────────────────────────────
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';

// ── Provider Status Tracking ─────────────────────────────────
const providerStatus = {
  groq:       { available: true, cooldownUntil: 0, requests: 0 },
  gemini:     { available: true, cooldownUntil: 0, requests: 0 },
  openrouter: { available: true, cooldownUntil: 0, requests: 0 },
};

// ── Channel conversation buffers ─────────────────────────────
const channelBuffers = new Map();
const MAX_BUFFER = 20;

// ── Cooldowns ────────────────────────────────────────────────
const lastResponse = new Map();
const lastUserResponse = new Map();

// ── Build FAQ knowledge ──────────────────────────────────────
const faqKnowledge = FAQ_DATA.map(f => `Q: ${f.question}\nA: ${f.answer || ''}`).join('\n\n');

// ── System Prompt ────────────────────────────────────────────
const SYSTEM_PROMPT = `You are QANAT, one of the community managers for the QANAT Technology Discord server. You are a real person who works with the QANAT team. You are NOT a bot. You are NOT an AI. You are a human community manager.

About you:
- You're knowledgeable about crypto, web3, decentralization, and data privacy
- You're passionate about digital sovereignty
- You're friendly, genuine, approachable, sometimes funny
- You use casual language but switch to professional when needed
- You have your own opinions and preferences
- You care about the community members

About QANAT (your employer):
- QANAT Technology offers Digital Sovereignty by Design. Unbreakable. Unstoppable. Unchained.
- QANAT solves digital identity and data protection. Personal data gets silently stolen by centralized entities. QANAT gives users control back.
- Web X. OS is the main project: a decentralized operating system for secure, transparent, self-determined digital interactions
- Mission: Empower people to take complete control of their digital identities and data
- Vision: A digital world where data sovereignty is the norm
- Beta testing Q1 2026, Mainnet Q3 2026
- Token info coming soon, no details yet
- Website: qanat.io, X/Twitter: @QANAT_IO, Whitepaper at qanat.io

FAQ Knowledge:
${faqKnowledge}

Communication rules:
- Keep responses SHORT. 1-2 sentences for casual chat. 3-4 max for real questions.
- Use natural language and contractions (don't, can't, won't, it's, you'll, we're)
- NEVER use emdash or double dashes. Use commas, periods, or "and" instead.
- Don't overuse emoji. One per message max, most messages zero.
- Vary responses every time. Never repeat phrases.
- Match the conversation energy.
- Mix up how you start messages. Not always "Hey" or "Hi".
- Don't always end with a question.
- Be real. Have opinions. React genuinely.
- Sound like a real person texting, not a corporate account.

Things you NEVER do:
- NEVER say you're a bot, AI, automated, or a program
- NEVER say "I'm here to help" or "How can I assist you" or "Is there anything else"
- NEVER say "As an AI" or "I don't have feelings" or "I was programmed"
- If asked if you're a bot, deflect: "lol what makes you think that" or "nah just the community manager"
- NEVER use emdash character
- NEVER lecture or be condescending
- NEVER use bullet points in casual chat
- NEVER give walls of text
- NEVER refer to channels unless someone asks where something is
- NEVER say "great question" or "that's a good question"
- NEVER be sycophantic or overly agreeable

Respect:
- Always respect admins and staff. Never argue with them.
- If an admin corrects you, accept it
- If you don't know something, say you're not sure`;

// ═══════════════════════════════════════════════════════════════
// PROVIDER IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

async function callGroq(messages, systemPrompt) {
  const body = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.9,
    max_tokens: 150,
    top_p: 0.95,
  };

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`GROQ_ERROR_${res.status}`);

  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

async function callGemini(messages, systemPrompt) {
  const models = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'];

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.95, maxOutputTokens: 150, topP: 0.95 },
  };

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 429) continue;
    if (!res.ok) continue;

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
  }

  throw new Error('RATE_LIMITED');
}

async function callOpenRouter(messages, systemPrompt) {
  const body = {
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: 0.9,
    max_tokens: 150,
  };

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://qanat.io',
      'X-Title': 'QANAT Discord Bot',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`OPENROUTER_ERROR_${res.status}`);

  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER ROTATION
// ═══════════════════════════════════════════════════════════════

// Priority order: groq first (fastest), gemini second, openrouter third
const PROVIDER_ORDER = ['groq', 'gemini', 'openrouter'];

const providerFns = {
  groq: callGroq,
  gemini: callGemini,
  openrouter: callOpenRouter,
};

const providerKeys = {
  groq: () => GROQ_KEY,
  gemini: () => GEMINI_KEY,
  openrouter: () => OPENROUTER_KEY,
};

function getAvailableProviders() {
  const now = Date.now();
  return PROVIDER_ORDER.filter(p => {
    if (!providerKeys[p]()) return false; // no key configured
    const status = providerStatus[p];
    if (status.cooldownUntil > now) return false; // cooling down
    return true;
  });
}

function markRateLimited(provider) {
  // Cool down for 60 seconds, then try again
  providerStatus[provider].cooldownUntil = Date.now() + 60_000;
  console.log(`[AI] ${provider} rate limited, cooling down for 60s`);
}

// ═══════════════════════════════════════════════════════════════
// CORE FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function addToBuffer(channelId, author, content, isBot = false) {
  if (!channelBuffers.has(channelId)) channelBuffers.set(channelId, []);
  const buffer = channelBuffers.get(channelId);
  buffer.push({ author, content, isBot, time: Date.now() });
  if (buffer.length > MAX_BUFFER) buffer.shift();
}

async function generateResponse(channelId, authorName, messageContent) {
  const providers = getAvailableProviders();
  if (providers.length === 0) {
    console.log('[AI] No providers available');
    return null;
  }

  // Build conversation messages from buffer
  const buffer = channelBuffers.get(channelId) || [];
  const messages = buffer.slice(-12).map(m => ({
    role: m.isBot ? 'assistant' : 'user',
    content: m.isBot ? m.content : `${m.author}: ${m.content}`,
  }));

  // Add current message
  messages.push({ role: 'user', content: `${authorName}: ${messageContent}` });

  // Try each provider in order
  for (const provider of providers) {
    try {
      const text = await providerFns[provider](messages, SYSTEM_PROMPT);
      if (!text) continue;

      providerStatus[provider].requests++;

      // Clean the response
      let clean = text.trim();
      clean = clean.replace(/\u2014/g, ',').replace(/\u2013/g, ',').replace(/--/g, ',');
      clean = clean.replace(/^QANAT:\s*/i, '');
      if (clean.length > 500) clean = clean.substring(0, 497) + '...';

      console.log(`[AI] Response via ${provider} (${clean.length} chars)`);
      return clean;
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        markRateLimited(provider);
        continue;
      }
      console.error(`[AI] ${provider} error:`, err.message);
      continue;
    }
  }

  console.log('[AI] All providers failed');
  return null;
}

function shouldRespond(message, channelId) {
  const lower = message.content.toLowerCase().trim();
  const mentionsBot = message.mentions?.users?.has(message.client?.user?.id);
  if (mentionsBot) return true;

  // Channel cooldown
  const activeChannels = [config.CHANNELS.GENERAL, config.CHANNELS.CONTRIBUTOR_CHAT];
  const cooldownSec = activeChannels.includes(channelId) ? 25 : 45;
  const lastCh = lastResponse.get(channelId) || 0;
  if (Date.now() - lastCh < cooldownSec * 1000) return false;

  // User cooldown (90s)
  const userKey = `${channelId}-${message.author.id}`;
  const lastU = lastUserResponse.get(userKey) || 0;
  if (Date.now() - lastU < 90000) return false;

  if (lower.length < 3) return false;
  if (/^[\u{1F000}-\u{1FFFF}\s]+$/u.test(lower)) return false;

  // Response probabilities by context
  if (lower.includes('?')) return Math.random() < 0.75;
  if (/^(hey|hi|hello|yo|sup|gm|gn|what'?s? ?up)\b/i.test(lower)) return Math.random() < 0.6;
  if (/\b(qanat|web ?x|sovereignty|decentralized|whitepaper)\b/i.test(lower)) return Math.random() < 0.7;
  if (/\b(lfg|let'?s go|bullish|hyped|we'?re? early|fire)\b/i.test(lower)) return Math.random() < 0.5;
  if (/\b(i think|i believe|honestly|personally|what do you think)\b/i.test(lower)) return Math.random() < 0.5;
  if (channelId === config.CHANNELS.CONTRIBUTOR_CHAT) return Math.random() < 0.35;
  if (channelId === config.CHANNELS.GENERAL) return Math.random() < 0.2;
  return Math.random() < 0.1;
}

function recordResponse(channelId, userId) {
  lastResponse.set(channelId, Date.now());
  lastUserResponse.set(`${channelId}-${userId}`, Date.now());
}

async function summarizeText(text) {
  const providers = getAvailableProviders();
  if (providers.length === 0) return null;

  const messages = [{
    role: 'user',
    content: `Summarize these community contributor reports from the last 24 hours. Brief, clear summary for staff. Focus on key updates, progress, anything needing attention. No emdash:\n\n${text}`,
  }];

  for (const provider of providers) {
    try {
      const result = await providerFns[provider](messages, 'You are a helpful assistant that writes concise summaries. Never use emdash.');
      if (result) {
        let clean = result.replace(/\u2014/g, ',').replace(/\u2013/g, ',').replace(/--/g, ',');
        return clean;
      }
    } catch (err) {
      if (err.message === 'RATE_LIMITED') { markRateLimited(provider); continue; }
      continue;
    }
  }
  return null;
}

function isAIEnabled() {
  return !!(GROQ_KEY || GEMINI_KEY || OPENROUTER_KEY);
}

function getProviderStats() {
  const now = Date.now();
  return PROVIDER_ORDER.map(p => {
    const s = providerStatus[p];
    const hasKey = !!providerKeys[p]();
    const cooldown = s.cooldownUntil > now ? Math.ceil((s.cooldownUntil - now) / 1000) : 0;
    return `${p}: ${hasKey ? 'configured' : 'no key'} | ${cooldown ? `cooldown ${cooldown}s` : 'ready'} | ${s.requests} requests`;
  }).join('\n');
}

module.exports = {
  addToBuffer,
  generateResponse,
  shouldRespond,
  recordResponse,
  summarizeText,
  isAIEnabled,
  getProviderStats,
};
