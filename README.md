# WheatMagnateBot

Minecraft bot with Discord integration, PostgreSQL-backed stats, and a local web dashboard.

## Features

- Minecraft bot powered by Mineflayer.
- Discord chat bridge for Minecraft messages.
- Local web dashboard with chat, bot stats, server stats, obsidian farm stats, player profiles, and admin tools.
- Player activity tracking: online status, last seen, playtime, chat stats, and nearby sightings.
- Safety scanner: disconnects when a nearby player is not whitelisted.
- Bot inventory viewer with armor, offhand, held item, durability, tooltips, and item drop action.
- Obsidian farm dashboard with mined totals, daily charts, rate, pickaxe stats, radius controls, and target coordinates.
- PostgreSQL storage for stats, whitelist data, chat logs, playtime, and farm history.
- Optional Discord controls for pausing, farming, following players, whitelist/admin actions, and child AI controls.

## Run

```powershell
npm install
npm start
```

## Dashboard

```powershell
cd site
npm install
npm start
```

Default site URL: `http://localhost:3080`.

## Config

Create `.env` in the project root.

Main variables:

```env
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_CHAT_CHANNEL_ID=
DATABASE_URL=
MINECRAFT_USERNAME=
MINECRAFT_AUTH=microsoft
SITE_PORT=3080
```

## Notes

- Node.js `22.13.0+` is expected.
- Keep `data/` persistent for Minecraft auth/cache.
- The web dashboard reads the same root `.env`.
- Admin-only dashboard controls are hidden from non-admin users.
- Public registration always creates a pending user. Follow [site/ADMIN_SETUP.md](site/ADMIN_SETUP.md) to create the first administrator securely.
