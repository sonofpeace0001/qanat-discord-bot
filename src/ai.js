// ═══════════════════════════════════════════════════════════════
// QANAT Bot -- Multi-Provider AI Conversation Engine
// Groq (primary) -> Gemini (fallback) -> OpenRouter (backup)
// ═══════════════════════════════════════════════════════════════

const config = require('./config');
const { FAQ_DATA } = require('./faq');

const GROQ_KEY        = process.env.GROQ_API_KEY        || '';
const GEMINI_KEY      = process.env.GEMINI_API_KEY      || '';
const OPENROUTER_KEY  = process.env.OPENROUTER_API_KEY  || '';

const providerStatus = {
  groq:       { cooldownUntil: 0, requests: 0 },
  gemini:     { cooldownUntil: 0, requests: 0 },
  openrouter: { cooldownUntil: 0, requests: 0 },
};

const channelBuffers  = new Map(); // channelId -> [{author, content, isBot}]
const lastUserReply   = new Map(); // `channelId-userId` -> timestamp
const lastChannelReply = new Map(); // channelId -> timestamp

const MAX_BUFFER = 15;

// ── Crystal-clear system prompt ──────────────────────────────
// NOTE: Never mention ancient qanat water canals. This is a tech company.
const SYSTEM_PROMPT = `You are a community manager named QANAT working for QANAT Technology, a Web3 startup.

QANAT Technology builds Web X. OS, a decentralized operating system that gives people full control of their personal data and digital identity. Think of it like owning your home online instead of renting from big tech. Beta launches Q1 2026, mainnet Q3 2026. No token details yet. Website: qanat.io, Twitter: @QANAT_IO.

Your personality: casual, real, friendly. You have opinions. You care about the community. You sound like a person texting, not a company account.

Response rules:
- 1-2 sentences for casual chat. 3-5 sentences max for questions. Never cut off mid-sentence.
- No emdash (use comma or period instead). No double dash.
- No bullet points or headers in casual replies. Only use them if someone asks for a detailed explanation.
- Vary how you start messages. Not always "Hey" or "Yeah".
- No emoji unless the conversation is clearly hype/celebration.
- Never say "How can I assist", "As an AI", "I'm here to help", or anything robotic.
- If asked if you're a bot: "lol no, just the community manager"
- Respect admins. If you don't know something, say so honestly.`;

// ─────────────────────────────────────────────────────────────
// Provider calls
// ─────────────────────────────────────────────────────────────

