# WheatMagnateBot

Minecraft bot with Discord integration, PostgreSQL-backed stats, and a local web dashboard.

## Features

- Minecraft bot powered by Mineflayer.
- Discord chat bridge for Minecraft messages.
- Local web dashboard with chat, bot stats, server stats, obsidian farm stats, player profiles, and admin tools.
- Player activity tracking: online status, last seen, playtime, chat stats, and nearby sightings.
- Safety scanner: disconnects when a nearby player is not whitelisted.
- Bot inventory viewer with armor, offhand, held item, durability, tooltips, and item drop action.
- Obsidian farm analytics with efficiency, downtime, supply forecasts, confidence explanations, anomalies, goals, period comparisons, graph annotations, CSV export, and scheduled Discord reports.
- PostgreSQL storage for stats, whitelist data, chat logs, playtime, and farm history.
- Optional Discord controls for pausing, farming, following players, whitelist/admin actions, and child AI controls.
- Local Growing Child learning with bounded conversation context, expiring sourced memories, repetition protection and generation-quality scoring.
- Unified notification center for disconnects, kicks, safety alerts, farm supplies/stalls, food, TPS, database health, reconnect loops and failed commands.
- Notification delivery to Discord, the dashboard and the system log, with rule-based severity, thresholds, cooldowns, deduplication and recovery events.

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
NOTIFICATION_DISCORD_CHANNEL_ID=
SSE_MAX_CONNECTIONS_PER_USER=3
OBSIDIAN_ANALYTICS_TIMEZONE=Europe/Vilnius
OBSIDIAN_DAILY_REPORT_ENABLED=true
OBSIDIAN_DAILY_REPORT_HOUR=9
GEMINI_ENABLED=false
GEMINI_API_KEY=
```

`NOTIFICATION_DISCORD_CHANNEL_ID` is optional; when omitted, notification delivery uses `DISCORD_CHANNEL_ID` for backward compatibility. Notification rules are managed by an administrator on the **Notifications** dashboard page. Database schema changes in `database/migrations/` are applied automatically by the bot and site at startup.

## Notes

- Node.js `22.13.0+` is expected.
- Keep `data/` persistent for Minecraft auth/cache.
- The web dashboard reads the same root `.env`.
- Admin-only dashboard controls are hidden from non-admin users.
- Active notification problems remain deduplicated by event and resource key. Repeated observations increment the occurrence count, while channel delivery follows the configured cooldown. Recovery creates a separate resolved notification.
- Dashboard updates use authenticated Server-Sent Events with a slow polling fallback. The event protocol is documented in [`site/SSE_PROTOCOL.md`](site/SSE_PROTOCOL.md).
- Growing Child stores its learning database locally, preserves it across schema upgrades, and exposes memory/state controls only to administrators. Its learning and privacy model is documented in [`features/growingChild/README.md`](features/growingChild/README.md).

## Obsidian farm analytics

Analytics combines `obsidian_farm_daily`, `obsidian_farm_hourly`, TPS samples, mined totals, retired-pickaxe statistics, supply snapshots, and recorded farm annotations. The default reporting timezone is `Europe/Vilnius`; administrators can change it and the daily Discord report schedule on the Obsidian Farm page. Settings changes and production goals are written to the audit/system log.

Forecasts deliberately remain unavailable while confidence is `insufficient` (fewer than six completed hourly observations). Pickaxe exhaustion uses remaining durability and historical blocks per retired pickaxe. Food exhaustion needs at least six hours of supply-history coverage and ignores increases caused by refills. These are operational estimates, not guarantees. CSV data is available from `/api/obsidian/export.csv` to every authenticated dashboard user.
