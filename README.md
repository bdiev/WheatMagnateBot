# WheatMagnateBot

[![License: ISC](https://img.shields.io/badge/license-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/node.js-16.11+-green.svg)](https://nodejs.org/)
[![Lines of Code](https://img.shields.io/badge/lines-3617-blue.svg)](.)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2.svg)](https://discord.js.org/)
[![Mineflayer](https://img.shields.io/badge/mineflayer-latest-orange.svg)](https://github.com/PrismarineJS/mineflayer)

> **Advanced Minecraft-Discord Bridge Bot** — Full-featured automation bot with intelligent chat relay, private messaging system, player activity tracking, and comprehensive Discord control panel.

---

## 📑 Table of Contents

- [Features](#-features)
- [Architecture](#-architecture)
- [Installation](#-installation)
- [Configuration](#%EF%B8%8F-configuration)
- [Usage](#-usage)
- [Discord Interface](#-discord-interface)
- [Commands](#-commands)
- [Database Schema](#-database-schema)
- [Deployment](#-deployment)
- [Advanced Features](#-advanced-features)
- [Troubleshooting](#-troubleshooting)
- [Contributing](#-contributing)
- [License](#-license)

---

## ✨ Features

### 🎮 Minecraft Integration
- **Microsoft Authentication** - Secure login with automatic session persistence
- **Auto-Reconnect** - Intelligent reconnection with server restart window detection (09:00 Kyiv time)
- **Survival Automation** - Auto-eating when hungry, food inventory monitoring
- **Player Proximity Detection** - Real-time scanning for nearby players (300 block radius)
- **Enemy Alert System** - Auto-disconnect when non-whitelisted players approach
- **TPS Monitoring** - Tracks server performance from TAB list and `/tps` command

### 💬 Chat Bridge System
- **Bidirectional Relay** - Seamless two-way chat between Minecraft and Discord
- **Smart Message Attribution** - Intelligent detection and reattribution of bot command responses (e.g., LolRiTTeRBot)
- **Command Response Handling** - 4-second window to capture and attribute plugin responses to correct bot
- **HTML Error Summarization** - Automatically condenses server error pages (504 Gateway Timeout, Azure Front Door errors)
- **Mention Keywords** - Custom keyword triggers for Discord mentions when words appear in-game
- **NameMC Integration** - Clickable profile links in chat embeds
- **Markdown Escaping** - Safe rendering of special characters and formatting

### 📨 Private Messaging (/msg)
- **Claim-Based System** - Unassigned whispers post claim cards in status channel
- **Private Dialog Channels** - Auto-created per-user channels under configured category
- **Auto-Delete Embeds** - Live countdown timers with customizable TTL (5/15/30 minutes)
- **Multi-Line Support** - Handles line breaks and long messages (240 char limit per line)
- **Conversation History** - Persistent threaded conversations with timestamps
- **Smart Suppression** - Prevents duplicate forwarding of whispers vs public chat

### 🎛️ Discord Control Panel
- **Live Status Embed** - Real-time display of:
  - Connection status with countdown during reconnects
  - Online player count and whitelist members
  - Nearby players with distances
  - Server TPS (Ticks Per Second)
  - Bot health and food levels
- **Interactive Buttons**:
  - ⏸️ **Pause/Resume** - Toggle bot operation
  - 👥 **Players** - View online players with /msg dropdown
  - 🕒 **Seen** - Player activity tracking with auto-updating timestamps
  - 🔔 **Mentions** - Manage keyword mention triggers
  - 🗑️ **Drop** - Inventory management interface
  - 📋 **Whitelist** - Add/remove authorized players (owner only)
  - ⚙️ **Chat Settings** - Ignore/unignore player chat (owner only)
- **Modal Forms** - Rich input interfaces for messaging and commands
- **Select Menus** - Dropdown selections for players, items, and keywords

### 🗄️ Database Integration (PostgreSQL)
- **Whitelist Management** - Persistent authorized player list
- **Ignored Users** - Chat suppression for specific players
- **Player Activity Tracking** - Last seen, online status, session history
- **Mention Keywords** - Per-user keyword subscriptions
- **Auto-Migration** - Seamless file-to-database migration on first run

### 🤖 Automation & Intelligence
- **Smart Message Routing** - 400ms delay to distinguish whispers from public chat
- **Channel Auto-Cleaner** - Removes old messages while preserving:
  - Death notifications
  - HTML error summaries
  - Whisper claim cards
  - Conversation threads
- **Concurrent Prevention** - Debounced status updates to avoid rate limits
- **Session Recovery** - Graceful handling of disconnections and errors
- **Debug Logging** - Optional verbose logging via `DEBUG_LOGS=true`

---

## 🏗️ Architecture

```
WheatMagnateBot (3617 lines)
├── Core Systems
│   ├── Mineflayer Client (Minecraft connection)
│   ├── Discord.js v14 Client (Discord integration)
│   └── PostgreSQL Pool (Database connection)
├── Message Routing
│   ├── Chat Event Handler (public messages)
│   ├── Whisper Event Handler (private messages)
│   ├── Generic Message Handler (system messages, bot responses)
│   └── Suppression System (deduplication maps)
├── Discord Components
│   ├── Status Message Manager (live embed updates)
│   ├── Interaction Handler (buttons, modals, select menus)
│   ├── Whisper Dialog System (private channels)
│   └── Channel Cleaner (message lifecycle)
├── Automation
│   ├── Food Monitor (auto-eating)
│   ├── Player Scanner (proximity detection)
│   ├── TPS Tracker (performance monitoring)
│   └── Activity Logger (player join/leave)
└── Utilities
    ├── HTML Summarizer (error page parsing)
    ├── Component String Parser (Minecraft JSON chat)
    ├── Auth Link Interceptor (Microsoft login)
    └── Safe Interaction Editor (error recovery)
```

---

## 🔧 Installation

### Prerequisites
- **Node.js** 16.11 or higher
- **PostgreSQL** 12+ (optional but recommended)
- **Minecraft Account** with Microsoft authentication
- **Discord Bot Token** with required permissions:
  - Read Messages/View Channels
  - Send Messages
  - Manage Messages
  - Embed Links
  - Read Message History
  - Manage Channels (for /msg dialogs)

### Setup

```bash
# Clone the repository
git clone https://github.com/your-username/WheatMagnateBot.git
cd WheatMagnateBot

# Install dependencies
npm install

# Create environment file
cp .env.example .env

# Edit configuration (see Configuration section)
nano .env

# Run the bot
node bot.js
```

---

## ⚙️ Configuration

Create a `.env` file with the following variables:

```env
# Discord Configuration (Required)
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CHANNEL_ID=1234567890123456789           # Status/notifications channel
DISCORD_CHAT_CHANNEL_ID=1234567890123456789      # Chat relay channel (optional)
DISCORD_DM_CATEGORY_ID=1234567890123456789       # Category for /msg dialogs (required for whispers)

# Minecraft Configuration (Required)
MINECRAFT_USERNAME=YourBotUsername
MINECRAFT_AUTH=microsoft                          # or 'offline' for cracked servers

# Database (Optional but recommended)
DATABASE_URL=postgresql://user:password@localhost:5432/wheatbot

# Chat Filtering (Optional)
IGNORED_CHAT_USERNAMES=spambot1,spambot2,announcer

# Debugging (Optional)
DEBUG_LOGS=false                                  # Set to 'true' for verbose logging
DISABLE_BOT=false                                 # Set to 'true' to disable bot startup
```

### Discord Setup

1. **Create Bot**: Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. **Enable Intents**: Enable "Message Content Intent" in Bot settings
3. **Invite Bot**: Generate invite URL with permissions code `274878286912`
4. **Get Channel IDs**: Enable Developer Mode in Discord → Right-click channels → Copy ID
5. **Create DM Category**: Create a category for private /msg channels, copy its ID

---

## 🎯 Usage

### Starting the Bot

```bash
# Standard run
node bot.js

# With debug logging
DEBUG_LOGS=true node bot.js

# Using process manager (PM2)
pm2 start bot.js --name wheatbot
pm2 logs wheatbot --lines 100
```

### First Run

1. Bot will prompt for **Microsoft authentication**
2. Auth link will be posted to Discord status channel
3. Visit link and enter the 8-character code
4. Bot will connect to Minecraft server automatically
5. Status embed will appear with control buttons

---

## 🖥️ Discord Interface

### Status Embed

```
Server Status
✅ Bot WheatMagnate connected to oldfag.org
👥 Players online: 12
👀 Players nearby: Player1, Player2
⚡ TPS: 19.8
🍔 Food: 20/20
❤️ Health: 20/20
📋 Whitelist online: bdiev_, friend1, friend2

Last updated
```

**Buttons:**
- `⏸️ Pause` / `▶️ Resume` - Toggle bot operation
- `👥 Players` - View player list with dropdown to message
- `🕒 Seen` - Activity tracker with live timestamps
- `🔔 Mentions` - Manage keyword mention triggers
- `🗑️ Drop` - Inventory management
- `📋 Whitelist` - Player authorization (owner only)
- `⚙️ Chat Settings` - Chat ignore list (owner only)

### Chat Channel

Messages sent in `DISCORD_CHAT_CHANNEL_ID` are relayed to Minecraft with format:
```
[DiscordUser] message content
```

Supports:
- Multi-line messages (sent as separate lines)
- Commands starting with `/` or `!` (sent as-is)
- Special character escaping
- Real-time confirmation embeds

### Whisper Dialogs

**Incoming /msg Flow:**
1. Bot receives `/msg` from unclaimed player
2. Claim card appears in status channel with "Claim dialog" button
3. First user to click gets private channel: `dialog-playername-1234`
4. All future whispers from that player route to private channel
5. Channel auto-deletes after 10 minutes of inactivity (customizable)

**Outgoing /msg:**
- Type directly in dialog channel (no `/msg` needed)
- Supports multi-line messages
- Auto-escape and formatting
- Live countdown timer for auto-delete

---

## 📜 Commands

### In-Game Commands (from whitelisted users)

```bash
!restart              # Restart bot connection
!pause                # Pause bot until manual resume
!pause <minutes>      # Pause for specified duration
!allow <username>     # Add player to whitelist
!ignore <username>    # Ignore player's chat messages
!unignore <username>  # Remove player from ignore list
```

### Discord Text Commands

```bash
!wn                      # Show nearby players (within 300 blocks)
!restart                 # Restart bot connection
!pause                   # Pause bot until resume
!pause <minutes>         # Pause for X minutes
!resume                  # Resume paused bot
!allow <username>        # Add player to whitelist
!ignore <username>       # Ignore player in chat relay
!unignore <username>     # Unignore player
!say <message>           # Send message to Minecraft
!myid                    # Get your Discord user ID
!addkeyword <word>       # Add mention keyword
!removekeyword <word>    # Remove mention keyword
!keywords                # List your keywords
!whitelist add <user>    # Add to whitelist (admin)
```

### Button Commands (via Discord UI)

All interactive features accessible through buttons in status embed and modal forms.

---

## 🗄️ Database Schema

Auto-created on first run:

```sql
-- Authorized players
CREATE TABLE whitelist (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    added_by VARCHAR(255),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat-ignored players
CREATE TABLE ignored_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    added_by VARCHAR(255),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player activity tracking
CREATE TABLE player_activity (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_online TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_online BOOLEAN DEFAULT FALSE
);

-- Mention keyword subscriptions
CREATE TABLE mention_keywords (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(255) NOT NULL,
    keyword VARCHAR(255) NOT NULL,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(discord_id, keyword)
);
```

---

## 🚀 Deployment

### Docker

```dockerfile
FROM node:16-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY . .

# Run bot
CMD ["node", "bot.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'
services:
  bot:
    build: .
    environment:
      - DISCORD_BOT_TOKEN=${DISCORD_BOT_TOKEN}
      - DISCORD_CHANNEL_ID=${DISCORD_CHANNEL_ID}
      - DISCORD_CHAT_CHANNEL_ID=${DISCORD_CHAT_CHANNEL_ID}
      - DISCORD_DM_CATEGORY_ID=${DISCORD_DM_CATEGORY_ID}
      - DATABASE_URL=${DATABASE_URL}
      - MINECRAFT_USERNAME=${MINECRAFT_USERNAME}
    restart: unless-stopped
    depends_on:
      - postgres

  postgres:
    image: postgres:14-alpine
    environment:
      - POSTGRES_DB=wheatbot
      - POSTGRES_USER=wheatbot
      - POSTGRES_PASSWORD=secure_password
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### Railway / Render / Coolify

1. Connect GitHub repository
2. Add PostgreSQL add-on/service
3. Set environment variables in dashboard
4. Deploy automatically on push

---

## 🔥 Advanced Features

### Smart Command Attribution

The bot intelligently detects and reattributes plugin command responses:

```
User sends: !pt
Server response (appears as from User): 66 Days, 8 Hours, 9 Minutes

Bot detects:
- User sent command-like message (starts with !/./# etc, ≤30 chars)
- Opens 4-second attribution window
- Next message matching bot-response pattern gets reattributed
- Discord shows: LolRiTTeRBot > User: 66 Days, 8 Hours, 9 Minutes
```

Supports all server plugins: `!pt`, `!faq`, `!stats`, `!top`, `/help`, etc.

### HTML Error Summarization

Condenses long server error pages into readable summaries:

```
Input: <html><head>...</head><body><h1>504 Gateway Timeout</h1>...
Output: 
504 Gateway Timeout
The server didn't respond in time
ErrorInfo: 20241219T020830Z
x-azure-ref: ABC123XYZ
```

Preserves in channel cleaner to track infrastructure issues.

### Whisper Suppression System

Prevents duplicate messages through intelligent timing:

```
Timeline:
0ms    - User sends message in-game
10ms   - Chat event fires (scheduled +400ms)
50ms   - Whisper event fires (marked immediately)
410ms  - Chat timer checks whisper mark → suppressed
```

Maps used:
- `recentWhispers` - 3s TTL for whisper markers
- `pendingChatTimers` - 400ms delayed public chat
- `outboundWhispers` - 5s TTL for own /msg echoes

### Player Activity Tracking

Real-time and historical tracking:

```javascript
// Join event
bot.on('playerJoined', async (player) => {
  await updatePlayerActivity(player.username, true);
  // Sets: last_seen, last_online, is_online=true
});

// Leave event  
bot.on('playerLeft', async (player) => {
  await updatePlayerActivity(player.username, false);
  // Sets: last_seen, is_online=false
});
```

**Seen Button** shows:
- 🟢 Online players (sorted alphabetically)
- ⚪ Offline players (sorted by recency)
- Live countdown updates every 1 second
- Auto-refresh for 5 minutes

---

## 🐛 Troubleshooting

### Bot Won't Connect

```bash
# Check Discord token
curl -H "Authorization: Bot YOUR_TOKEN" https://discord.com/api/v10/users/@me

# Check channel access
# Bot needs VIEW_CHANNEL permission in all configured channels

# Enable debug logs
DEBUG_LOGS=true node bot.js
```

### Whispers Not Working

```bash
# Verify category exists and bot has permissions:
- VIEW_CHANNEL
- MANAGE_CHANNELS  
- SEND_MESSAGES

# Check environment variable
echo $DISCORD_DM_CATEGORY_ID

# Test claim flow
# Send /msg to bot in-game, check status channel for claim card
```

### Database Connection Failed

```bash
# Test connection
psql $DATABASE_URL

# Check SSL requirement (Render/Railway)
# Add ?sslmode=require to DATABASE_URL

# Bot works without database (file-based fallback)
# Unset DATABASE_URL to use whitelist.txt
```

### Microsoft Auth Loop

```bash
# Clear session
unset MINECRAFT_SESSION

# Delete cached session
rm -f mineflayer-session.json

# Check auth link in Discord status channel
# Visit and enter 8-digit code

# After successful auth, bot auto-saves session
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** changes (`git commit -m 'Add amazing feature'`)
4. **Push** to branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Code Style

- Use ES6+ features
- Follow existing naming conventions
- Add JSDoc comments for new functions
- Test with `DEBUG_LOGS=true`

---

## 📄 License

**ISC License** - Open source and free to use, modify, and distribute.

```
Copyright (c) 2024-2025

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.
```

---

## 🙏 Acknowledgments

- [Mineflayer](https://github.com/PrismarineJS/mineflayer) - Minecraft bot framework
- [Discord.js](https://discord.js.org/) - Discord API library
- [PostgreSQL](https://www.postgresql.org/) - Database system
- [NameMC](https://namemc.com/) - Player profile integration

---

**Built with ❤️ for the Minecraft community**