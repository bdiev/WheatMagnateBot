![WheatMagnateBot](WheatMagnateBot.jpg)

[![Lines of code](https://img.shields.io/badge/lines_of_code-1361-blue)]() [![License](https://img.shields.io/badge/license-ISC-lightgrey)](https://opensource.org/licenses/ISC) [![Node.js](https://img.shields.io/badge/node.js-14+-brightgreen)](https://nodejs.org/)

# WheatMagnateBot v1.0.0

Lightweight Minecraft bot built with mineflayer. Monitors hunger, scans nearby players, sends Discord notifications for events, and provides server status updates. Runs on Windows, Linux, or cloud platforms like Railway.app with Node.js.

## Features
- **Modular Architecture**: The bot is now organized into clean, maintainable modules:
  - `config.js`: Centralized configuration management
  - `database.js`: PostgreSQL database operations
  - `discordClient.js`: Discord bot functionality
  - `minecraftBot.js`: Minecraft bot core logic
  - `utils.js`: Utility functions and helpers
  - `main.js`: Main entry point and orchestration

- Auto-login to a configured Minecraft server with persistent Microsoft authentication.
- Discord bot notifications for: login, spawn, disconnect, errors, kicked (with readable reason display), death, low/no food, enemy detection, and death messages from Minecraft chat.
- Discord bot integration for remote control and status checks.
- Server status messages: sends real-time status updates with player count, nearby players, TPS, and whitelist online players when bot connects and periodically.
- Food monitor:
  - Detects common food items in inventory (bread, apple, beef, golden_carrot).
  - Auto-eats when hunger drops below a threshold (bot.food < 18).
  - Sends a Discord alert when no food is present.
- Nearby player scanner:
  - Detects players within 300 blocks using bot.entities and distance checks.
  - Supports an `ignoredUsernames` list loaded from `whitelist.txt`.
  - Enemy detection: If a non-whitelist player enters range, sends danger alert to Discord and disconnects for 10 minutes. Use `!allow <username>` command to add players to whitelist.
- Death message monitoring: Detects death-related messages in Minecraft chat (keywords: "died", "was slain", "perished") and sends notifications to Discord. Death messages are preserved in Discord channel and not deleted by the cleaner.
- Conversations with players: Receives whispers from Minecraft and creates/updates conversation embeds in Discord with timestamps. Incoming messages marked with ⬅️, outgoing replies with ➡️. Supports replying with custom messages or commands (e.g., /r for Minecraft reply). If reply starts with "/r ", displays only the message text. Conversations are preserved and not deleted by the cleaner.
- Private messaging: Button "📨 Msg" opens a modal to send private messages to any player. Reply modal supports arbitrary commands starting with "/".
- Graceful reconnect and pause controls:
  - Automatic reconnect on disconnect unless paused or enemy detected.
  - Smart handling during server restarts: detects daily restart at 9 AM Kyiv time and waits 5 minutes before reconnecting to avoid notification spam.
  - Commands for restart and pause available in-game and via Discord bot.
  - Player list button: Shows a detailed list of online players with whitelist players highlighted in the server status message.
- Safe interval management: clears monitoring intervals on spawn and on disconnect to prevent duplicates.
- Environment switch to disable startup (DISABLE_BOT=true).

## Requirements
- Node.js (14+ recommended)
- npm
- A Minecraft account (Microsoft) if using `auth: 'microsoft'`

## Dependencies
- mineflayer
- discord.js
- prismarine-auth
- pg (for PostgreSQL database)

Install:
```powershell
npm install
```

## Configuration
Edit `bot.js`:
- `config.host` — server hostname (default: `oldfag.org`)
- `config.username` — bot account username (default: `WheatMagnate`)
- `ignoredUsernames` — array of usernames to ignore
- `reconnectTimeout` — milliseconds before reconnect on disconnect (default: 15000)

Environment variables (see `.env.example` for template):
- `DISCORD_BOT_TOKEN` — Discord bot token (required for Discord commands and notifications)
- `DISCORD_CHANNEL_ID` — Discord channel ID for bot commands and notifications
- `DISCORD_CHAT_CHANNEL_ID` — Discord channel ID for chat bridge (optional)
- `IGNORED_CHAT_USERNAMES` — comma-separated list of usernames to ignore in chat (optional, fallback if DB not used)
- `MINECRAFT_USERNAME` — Minecraft username (optional, default: `WheatMagnate`)
- `MINECRAFT_SESSION` — cached Minecraft session for persistent auth (optional, but now saved in DB if DATABASE_URL set)
- `DATABASE_URL` — PostgreSQL connection string for storing session and other data (recommended for persistent auth across redeploys)
- `DISABLE_BOT=true` — prevents the bot from starting.

## Database Setup
The bot uses PostgreSQL to store ignored chat usernames.

1. Create a PostgreSQL database.
2. Set `DATABASE_URL` in `.env` (e.g., `postgresql://user:pass@localhost:5432/dbname`).
3. The bot will automatically create the `ignored_users` table on startup.
4. Use `!ignore <username>` in Minecraft chat to add users to ignore list.
- `AUTH_CACHE_DIR` — directory for Microsoft authentication cache (default: `~/.minecraft`). For persistent auth in containers, set to a mounted volume path.

## Commands
Commands are available in-game (authorized username `bdiev_` by default) and via Discord bot in the configured channel:

- `!wn` — show nearby players (Discord only)
- `!restart` — bot quits and reconnects.
- `!pause` — pause until `!resume` is sent (bot quits and waits for resume command).
- `!pause <minutes>` — pause for a custom number of minutes.
- `!resume` — resume bot after pause (Discord only).
- `!allow <username>` — adds the username to the whitelist to prevent enemy detection.
- `!say <message>` — sends a message to Minecraft chat (Discord only).

## Discord Buttons and Modals
- **⏸️ Pause**: Pauses the bot until resume.
- **▶️ Resume**: Resumes the bot after pause.
- **💬 Say**: Opens a modal to send a message to Minecraft chat.
- **📨 Msg**: Opens a modal with fields for nickname and message to send a private message to a player.
- **👥 Players**: Shows a list of online players.
- **Reply** (in conversations): Opens a modal to reply to the player. Supports arbitrary commands if message starts with "/". If starts with "/r ", displays only the text after it in the conversation.
- **Remove** (in whisper conversations): Deletes the conversation.

## Behavior Notes
- Food detection uses substring matching in item names.
- Eating is handled via `bot.equip()` and `bot.consume()`.
- Player scanning runs on a 1s interval.
- Interval timers are cleared on spawn and end to avoid multiple active timers.
- Disconnect and kick reasons are properly displayed: chat components are parsed to plain text for readability.
- During server restarts (detected at 9 AM Kyiv time), reconnection waits 5 minutes instead of 15 seconds to prevent notification spam.
- Discord bot responds to commands in the configured channel and sends notifications there.
- Death messages from Minecraft chat are detected and sent to Discord; these messages are preserved in the channel and not deleted by the automatic cleaner.
- Conversations with players from Minecraft are grouped into embeds in Discord, showing history with timestamps and directional arrows (⬅️ for incoming, ➡️ for outgoing). Replies update the same embed. If reply uses "/r ", only the message text is displayed. Conversation embeds are not deleted by the automatic cleaner.
- Modal submissions for messages and replies show ephemeral confirmations that auto-delete immediately to avoid clutter.

## Running the Bot
### Local (Windows/Linux)
1. Install Node.js and dependencies:
   ```bash
   npm install
   ```
2. Set environment variables and start the bot:
   ```bash
   export DISCORD_BOT_TOKEN=your_bot_token_here
   export DISCORD_CHANNEL_ID=your_channel_id_here
   node modules/main.js
   ```

### Railway.app Deployment
1. Push code to GitHub repository.
2. Connect repository to Railway.app.
3. Set environment variables in Railway dashboard:
    - `DISCORD_BOT_TOKEN`
    - `DISCORD_CHANNEL_ID`
    - `MINECRAFT_USERNAME` (optional)
    - `MINECRAFT_SESSION` (optional)
    - `STATUS_MESSAGE_ID` (optional, for updating existing status message)
4. Deploy.

### Coolify Deployment
1. Push code to GitHub repository.
2. Connect repository to Coolify.
3. Add PostgreSQL service in Coolify:
   - Go to your project in Coolify.
   - Click "Databases" > "Add Database".
   - Select PostgreSQL, set name (e.g., "botdb"), and create.
   - Wait for it to be ready. Note the connection details (host, port, user, password, database name).
4. In bot service, set environment variables:
     - `DISCORD_BOT_TOKEN`
     - `DISCORD_CHANNEL_ID`
     - `DISCORD_CHAT_CHANNEL_ID` (optional)
     - `IGNORED_CHAT_USERNAMES` (optional)
     - `DATABASE_URL` (format: `postgresql://username:password@host:port/database_name`, get from PostgreSQL service in Coolify)
     - `MINECRAFT_USERNAME` (optional)
5. Deploy. The bot will automatically create the `ignored_users` table and save session in DB, avoiding re-authentication.

## Deployment in Containers (e.g., Azure Container Instances)
To avoid re-authenticating on each redeploy:
1. Authenticate locally first: Run the bot on your machine to complete Microsoft login and cache the tokens.
2. In your container deployment, mount a persistent volume (e.g., Azure File Share) to a path like `/app/auth`.
3. Set environment variable `AUTH_CACHE_DIR=/app/auth`.
4. Copy the cached auth files from your local `~/.minecraft` to the mounted volume.

Example Docker command:
```bash
docker run -e AUTH_CACHE_DIR=/app/auth -v /host/path/to/auth:/app/auth your-bot-image
```

For Azure Container Instances, use Azure Files for persistent storage.

## Troubleshooting
- If Discord bot fails to connect, verify `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID`.
- If Microsoft login fails, check cached credentials and follow mineflayer auth docs. For containers, ensure `AUTH_CACHE_DIR` is set to a persistent path.
- Check console logs for runtime errors and Discord messages for critical events.

## Security & Privacy
- The Discord webhook URL is set via environment variable to prevent exposure in source code.
- Do not commit account credentials to source control.

## License
Licensed under ISC.