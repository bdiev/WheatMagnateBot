# WheatMagnateBot

Lightweight Minecraft bot built with mineflayer that monitors food, scans nearby players, and sends Discord notifications. Designed to run on Windows with Node.js.

## Features
- Auto-login to a configured Minecraft server (Microsoft auth supported).
- Discord webhook notifications for important events (login, disconnect, errors, player enter/leave, low/no food, death, kicked).
- Food monitor:
  - Detects common food items in inventory (bread, apple, beef, golden_carrot).
  - Auto-eats when hunger falls below threshold.
  - Sends a notification if no food is present.
- Nearby player scanner:
  - Detects other players within 300 blocks.
  - Sends enter/leave notifications.
  - Respects an `ignoredUsernames` list.
- Graceful reconnect:
  - Automatic reconnect on disconnect unless paused.
  - Pause and restart control via in-game chat commands from an authorized user.
- Safe interval management: clears monitoring intervals on spawn/disconnect to avoid duplicates.
- Environment switch to disable the bot start-up.

## Requirements
- Node.js (14+ recommended)
- npm
- Minecraft account (Microsoft) if using `auth: 'microsoft'`

## Dependencies
- mineflayer
- axios

Install:
```powershell
npm install mineflayer axios
```

## Configuration
Edit `bot.js` to adjust these values:

- `config.host` — server hostname (default: `oldfag.org`).
- `config.username` — bot account username (default: `WheatMagnate`).
- `config.auth` — authentication method (e.g., `'microsoft'`).
- `DISCORD_WEBHOOK_URL` — set webhook URL string at top of `bot.js` or move to an environment variable for privacy.
- `ignoredUsernames` — array of usernames to ignore in player scanning.
- `reconnectTimeout` — milliseconds before reconnecting after disconnect.

Environment variables:
- `DISABLE_BOT=true` — prevents the bot from starting (process exits).

## In-Game Chat Commands
Only messages from the configured authorized username `bdiev_` are processed:

- `!restart` — bot quits and triggers reconnect.
- `!pause` — pause for 10 minutes (bot quits, then reconnects after 10 minutes).
- `!pause <minutes>` — pause for a custom number of minutes.

Commands are executed by the bot when it receives the chat message from the authorized user.

## Behavior Notes
- Food detection searches inventory item names for substrings: `bread`, `apple`, `beef`, `golden_carrot`.
- The bot eats when `bot.food < 18`.
- Player scanner checks `bot.entities` and measures distance to the bot's `entity.position`.
- Notifications are sent as embedded messages to the configured Discord webhook using `axios`.
- The bot clears periodic intervals on spawn and on end to avoid duplicated timers after reconnects.

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
- If the Discord webhook fails, check `DISCORD_WEBHOOK_URL` and network connectivity.
- If bot fails to login with Microsoft auth, ensure valid cached login or perform interactive auth flow (mineflayer docs).
- Check console logs for errors and webhook notifications for critical events.

## Contributing
PRs and bug reports are welcome. Keep changes small and focused.

## License
Add your preferred license file to the repository (e.g., MIT).
```// filepath: c:\Users\zbogh\OneDrive\Рабочий стол\WheatMagnateBot\README.md
# WheatMagnateBot

Lightweight Minecraft bot built with mineflayer that monitors food, scans nearby players, and sends Discord notifications. Designed to run on Windows with Node.js.

## Features
- Auto-login to a configured Minecraft server (Microsoft auth supported).
- Discord webhook notifications for important events (login, disconnect, errors, player enter/leave, low/no food, death, kicked).
- Food monitor:
  - Detects common food items in inventory (bread, apple, beef, golden_carrot).
  - Auto-eats when hunger falls below threshold.
  - Sends a notification if no food is present.
- Nearby player scanner:
  - Detects other players within 300 blocks.
  - Sends enter/leave notifications.
  - Respects an `ignoredUsernames` list.
- Graceful reconnect:
  - Automatic reconnect on disconnect unless paused.
  - Pause and restart control via in-game chat commands from an authorized user.
- Safe interval management: clears monitoring intervals on spawn/disconnect to avoid duplicates.
- Environment switch to disable the bot start-up.

## Requirements
- Node.js (14+ recommended)
- npm
- Minecraft account (Microsoft) if using `auth: 'microsoft'`

## Dependencies
- mineflayer
- axios

Install:
```powershell
npm install mineflayer axios
```

## Configuration
Edit `bot.js` to adjust these values:

- `config.host` — server hostname (default: `oldfag.org`).
- `config.username` — bot account username (default: `WheatMagnate`).
- `config.auth` — authentication method (e.g., `'microsoft'`).
- `DISCORD_WEBHOOK_URL` — set webhook URL string at top of `bot.js` or move to an environment variable for privacy.
- `ignoredUsernames` — array of usernames to ignore in player scanning.
- `reconnectTimeout` — milliseconds before reconnecting after disconnect.

Environment variables:
- `DISABLE_BOT=true` — prevents the bot from starting (process exits).

## In-Game Chat Commands
Only messages from the configured authorized username `bdiev_` are processed:

- `!restart` — bot quits and triggers reconnect.
- `!pause` — pause for 10 minutes (bot quits, then reconnects after 10 minutes).
- `!pause <minutes>` — pause for a custom number of minutes.

Commands are executed by the bot when it receives the chat message from the authorized user.

## Behavior Notes
- Food detection searches inventory item names for substrings: `bread`, `apple`, `beef`, `golden_carrot`.
- The bot eats when `bot.food < 18`.
- Player scanner checks `bot.entities` and measures distance to the bot's `entity.position`.
- Notifications are sent as embedded messages to the configured Discord webhook using `axios`.
- The bot clears periodic intervals on spawn and on end to avoid duplicated timers after reconnects.

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
- If the Discord webhook fails, check `DISCORD_WEBHOOK_URL` and network connectivity.
-