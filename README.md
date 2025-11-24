# WheatMagnateBot

Lightweight Minecraft bot built with mineflayer. Monitors hunger, scans nearby players, and sends Discord webhook notifications for important events. Designed to run on Windows with Node.js.

## Features
- Auto-login to a configured Minecraft server (Microsoft auth supported).
- Discord webhook notifications for: login, spawn, disconnect, errors, kicked, death, low/no food, and player enter/leave.
- Food monitor:
  - Detects common food items in inventory (bread, apple, beef, golden_carrot).
  - Auto-eats when hunger drops below a threshold (bot.food < 18).
  - Sends a Discord alert when no food is present.
- Nearby player scanner:
  - Detects players within 300 blocks using bot.entities and distance checks.
  - Sends enter/leave notifications.
  - Supports an `ignoredUsernames` list.
- Graceful reconnect and pause controls:
  - Automatic reconnect on disconnect unless paused.
  - In-game chat commands (authorized user) for restart and pause.
- Safe interval management: clears monitoring intervals on spawn and on disconnect to prevent duplicates.
- Environment switch to disable startup (DISABLE_BOT=true).

## Requirements
- Node.js (14+ recommended)
- npm
- A Minecraft account (Microsoft) if using `auth: 'microsoft'`

## Dependencies
- mineflayer
- axios

Install:
```powershell
npm install mineflayer axios
```

## Configuration
Edit `bot.js`:
- `config.host` — server hostname (default: `oldfag.org`)
- `config.username` — bot account username (default: `WheatMagnate`)
- `config.auth` — authentication method (e.g., `'microsoft'`)
- `DISCORD_WEBHOOK_URL` — Discord webhook URL (set in file or as an environment variable)
- `ignoredUsernames` — array of usernames to ignore
- `reconnectTimeout` — milliseconds before reconnect on disconnect

Environment variables:
- `DISABLE_BOT=true` — prevents the bot from starting.

## In-Game Chat Commands
Only messages from the authorized username (`bdiev_` by default) are processed:
- `!restart` — bot quits and reconnects.
- `!pause` — pause for 10 minutes (bot quits and reconnects after 10 minutes).
- `!pause <minutes>` — pause for a custom number of minutes.

## Behavior Notes
- Food detection uses substring matching in item names.
- Eating is handled via `bot.equip()` and `bot.consume()`.
- Player scanning runs on a 1s interval and tracks enter/leave events with a Set.
- Interval timers are cleared on spawn and end to avoid multiple active timers.

## Running the Bot (Windows)
1. Install Node.js and dependencies:
   ```powershell
   npm install
   npm install mineflayer axios
   ```
2. Start the bot:
   ```powershell
   node bot.js
   ```

## Troubleshooting
- If Discord webhooks fail, verify `DISCORD_WEBHOOK_URL` and network access.
- If Microsoft login fails, check cached credentials and follow mineflayer auth docs.
- Check console logs for runtime errors and webhook messages for critical events.

## Security & Privacy
- Keep the Discord webhook URL private. Consider moving it to an environment variable.
- Do not commit account credentials to source control.

## License
Choose and add a license file (e.g., MIT) before publishing the repository.