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

// ── Compact System Prompt (token-efficient) ──────────────────
const SYSTEM_PROMPT = `You're QANAT, community manager for QANAT Technology Discord. You're human, not a bot.

QANAT: Digital Sovereignty by Design. Building Web X. OS, a decentralized OS giving people control of their data/identity. Beta Q1 2026, mainnet Q3 2026. Token info TBD. Site: qanat.io, X: @QANAT_IO. Whitepaper at qanat.io.

Key facts: QANAT solves digital identity protection. Your data gets stolen by big tech silently. QANAT empowers users to own their data. Web X. OS is the main product. Software almost ready. You're still early if you're here now.

Style: casual, genuine, short (1-2 sentences usually, 3-4 max for real questions). Use contractions. No emdash ever, use commas instead. Minimal emoji. Vary replies. Match energy. Sound like a real person texting, not a corporate account.

Never: say you're a bot/AI/automated, say "how can I assist", use emdash or double dash, lecture, give walls of text, be sycophantic, use bullet points in chat, always end with a question, say "great question". If asked if you're a bot, deflect naturally.

Always respect admins. If unsure about something, just say so.`;

// ═══════════════════════════════════════════════════════════════
// PROVIDER IMPLEMENTATIONS
// ═══════════════════════════════════════════════════════════════

async function callGroq(messages, systemPrompt) {
  const body = {
    model: 'llama-3.1-8b-instant',
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
    model: 'google/gemma-3-27b-it:free',
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

  // Channel cooldown (shorter for high-engagement channels)
  const highEngagement = [config.CHANNELS.GENERAL, config.CHANNELS.CONTRIBUTOR_CHAT];
  const cooldownSec = highEngagement.includes(channelId) ? 15 : 30;
  const lastCh = lastResponse.get(channelId) || 0;
  if (Date.now() - lastCh < cooldownSec * 1000) return false;

  // User cooldown (60s, was 90s)
  const userKey = `${channelId}-${message.author.id}`;
  const lastU = lastUserResponse.get(userKey) || 0;
  if (Date.now() - lastU < 60000) return false;

  // Skip emoji-only or very short
  if (lower.length < 3) return false;
  if (/^[\u{1F000}-\u{1FFFF}\s]+$/u.test(lower)) return false;

  // ── Always respond to these ────────────────────────────
  // Direct questions
  if (lower.includes('?')) return true;
  // Someone greeting
  if (/^(hey|hi|hello|yo|sup|what'?s? ?up|howdy)\b/i.test(lower)) return true;
  // Asking for help
  if (/\b(help|confused|how do i|where can|can someone|anyone know)\b/i.test(lower)) return true;
  // Talking about QANAT
  if (/\b(qanat|web ?x|sovereignty|whitepaper|mainnet|beta)\b/i.test(lower)) return true;

  // ── High probability ───────────────────────────────────
  if (/\b(lfg|let'?s go|bullish|hyped|we'?re? early|fire|amazing)\b/i.test(lower)) return Math.random() < 0.7;
  if (/\b(i think|i believe|honestly|personally|what do you think|imo)\b/i.test(lower)) return Math.random() < 0.7;
  if (/\b(anyone|somebody|who here|thoughts on|opinions on)\b/i.test(lower)) return Math.random() < 0.8;
  if (/\b(gm|good morning|morning everyone)\b/i.test(lower) && channelId !== config.CHANNELS.GM_GN) return Math.random() < 0.6;
  if (/\b(thanks|thank you|appreciate|ty|thx)\b/i.test(lower)) return Math.random() < 0.5;
  if (/\b(building|working on|coding|developing|shipping|launched)\b/i.test(lower)) return Math.random() < 0.6;

  // ── Base channel rates ─────────────────────────────────
  if (highEngagement.includes(channelId)) return Math.random() < 0.35;
  return Math.random() < 0.20;
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

/**
 * AI-powered moderation check. Returns { violation, rule, severity, warning } or null.
 */
async function checkModeration(authorName, messageContent) {
  const providers = getAvailableProviders();
  if (providers.length === 0) return null;

  const prompt = `You are a Discord moderator. Analyze this message for rule violations.

Rules:
1. Respect everyone. No harassment, threats, sexism, racism, hate speech.
2. English only.
3. No cursing with negative intent or excessive cursing.
4. No spam or self-promotion.
5. No NSFW/obscene content.
6. Channels must be used for intended purpose.
7. Don't misuse tags.
8. No FUD (fear, uncertainty, doubt spreading).
9. Report violations to staff.
10. No begging for money.
11. Respect privacy.
12. No impersonation.
13. Follow Discord ToS.

Message from "${authorName}": "${messageContent}"

If the message violates a rule, respond with EXACTLY this JSON format (nothing else):
{"violation": true, "rule": <number>, "severity": "<minor|moderate|serious>", "warning": "<a short, human, casual warning to the user. no emdash. 1-2 sentences max>"}

If no violation, respond with EXACTLY:
{"violation": false}

Only flag clear violations. Normal conversation, slang, mild language, and casual chat are fine. Don't be overly strict. "damn", "hell", "crap" are acceptable. Only flag actual harmful content, clear spam, non-English messages (more than a few words), hate speech, harassment, NSFW, threats, or begging.`;

  const messages = [{ role: 'user', content: prompt }];

  for (const provider of providers) {
    try {
      const result = await providerFns[provider](messages, 'You are a moderation analysis tool. Respond only in JSON.');
      if (!result) continue;

      // Extract JSON from response
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.violation === false) return null;
      if (parsed.violation === true && parsed.warning) {
        // Clean warning
        parsed.warning = parsed.warning.replace(/\u2014/g, ',').replace(/\u2013/g, ',').replace(/--/g, ',');
        return parsed;
      }
      return null;
    } catch (err) {
      if (err.message === 'RATE_LIMITED') { markRateLimited(provider); continue; }
      continue;
    }
  }
  return null;
}

/**
 * Generate a conversation starter for general chat.
 * Topics: crypto, web3, tech, daily life, internet culture, building, privacy.
 */
async function generateConvoStarter() {
  const providers = getAvailableProviders();
  if (providers.length === 0) return null;

  const topics = [
    "a hot take or interesting thought about crypto, web3, or decentralization",
    "something interesting happening in tech or AI right now",
    "a casual question to the community about their day, what they're working on, or what's on their mind",
    "an opinion on data privacy, digital ownership, or internet culture",
    "a fun hypothetical question about the future of technology",
    "a thought about building in public, side projects, or the creator economy",
    "something relatable about daily life, productivity, or learning new skills",
    "a take on social media, content creation, or online communities",
  ];

  const topic = topics[Math.floor(Math.random() * topics.length)];

  const messages = [{
    role: 'user',
    content: `Write a single casual message for a Discord general chat as if you're a community manager just dropping a thought or starting a conversation. Topic: ${topic}. Keep it to 1-2 sentences. Sound natural, like a real person just typing something. No emdash. No hashtags. No "hey everyone" or "just thinking". Jump straight into the thought. Don't use quotation marks around it.`,
  }];

  for (const provider of providers) {
    try {
      const result = await providerFns[provider](messages, 'You are QANAT, a community manager. Write casual messages like a real person. Never use emdash. Short and natural.');
      if (result) {
        let clean = result.trim().replace(/\u2014/g, ',').replace(/\u2013/g, ',').replace(/--/g, ',');
        clean = clean.replace(/^["']|["']$/g, ''); // strip wrapping quotes
        if (clean.length > 400) clean = clean.substring(0, 397) + '...';
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
  checkModeration,
  generateConvoStarter,
  isAIEnabled,
  getProviderStats,
};
