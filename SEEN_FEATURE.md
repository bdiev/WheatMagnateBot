# "Seen" Feature - Player Activity Tracking

## Description
This new feature tracks the last activity of whitelist players on the Minecraft server.

## Features

### 1. Automatic Tracking
- The bot automatically records entry and exit times of whitelist players
- Data is stored in PostgreSQL database
- Tracks online/offline status

### 2. "🕒 Seen" Button
A new button has been added to the bot management interface (second row of buttons).

When clicked, it displays:
- **Online players** (🟢) - with last activity time
- **Offline players** (⚪) - with information about when they were last online

### 3. Time Display Format
- `Just now` - was online just now
- `5m ago` - 5 minutes ago
- `2h 30m ago` - 2 hours 30 minutes ago
- `3d 5h ago` - 3 days 5 hours ago
- `Never seen` - player has never been seen

## Database Structure

A new `player_activity` table has been created:
```sql
CREATE TABLE player_activity (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_online TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_online BOOLEAN DEFAULT FALSE
);
```

## Code Updates

### New Functions:
1. `updatePlayerActivity(username, isOnline)` - updates player status
2. `getWhitelistActivity()` - retrieves activity information for all whitelist players

### Tracking Events:
- `bot.on('playerJoined')` - player joined the server
- `bot.on('playerLeft')` - player left the server
- `bot.on('spawn')` - updates status of all online players when bot connects

## Usage

1. Start the bot (data will be automatically migrated to the database)
2. In the Discord channel, click the **"🕒 Seen"** button
3. Get current information about all whitelist players

## Notes

- Requires configured PostgreSQL database (`DATABASE_URL` environment variable)
- Only whitelist players are tracked
- Data is updated in real-time
- History is preserved even after bot restarts
