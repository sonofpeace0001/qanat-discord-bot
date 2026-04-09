// ═══════════════════════════════════════════════════════════════
// QANAT Bot — Deploy Slash Commands to Discord
// Run: node src/deploy.js
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1351174587517501440';

if (!TOKEN || !CLIENT_ID) {
  console.error('❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in .env');
  process.exit(1);
}

const rest = new REST().setToken(TOKEN);

(async () => {
  try {
    console.log(`🔄 Registering ${commands.length} slash commands...`);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands.map(c => c.toJSON()) }
    );

    console.log(`✅ Successfully registered ${commands.length} commands to guild ${GUILD_ID}`);
    console.log('Commands:', commands.map(c => `/${c.name}`).join(', '));
  } catch (err) {
    console.error('❌ Failed to deploy commands:', err);
  }
})();
