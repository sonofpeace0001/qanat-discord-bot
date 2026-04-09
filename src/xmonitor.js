// ═══════════════════════════════════════════════════════════════
// QANAT Bot — X/Twitter Monitor Module
// Polls @QANAT_IO for new posts and notifies the community
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('./config');
const { queries: q } = require('./db');

let lastCheckedId = null;

/**
 * Initialize the X monitor — loads the last known tweet from DB.
 */
function initXMonitor() {
  const latest = q.getLatestTweetId.get();
  if (latest) lastCheckedId = latest.tweet_id;
  console.log(`[X Monitor] Initialized. Last known tweet: ${lastCheckedId || 'none'}`);
}

/**
 * Fetch recent tweets from @QANAT_IO using X API v2.
 * Returns array of { id, text, created_at } or empty array on failure.
 */
async function fetchLatestTweets() {
  if (!config.X_BEARER) {
    return [];
  }

  try {
    const url = `https://api.x.com/2/users/by/username/${config.X_ACCOUNT}`;
    const userRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${config.X_BEARER}` },
    });

    if (!userRes.ok) {
      console.error(`[X Monitor] Failed to get user: ${userRes.status}`);
      return [];
    }

    const userData = await userRes.json();
    const userId = userData.data?.id;
    if (!userId) return [];

    const tweetsUrl = `https://api.x.com/2/users/${userId}/tweets?max_results=5&tweet.fields=created_at,text`;
    const tweetsRes = await fetch(tweetsUrl, {
      headers: { 'Authorization': `Bearer ${config.X_BEARER}` },
    });

    if (!tweetsRes.ok) {
      console.error(`[X Monitor] Failed to get tweets: ${tweetsRes.status}`);
      return [];
    }

    const tweetsData = await tweetsRes.json();
    return tweetsData.data || [];
  } catch (err) {
    console.error('[X Monitor] Error fetching tweets:', err.message);
    return [];
  }
}

/**
 * Poll for new tweets and post notifications in the X tasks channel.
 * @param {Client} client - Discord client
 */
async function pollXAccount(client) {
  const tweets = await fetchLatestTweets();
  if (tweets.length === 0) return;

  const guild = client.guilds.cache.get(config.GUILD_ID);
  if (!guild) return;

  const taskChannel = guild.channels.cache.get(config.CHANNELS.X_TASKS);
  if (!taskChannel) return;

  // Find new tweets (posted after our last check)
  const newTweets = [];
  for (const tweet of tweets) {
    if (tweet.id === lastCheckedId) break;
    const existing = q.getTweet.get(tweet.id);
    if (!existing) newTweets.push(tweet);
  }

  if (newTweets.length === 0) return;

  // Process new tweets (oldest first)
  for (const tweet of newTweets.reverse()) {
    const tweetUrl = `https://x.com/${config.X_ACCOUNT}/status/${tweet.id}`;
    const shortText = tweet.text.length > 200
      ? tweet.text.substring(0, 200) + '...'
      : tweet.text;

    const embed = new EmbedBuilder()
      .setColor(0x1DA1F2)
      .setTitle('🚀 New Post from @QANAT_IO!')
      .setDescription(shortText)
      .addFields(
        { name: '❤️ Like', value: '+1 point', inline: true },
        { name: '💬 Comment', value: '+2 points', inline: true },
        { name: '🔁 Retweet/Quote', value: '+3 points', inline: true },
      )
      .setFooter({ text: '⚠️ You must follow @QANAT_IO and link your X with /linkx to earn points' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View Post')
        .setStyle(ButtonStyle.Link)
        .setURL(tweetUrl)
        .setEmoji('🔗'),
    );

    const msg = await taskChannel.send({
      content: '📢 **@everyone New QANAT post just dropped!** Engage to earn points! 🎯',
      embeds: [embed],
      components: [row],
    });

    // Add reaction emojis for claiming
    await msg.react(config.EMOJIS.LIKE);
    await msg.react(config.EMOJIS.COMMENT);
    await msg.react(config.EMOJIS.RETWEET);

    // Store in DB
    q.addTweet.run(tweet.id, tweetUrl, tweet.text, msg.id);
    console.log(`[X Monitor] Posted tweet notification: ${tweet.id}`);
  }

  // Update last checked
  lastCheckedId = tweets[0].id;
}

/**
 * Start the X polling interval.
 * @param {Client} client
 */
function startXMonitor(client) {
  initXMonitor();

  if (!config.X_BEARER) {
    console.log('[X Monitor] No Twitter Bearer Token set — X monitoring disabled.');
    console.log('[X Monitor] Set TWITTER_BEARER_TOKEN in .env to enable.');
    return;
  }

  // Initial poll after 30s
  setTimeout(() => pollXAccount(client), 30_000);

  // Then poll every 5 minutes
  setInterval(() => pollXAccount(client), config.X_POLL_INTERVAL_MS);
  console.log(`[X Monitor] Started polling @${config.X_ACCOUNT} every ${config.X_POLL_INTERVAL_MS / 60000} minutes`);
}

module.exports = { startXMonitor, pollXAccount, initXMonitor };
