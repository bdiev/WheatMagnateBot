![WheatMagnateBot](WheatMagnateBot.jpg)
# WheatMagnateBot v1.0.0

Lightweight Minecraft bot built with mineflayer. Monitors hunger, scans nearby players, and sends Discord webhook notifications for important events. Designed to run on Windows with Node.js.

## Features
- Auto-login to a configured Minecraft server with persistent Microsoft authentication.
- Discord webhook notifications for: login, spawn, disconnect, errors, kicked (with readable reason display), death, low/no food, and enemy detection.
- Discord bot integration for remote control and status checks.
- Food monitor:
  - Detects common food items in inventory (bread, apple, beef, golden_carrot).
  - Auto-eats when hunger drops below a threshold (bot.food < 18).
  - Sends a Discord alert when no food is present.
- Nearby player scanner:
  - Detects players within 300 blocks using bot.entities and distance checks.
  - Supports an `ignoredUsernames` list loaded from `whitelist.txt`.
  - Enemy detection: If a non-whitelist player enters range, sends danger alert to Discord and disconnects for 10 minutes. Use `!allow <username>` command to add players to whitelist.
- Graceful reconnect and pause controls:
  - Automatic reconnect on disconnect unless paused or enemy detected.
  - Smart handling during server restarts: detects daily restart at 9 AM Kyiv time and waits 5 minutes before reconnecting to avoid notification spam.
  - Commands for restart and pause available in-game and via Discord bot.
- Safe interval management: clears monitoring intervals on spawn and on disconnect to prevent duplicates.
- Environment switch to disable startup (DISABLE_BOT=true).

## Requirements
- Node.js (14+ recommended)
- npm
- A Minecraft account (Microsoft) if using `auth: 'microsoft'`

## Dependencies
- mineflayer
- axios
- discord.js
- minecraft-server-util
- prismarine-auth

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

Environment variables:
- `DISCORD_WEBHOOK_URL` — Discord webhook URL (required for notifications)
- `DISCORD_BOT_TOKEN` — Discord bot token (required for Discord commands)
- `DISCORD_CHANNEL_ID` — Discord channel ID for bot commands and notifications
- `DISABLE_BOT=true` — prevents the bot from starting.
- `AUTH_CACHE_DIR` — directory for Microsoft authentication cache (default: `~/.minecraft`). For persistent auth in containers, set to a mounted volume path.

## Commands
Commands are available in-game (authorized username `bdiev_` by default) and via Discord bot in the configured channel:

- `!wn` — show nearby players (Discord only)
- `!restart` — bot quits and reconnects.
- `!pause` — pause until `!resume` is sent (bot quits and waits for resume command).
- `!pause <minutes>` — pause for a custom number of minutes.
- `!resume` — resume bot after pause (Discord only).
- `!allow <username>` — adds the username to the whitelist to prevent enemy detection.

## Behavior Notes
- Food detection uses substring matching in item names.
- Eating is handled via `bot.equip()` and `bot.consume()`.
- Player scanning runs on a 1s interval.
- Interval timers are cleared on spawn and end to avoid multiple active timers.
- Disconnect and kick reasons are properly displayed: chat components are parsed to plain text for readability.
- During server restarts (detected at 9 AM Kyiv time), reconnection waits 5 minutes instead of 15 seconds to prevent notification spam.
- Discord bot responds to commands in the configured channel and sends notifications there.

## Running the Bot (Windows)
1. Install Node.js and dependencies:
   ```powershell
   npm install
   ```
2. Set environment variables and start the bot:
   ```powershell
   set DISCORD_WEBHOOK_URL=your_webhook_url_here
   set DISCORD_BOT_TOKEN=your_bot_token_here
   set DISCORD_CHANNEL_ID=your_channel_id_here
   node bot.js
   ```

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
- If Discord webhooks fail, verify `DISCORD_WEBHOOK_URL` and network access.
- If Discord bot fails to connect, verify `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID`.
- If Microsoft login fails, check cached credentials and follow mineflayer auth docs. For containers, ensure `AUTH_CACHE_DIR` is set to a persistent path.
- Check console logs for runtime errors and webhook messages for critical events.

## Security & Privacy
- The Discord webhook URL is set via environment variable to prevent exposure in source code.
- Do not commit account credentials to source control.

## License
Licensed under ISC.