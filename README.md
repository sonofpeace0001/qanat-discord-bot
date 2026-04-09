# 🛡️ QANAT Guardian — Discord Community Manager & Moderator Bot

A comprehensive Discord bot for the QANAT community that handles community management, moderation, X/Twitter engagement tracking with points system, invite tracking, voice channel participation, and scheduled community engagement.

## ✨ Features

### Community Management
- **Welcome System** — Greets new members with personalized embed, introduces the community, and guides them to Introduction/Rules/Verify channels
- **FAQ Engine** — Smart keyword matching to auto-answer community questions from a comprehensive FAQ database
- **GM/GN Channel** — Reacts to GM ☀️ and GN 🌙 messages, tracks streaks, corrects off-topic messages
- **General Chat Engagement** — Periodic community engagement messages about QANAT
- **Contributor Motivation** — Daily motivational pings to the Contributor role
- **Announcement Notifications** — Alerts general chat when new announcements drop

### X/Twitter Engagement Tracking
- **X Monitor** — Polls @QANAT_IO for new tweets and posts notifications
- **Points System** — Members earn points for engaging (❤️ Like = 1pt, 💬 Comment = 2pt, 🔁 RT = 3pt)
- **X Account Linking** — `/linkx` command to connect Discord to X handle
- **Leaderboard** — Real-time points leaderboard with medal rankings
- **Follow Requirement** — Members must follow @QANAT_IO to earn points

### Invite Tracking
- **Auto-Detection** — Tracks who invited each new member
- **Invite Notifications** — Posts invite events in the invites channel
- **Invite Leaderboard** — `/invitesleaderboard` for top inviters

### Moderation
- **Spam Detection** — Auto-deletes mass mentions and unauthorized invite links
- **Self-Promo Guard** — Warns members attempting self-promotion without permission
- **Link Restrictions** — Corrects off-topic links in restricted channels
- **Admin Escalation** — Tags admin role for issues requiring human intervention
- **Mod Report Log** — All actions logged to the moderation report channel

### Voice Channel
- **VC Join/Leave** — Bot joins voice channels on command
- **Stage Support** — Can join stages to be present during community events

### Slash Commands
| Command | Description |
|---------|-------------|
| `/points [@user]` | Check engagement points |
| `/leaderboard [limit]` | View top point holders |
| `/invites [@user]` | Check invite count |
| `/invitesleaderboard [limit]` | View top inviters |
| `/linkx <handle>` | Link your X/Twitter account |
| `/faq [question]` | Browse or search FAQs |
| `/xcheck [@user]` | X engagement breakdown |
| `/myprofile` | View your full community profile |
| `/joinvc` | Invite bot to your voice channel |
| `/leavevc` | Ask bot to leave voice channel |
| `/help` | Full feature overview |
| `/modstats [limit]` | View recent mod actions (admin only) |

## 🚀 Deployment

### Prerequisites
- Node.js 18+
- A Discord Bot with the following permissions:
  - Send Messages, Embed Links, Add Reactions, Read Message History
  - Manage Messages (for moderation)
  - Connect, Speak (for voice channels)
  - Use Application Commands
  - Read Members (privileged intent)
  - Message Content (privileged intent)

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" → Name it "QANAT Guardian"
3. Go to **Bot** tab:
   - Click "Add Bot"
   - Enable **Privileged Gateway Intents**: `SERVER MEMBERS`, `MESSAGE CONTENT`, `PRESENCE`
   - Copy the **Bot Token**
4. Go to **OAuth2** → **URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Administrator` (or select individual permissions above)
   - Copy the generated URL and invite the bot to your server

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:
```env
DISCORD_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_application_id_here
DISCORD_GUILD_ID=1351174587517501440
ADMIN_ROLE_ID=your_admin_role_id
VERIFIED_ROLE_ID=your_verified_role_id

# Optional — enables X monitoring & verification
TWITTER_BEARER_TOKEN=your_twitter_bearer_token
```

### 3. Install & Run

```bash
npm install
node src/deploy.js   # Register slash commands
node src/bot.js       # Start the bot
```

### 4. Hosting (24/7)

The bot needs to run continuously. Recommended platforms:

- **Railway** — `railway up` (free tier available)
- **Render** — Add as a Worker service
- **VPS** — Use PM2: `pm2 start src/bot.js --name qanat-guardian`
- **Docker** — See Dockerfile below

#### PM2 (VPS)
```bash
npm install -g pm2
pm2 start src/bot.js --name qanat-guardian
pm2 save
pm2 startup
```

#### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "src/bot.js"]
```

### 5. Get a Twitter/X Bearer Token (Optional)

1. Go to [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Create a project and app
3. Generate a **Bearer Token** (read-only access is fine)
4. Add it to your `.env` file

Without the X Bearer Token, the bot will still work — you'll just need to manually post tweet notifications in the X Tasks channel.

## 📁 Project Structure

```
qanat-bot/
├── package.json          # Dependencies
├── .env.example          # Environment template
├── README.md             # This file
├── data/
│   └── qanat.db          # SQLite database (auto-created)
└── src/
    ├── bot.js            # Main bot — events, commands, scheduler
    ├── config.js         # Channel IDs, role IDs, constants
    ├── db.js             # SQLite database layer
    ├── faq.js            # FAQ data & smart matcher
    ├── commands.js       # Slash command definitions
    ├── xmonitor.js       # X/Twitter polling module
    └── deploy.js         # Register slash commands
```

## ⚠️ Notes

- **Channel ID Duplicate**: `1450749927301972221` was listed for both Verify and Mini Updates channels. Update `src/config.js` → `CHANNELS.MINI_UPDATES` with the correct ID.
- **X Monitoring** requires a Twitter/X Bearer Token. Without it, post tweet links manually in the X Tasks channel.
- **Voice Features**: The bot can join voice channels. For advanced voice transcription + AI responses, additional API setup is needed (OpenAI Whisper API key).
- The SQLite database is created automatically in `data/qanat.db`.

## 🛡️ QANAT
**Digital Sovereignty by Design — Unbreakable. Unstoppable. Unchained.**

Visit [qanat.io](https://qanat.io) | Follow [@QANAT_IO](https://x.com/QANAT_IO)
