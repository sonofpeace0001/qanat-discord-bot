// ═══════════════════════════════════════════════════════════════
// QANAT Bot -- X/Twitter Task Monitor
//
// Two modes:
// 1. ADMIN-TRIGGERED: Admin pastes a tweet link in #x-tasks,
//    bot auto-creates engagement tracking post with reactions.
//    No API needed. Works instantly.
//
// 2. API MODE: If TWITTER_BEARER_TOKEN is set, polls @QANAT_IO
//    for new tweets automatically.
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('./config');
const { queries: q } = require('./db');

let lastCheckedId = null;

function initXMonitor() {
  const latest = q.getLatestTweetId.get();
  if (latest) lastCheckedId = latest.tweet_id;
}

// ═══════════════════════════════════════════════════════════════
// ADMIN-TRIGGERED MODE (primary, always active)
// When admin posts a tweet link in #x-tasks, create tracking post
// ═══════════════════════════════════════════════════════════════

async function handleTweetLink(message) {
  // Only process in X Tasks channel
  if (message.channel.id !== config.CHANNELS.X_TASKS) return false;

  // Extract X/Twitter URLs
  const tweetRegex = /https?:\/\/(?:x\.com|twitter\.com)\/(\w+)\/status\/(\d+)/gi;
  const matches = [...message.content.matchAll(tweetRegex)];

  if (matches.length === 0) return false;

  for (const match of matches) {
    const tweetUrl = match[0];
    const tweetUser = match[1];
    const tweetId = match[2];

    // Skip if already tracked
    const existing = q.getTweet.get(tweetId);
    if (existing) continue;

    // Try to get tweet text via oEmbed (free, no auth)
    let tweetText = '';
    try {
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(tweetUrl)}&omit_script=true`;
      const res = await fetch(oembedUrl);
      if (res.ok) {
        const data = await res.json();
        // Extract text from HTML
        const htmlText = data.html || '';
        tweetText = htmlText
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
        if (tweetText.length > 300) tweetText = tweetText.substring(0, 297) + '...';
      }
    } catch {}

    // Delete the admin's original message (clean look)
    try { await message.delete(); } catch {}

    // Create the engagement tracking post
    const trackingMsg = await message.channel.send({
      content: `**New post from @${tweetUser} just dropped!** @everyone\n\nGo engage on X, then come back and react below to claim your points.\n\n` +
        (tweetText ? `> ${tweetText.split('\n').join('\n> ')}\n\n` : '') +
        `**Claim your points:**\n` +
        `👍 I liked it = **1 point**\n` +
        `💬 I commented = **2 points**\n` +
        `🔄 I retweeted/quoted = **3 points**\n` +
        `⭐ I did all three = **6 points**\n\n` +
        `You must follow @QANAT_IO and link your X with \`/linkx\` first.\n\n` +
        `${tweetUrl}`,
      allowedMentions: { parse: ['everyone'] },
    });

    // Add claim emojis
    await trackingMsg.react('👍');
    await trackingMsg.react('💬');
    await trackingMsg.react('🔄');
    await trackingMsg.react('⭐');

    // Store in DB
    q.addTweet.run(tweetId, tweetUrl, tweetText || 'No text available', trackingMsg.id);
    console.log(`[X Monitor] Tracking post created for tweet ${tweetId}`);
  }

  return true;
}

// ═══════════════════════════════════════════════════════════════
// API MODE (optional, if bearer token available)
// ═══════════════════════════════════════════════════════════════

async function fetchLatestTweets() {
  if (!config.X_BEARER) return [];

  try {
    const userRes = await fetch(`https://api.x.com/2/users/by/username/${config.X_ACCOUNT}`, {
      headers: { 'Authorization': `Bearer ${config.X_BEARER}` },
    });
    if (!userRes.ok) return [];

    const userData = await userRes.json();
    const userId = userData.data?.id;
    if (!userId) return [];

    const tweetsRes = await fetch(
      `https://api.x.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,text`,
      { headers: { 'Authorization': `Bearer ${config.X_BEARER}` } }
    );
    if (!tweetsRes.ok) return [];

    const tweetsData = await tweetsRes.json();
    return tweetsData.data || [];
  } catch (err) {
    console.error('[X Monitor] API error:', err.message);
    return [];
  }
}

async function pollXAccount(client) {
  const tweets = await fetchLatestTweets();
  if (tweets.length === 0) return;

  const guild = client.guilds.cache.get(config.GUILD_ID);
  if (!guild) return;

  const taskChannel = guild.channels.cache.get(config.CHANNELS.X_TASKS);
  if (!taskChannel) return;

  const newTweets = [];
  for (const tweet of tweets) {
    if (tweet.id === lastCheckedId) break;
    if (!q.getTweet.get(tweet.id)) newTweets.push(tweet);
  }

  for (const tweet of newTweets.reverse()) {
    const tweetUrl = `https://x.com/${config.X_ACCOUNT}/status/${tweet.id}`;
    const shortText = tweet.text.length > 300 ? tweet.text.substring(0, 297) + '...' : tweet.text;

    const msg = await taskChannel.send({
      content: `**New post from @${config.X_ACCOUNT} just dropped!** @everyone\n\nGo engage on X, then come back and react below to claim your points.\n\n` +
        `> ${shortText.split('\n').join('\n> ')}\n\n` +
        `**Claim your points:**\n` +
        `👍 I liked it = **1 point**\n` +
        `💬 I commented = **2 points**\n` +
        `🔄 I retweeted/quoted = **3 points**\n` +
        `⭐ I did all three = **6 points**\n\n` +
        `You must follow @QANAT_IO and link your X with \`/linkx\` first.\n\n` +
        `${tweetUrl}`,
      allowedMentions: { parse: ['everyone'] },
    });

    await msg.react('👍');
    await msg.react('💬');
    await msg.react('🔄');
    await msg.react('⭐');

    q.addTweet.run(tweet.id, tweetUrl, tweet.text, msg.id);
    console.log(`[X Monitor] Auto-posted tweet ${tweet.id}`);
  }

  if (tweets.length > 0) lastCheckedId = tweets[0].id;
}

// ═══════════════════════════════════════════════════════════════
// START
// ═══════════════════════════════════════════════════════════════

function startXMonitor(client) {
  initXMonitor();

  if (config.X_BEARER) {
    console.log(`[X Monitor] API mode active, polling @${config.X_ACCOUNT}`);
    setTimeout(() => pollXAccount(client), 30_000);
    setInterval(() => pollXAccount(client), config.X_POLL_INTERVAL_MS);
  } else {
    console.log(`[X Monitor] Admin-triggered mode. Post tweet links in #x-tasks to create tracking posts.`);
    console.log(`[X Monitor] Set TWITTER_BEARER_TOKEN for auto-polling.`);
  }
}

module.exports = { startXMonitor, handleTweetLink };
