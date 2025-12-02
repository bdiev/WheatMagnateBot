![WheatMagnateBot](WheatMagnateBot.jpg)

[![License](https://img.shields.io/badge/license-ISC-lightgrey)](https://opensource.org/licenses/ISC) [![Node.js](https://img.shields.io/badge/node.js-14+-brightgreen)](https://nodejs.org/)

# WheatMagnateBot

**Advanced Minecraft Discord Bot** - A powerful bot that bridges Minecraft and Discord with comprehensive monitoring, control, and automation features.

## 🚀 Features

### Core Functionality
- **Minecraft Integration**: Auto-login with Microsoft authentication, persistent sessions
- **Discord Bridge**: Real-time notifications and remote control via Discord bot
- **Server Monitoring**: TPS tracking, player monitoring, and status updates
- **Automated Survival**: Auto-eating, food monitoring, and inventory management

### Advanced Features
- **Player Detection System**: Identifies nearby players and distinguishes between whitelisted/non-whitelisted
- **Enemy Detection**: Automatically disconnects when non-whitelisted players approach
- **Whitelist Management**: Database-backed whitelist with Discord controls
- **Chat Bridge**: Two-way communication between Minecraft and Discord channels
- **Private Messaging**: Whisper handling with conversation history in Discord
- **Death Monitoring**: Detects and reports player deaths with special preservation

### Discord Control Panel
- **Interactive Buttons**: Pause/Resume, Say commands, Player lists, Nearby scans
- **Modal Interfaces**: Private messaging, server commands, whisper replies
- **Status Dashboard**: Real-time server status with player counts, TPS, health/food stats
- **Conversation Management**: Threaded whisper conversations with timestamps

### Automation & Safety
- **Smart Reconnect**: Automatic reconnection with server restart detection
- **Food Management**: Auto-eating when hungry, alerts when no food available
- **Channel Cleaner**: Automatic message cleanup with intelligent preservation rules
- **Error Handling**: Comprehensive error recovery and notification system

## 📋 Requirements
- Node.js 14+
- Minecraft account (Microsoft authentication)
- Discord bot token and channel access
- PostgreSQL database (optional but recommended)

## 🔧 Installation

```bash
npm install
```

## ⚙️ Configuration

Create a `.env` file based on `.env.example`:

```env
DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_CHANNEL_ID=your_channel_id
DISCORD_CHAT_CHANNEL_ID=your_chat_channel_id  # Optional
DATABASE_URL=postgresql://user:pass@host:port/dbname  # Optional but recommended
MINECRAFT_USERNAME=YourBotUsername
IGNORED_CHAT_USERNAMES=user1,user2  # Optional
```

## 🎮 Commands

### In-Game Commands (for authorized users)
- `!restart` - Restart the bot connection
- `!pause` - Pause bot until resume
- `!pause <minutes>` - Pause for specific duration
- `!allow <username>` - Add player to whitelist
- `!ignore <username>` - Ignore player in chat
- `!unignore <username>` - Stop ignoring player

### Discord Commands
- `!wn` - Show nearby players
- `!restart` - Restart bot connection
- `!pause` - Pause bot
- `!resume` - Resume paused bot
- `!allow <username>` - Add to whitelist
- `!ignore <username>` - Ignore in chat
- `!unignore <username>` - Stop ignoring
- `!say <message>` - Send message to Minecraft
- `!say` - Open modal for Minecraft message

## 🖥️ Discord Interface

### Status Message
- **Server Status Embed**: Shows bot status, player counts, TPS, health, food
- **Control Buttons**:
  - ⏸️ Pause - Temporarily stop the bot
  - ▶️ Resume - Restart the bot
  - 💬 Say - Send message to Minecraft
  - 👥 Players - Show online players list
  - 👀 Nearby - Scan for nearby players
  - ⚙️ Chat Settings - Manage ignored players
  - 📋 Whitelist - Manage whitelist

### Interactive Features
- **Player List**: Shows whitelisted and other players with selection options
- **Whisper Conversations**: Threaded conversations with reply buttons
- **Drop Interface**: Inventory management with item selection
- **Chat Settings**: Ignore/unignore player management

## 🛠️ Database Setup

The bot supports PostgreSQL for persistent data storage:

1. Create PostgreSQL database
2. Set `DATABASE_URL` in environment
3. Bot automatically creates required tables:
   - `whitelist` - Authorized players
   - `ignored_users` - Chat-ignored players

## 🚀 Deployment

### Local Development
```bash
node bot.js
```

### Production (Docker)
```dockerfile
FROM node:14
WORKDIR /app
COPY . .
RUN npm install
CMD ["node", "bot.js"]
```

### Cloud Platforms
- **Railway.app**: Connect GitHub repo, set environment variables
- **Coolify**: Add PostgreSQL service, configure environment
- **Azure/AWS**: Use container instances with persistent storage

## 🔍 Monitoring & Logging

- **Console Output**: Detailed logging with color-coded levels
- **Discord Notifications**: Critical events sent to configured channel
- **Status Updates**: Regular server status refreshes
- **Error Recovery**: Automatic handling of disconnections and errors

## 🛡️ Security

- Environment variables for all sensitive data
- No hardcoded credentials
- Database encryption recommended for production
- Rate limiting and error handling

## 📈 Performance

- Optimized event handling
- Efficient interval management
- Memory-efficient player tracking
- Low-latency Discord interactions

## 🤝 Contributing

Contributions welcome! Please submit pull requests with:
- Clear commit messages
- Updated documentation
- Test coverage for new features

## 📄 License

ISC License - Open source and free to use/modify.