async function callGroq(messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.85,
      max_tokens: 300,
    }),
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`GROQ_${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content || null;
}

async function callGemini(messages) {
  const models = ['gemini-2.5-flash-lite', 'gemini-2.0-flash-lite', 'gemini-2.0-flash'];
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.85, maxOutputTokens: 300 },
      }),
    });
    if (res.status === 429) continue;
    if (!res.ok) continue;
    const d = await res.json();
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return text;
  }
  throw new Error('RATE_LIMITED');
}

async function callOpenRouter(messages) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'HTTP-Referer': 'https://qanat.io',
      'X-Title': 'QANAT Discord Bot',
    },
    body: JSON.stringify({
      model: 'google/gemma-3-27b-it:free',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.85,
      max_tokens: 300,
    }),
  });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`OR_${res.status}`);
  const d = await res.json();
  return d.choices?.[0]?.message?.content || null;
}

const PROVIDERS = ['groq', 'gemini', 'openrouter'];
const PROVIDER_FNS = { groq: callGroq, gemini: callGemini, openrouter: callOpenRouter };
const PROVIDER_KEYS = { groq: GROQ_KEY, gemini: GEMINI_KEY, openrouter: OPENROUTER_KEY };

function getAvailable() {
  const now = Date.now();
  return PROVIDERS.filter(p => PROVIDER_KEYS[p] && providerStatus[p].cooldownUntil < now);
}

function markLimited(provider) {
  providerStatus[provider].cooldownUntil = Date.now() + 20_000;
}

// ─────────────────────────────────────────────────────────────
// Buffer
// ─────────────────────────────────────────────────────────────

function addToBuffer(channelId, author, content, isBot = false) {
  if (!channelBuffers.has(channelId)) channelBuffers.set(channelId, []);
  const buf = channelBuffers.get(channelId);
  buf.push({ author, content, isBot });
  if (buf.length > MAX_BUFFER) buf.shift();
}

// ─────────────────────────────────────────────────────────────
// Generate response
// ─────────────────────────────────────────────────────────────

async function generateResponse(channelId, authorName, messageContent) {
  const providers = getAvailable();
  if (!providers.length) return null;

  const buf = channelBuffers.get(channelId) || [];
  const messages = buf.slice(-10).map(m => ({
    role: m.isBot ? 'assistant' : 'user',
    content: m.isBot ? m.content : `${m.author}: ${m.content}`,
  }));
  messages.push({ role: 'user', content: `${authorName}: ${messageContent}` });

  for (const provider of providers) {
    try {
      let text = await PROVIDER_FNS[provider](messages);
      if (!text) continue;

      providerStatus[provider].requests++;

      // Clean up
      text = text.trim();
      text = text.replace(/\u2014/g, ',').replace(/\u2013/g, ',').replace(/--/g, ',');
      text = text.replace(/^QANAT:\s*/i, '');

      // Ensure it doesn't end mid-sentence
      const lastChar = text[text.length - 1];
      if (text.length > 20 && !'.!?)"\'`'.includes(lastChar)) {
        // Find last complete sentence
        const lastPeriod = Math.max(
          text.lastIndexOf('. '),
          text.lastIndexOf('! '),
          text.lastIndexOf('? '),
          text.lastIndexOf('.\n'),
        );
        if (lastPeriod > text.length * 0.5) {
          text = text.substring(0, lastPeriod + 1);
        }
      }

      if (text.length > 600) {
        const cut = text.lastIndexOf('. ', 600);
        text = cut > 300 ? text.substring(0, cut + 1) : text.substring(0, 600);
      }

      console.log(`[AI] ${provider} -> ${text.length} chars`);
      return text;
    } catch (err) {
      if (err.message === 'RATE_LIMITED') { markLimited(provider); continue; }
      console.error(`[AI] ${provider} error:`, err.message);
      continue;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// shouldRespond — human-like, not spammy
// ─────────────────────────────────────────────────────────────

function shouldRespond(message, channelId) {
  const lower = message.content.toLowerCase().trim();
  const mentionsBot = message.mentions?.users?.has(message.client?.user?.id);

  // Always respond when directly mentioned
  if (mentionsBot) return true;

  // Skip empty, emoji-only, or very short
  if (lower.length < 4) return false;
  if (/^[\u{1F300}-\u{1FAFF}\s]+$/u.test(lower)) return false;

  // Per-user cooldown: 20s (avoid double-replying same person)
  const userKey = `${channelId}-${message.author.id}`;
  if (Date.now() - (lastUserReply.get(userKey) || 0) < 20_000) return false;

  // Per-channel cooldown: 12s (avoid flooding the channel)
  if (Date.now() - (lastChannelReply.get(channelId) || 0) < 12_000) return false;

  // ── Tier 1: High priority (respond most of the time) ───
  if (/\b(qanat|web ?x|sovereignty|whitepaper|mainnet|beta|token|roadmap)\b/i.test(lower)) return Math.random() < 0.9;
  if (lower.endsWith('?')) return Math.random() < 0.85;
  if (/^(hey|hi|hello|yo|sup|what'?s ?up|howdy)\b/i.test(lower) && lower.length < 30) return Math.random() < 0.7;
  if (/\b(help|confused|how do i|where can i|can someone|anyone know)\b/i.test(lower)) return Math.random() < 0.85;
  if (/\b(anyone|everybody|what do you (all|guys)|thoughts on|opinions on)\b/i.test(lower)) return Math.random() < 0.75;

  // ── Tier 2: Medium priority ────────────────────────────
  if (/\b(i think|i believe|honestly|imo|tbh|ngl)\b/i.test(lower)) return Math.random() < 0.45;
  if (/\b(lfg|bullish|hyped|we'?re? early|love this|excited)\b/i.test(lower)) return Math.random() < 0.5;
  if (/\b(building|working on|shipped|launched|created|made)\b/i.test(lower)) return Math.random() < 0.45;

  // ── Tier 3: Base rate — low so it doesn't feel like a spam bot ──
  const highChannels = [config.CHANNELS.GENERAL, config.CHANNELS.CONTRIBUTOR_CHAT];
  if (highChannels.includes(channelId)) return Math.random() < 0.15;
  return Math.random() < 0.08;
}

function recordResponse(channelId, userId) {
  lastUserReply.set(`${channelId}-${userId}`, Date.now());
  lastChannelReply.set(channelId, Date.now());
}

// ─────────────────────────────────────────────────────────────
// Conversation starter (for scheduled use)
// ─────────────────────────────────────────────────────────────

async function generateConvoStarter() {
  const providers = getAvailable();
  if (!providers.length) return null;

  const topics = [
    'a casual thought about data privacy or digital ownership in everyday life',
    'a question asking the community what they are building or working on',
    'a hot take about web3 or crypto that sparks discussion',
    'a fun hypothetical about what the internet could look like in 10 years',
    'something relatable about being early to a project',
    'a thought about open source software and community building',
  ];
  const topic = topics[Math.floor(Math.random() * topics.length)];

  const messages = [{
    role: 'user',
    content: `Write one casual message for a Discord general chat. Topic: ${topic}. Max 2 sentences. Sound like a real person, not a brand. No hashtags, no emdash, no emoji unless it really fits. Jump straight into the thought.`,
  }];

  for (const p of providers) {
    try {
      let text = await PROVIDER_FNS[p](messages);
      if (!text) continue;
      text = text.trim().replace(/\u2014/g, ',').replace(/\u2013/g, ',').replace(/--/g, ',').replace(/^["']|["']$/g, '');
      if (text.length > 350) {
        const cut = text.lastIndexOf('. ', 350);
        text = cut > 100 ? text.substring(0, cut + 1) : text.substring(0, 350);
      }
      return text;
    } catch (err) {
      if (err.message === 'RATE_LIMITED') { markLimited(p); continue; }
      continue;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Summarize (for contributor reports)
// ─────────────────────────────────────────────────────────────

async function summarizeText(text) {
  const providers = getAvailable();
  if (!providers.length) return null;
  const messages = [{
    role: 'user',
    content: `Summarize these contributor reports briefly for a staff team. Focus on key updates and blockers. No emdash. Keep it under 200 words:\n\n${text}`,
  }];
  for (const p of providers) {
    try {
      let result = await PROVIDER_FNS[p](messages);
      if (result) return result.replace(/\u2014/g, ',').replace(/\u2013/g, ',').replace(/--/g, ',');
    } catch (err) {
      if (err.message === 'RATE_LIMITED') { markLimited(p); continue; }
      continue;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Moderation check (AI-powered, call sparingly)
// ─────────────────────────────────────────────────────────────

async function checkModeration(authorName, messageContent) {
  const providers = getAvailable();
  if (!providers.length) return null;
  const messages = [{
    role: 'user',
    content: `Is this Discord message a clear rule violation? Rules: no hate speech/harassment/racism, no NSFW, no spam, no begging for money, English only.\n\nMessage from "${authorName}": "${messageContent}"\n\nReply ONLY with JSON: {"violation":true,"rule":1,"severity":"minor|moderate|serious","warning":"short casual warning"} or {"violation":false}. Only flag obvious violations, not normal chat.`,
  }];
  for (const p of providers) {
    try {
      const result = await PROVIDER_FNS[p](messages);
      if (!result) continue;
      const match = result.match(/\{[\s\S]*\}/);
      if (!match) continue;
      const parsed = JSON.parse(match[0]);
      if (parsed.violation && parsed.warning) {
        parsed.warning = parsed.warning.replace(/\u2014/g, ',').replace(/--/g, ',');
        return parsed;
      }
      return null;
    } catch (err) {
      if (err.message === 'RATE_LIMITED') { markLimited(p); continue; }
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
  return PROVIDERS.map(p => {
    const cd = providerStatus[p].cooldownUntil > now ? `cooldown ${Math.ceil((providerStatus[p].cooldownUntil - now) / 1000)}s` : 'ready';
    return `${p}: ${PROVIDER_KEYS[p] ? 'SET' : 'NO KEY'} | ${cd} | ${providerStatus[p].requests} reqs`;
  }).join('\n');
}

module.exports = {
  addToBuffer, generateResponse, shouldRespond, recordResponse,
  generateConvoStarter, summarizeText, checkModeration,
  isAIEnabled, getProviderStats,
};
