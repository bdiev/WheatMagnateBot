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
SITE_ADMIN_USERNAME=
SITE_ADMIN_PASSWORD=
ADMIN_BOOTSTRAP_TOKEN=
SITE_TRUST_PROXY=false
SITE_ALLOWED_ORIGINS=http://localhost:3080
NOTIFICATION_DISCORD_CHANNEL_ID=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@example.com
SSE_MAX_CONNECTIONS_PER_USER=3
OPERATIONAL_EVENT_RETENTION_DAYS=90
OBSIDIAN_ANALYTICS_TIMEZONE=Europe/Vilnius
OBSIDIAN_DAILY_REPORT_ENABLED=true
OBSIDIAN_DAILY_REPORT_HOUR=9
GEMINI_ENABLED=false
GEMINI_API_KEY=
```

`NOTIFICATION_DISCORD_CHANNEL_ID` is optional; when omitted, notification delivery uses `DISCORD_CHANNEL_ID` for backward compatibility. Notification rules are managed by an administrator on the **Notifications** dashboard page. Database schema changes in `database/migrations/` are applied automatically by the bot and site at startup.

Browser push is optional and disabled by default. Generate a persistent VAPID pair with `npx web-push generate-vapid-keys`, store both keys in the deployment environment, and never commit the private key. Users enable permission explicitly from **Settings**, then configure each device's severity, event types, resolved events, and quiet hours. Operational delivery remains admin-only to match the notification center's access policy; `whisper_message` push is routed personally to the site user assigned to the dialog and never exposes its sender or text on the lock screen. The complete behavior and privacy model are documented in [`site/PUSH_NOTIFICATIONS.md`](site/PUSH_NOTIFICATIONS.md).

### Dashboard security and initial administrator

There is no username-based administrator account. For the first deployment, use exactly one bootstrap method:

- Set both `SITE_ADMIN_USERNAME` and `SITE_ADMIN_PASSWORD` (minimum 12 characters). The account is created once at startup only when no approved administrator exists.
- Or set a strong random `ADMIN_BOOTSTRAP_TOKEN`, open the dashboard, choose **Bootstrap administrator**, and enter the desired username, password, and token. A successful bootstrap is recorded in PostgreSQL and the token cannot be reused.

Remove bootstrap secrets from the deployment environment after the administrator exists. Existing administrators are preserved during migration, and the dashboard prevents removing the final approved administrator.

Set `SITE_ALLOWED_ORIGINS` to the comma-separated public origins that may submit state-changing requests, for example `https://dashboard.example.com` (origins only, without paths). The default shown above is for local HTTP development. Coolify's exact `COOLIFY_URL` is included automatically, preventing its external HTTPS origin from being confused with the internal HTTP connection. For Coolify, also set `SITE_TRUST_PROXY=true`; more generally, enable it only when the application is directly behind a trusted reverse proxy that overwrites `X-Forwarded-For`, `X-Forwarded-Host`, and `X-Forwarded-Proto`. This enables correct client-IP accounting and `Secure` session cookies for proxy-terminated HTTPS. Never expose the Node port directly while this option is enabled.

The dashboard uses `HttpOnly`, `SameSite=Lax` session cookies, per-session CSRF tokens, strict Origin/Host checks, bounded in-memory rate limits, authenticated SSE, restrictive response headers, and traversal-safe static file resolution. Rate-limit state is process-local, so multi-instance deployments should add a shared limiter at the reverse proxy.

## Notes

- Node.js `22.13.0+` is expected.
- Keep `data/` persistent for Minecraft auth/cache.
- The web dashboard reads the same root `.env`.
- Admin-only dashboard controls are hidden from non-admin users.
- Active notification problems remain deduplicated by event and resource key. Repeated observations increment the occurrence count, while channel delivery follows the configured cooldown. Recovery creates a separate resolved notification.
- Dashboard updates use authenticated Server-Sent Events with a slow polling fallback. The event protocol is documented in [`site/SSE_PROTOCOL.md`](site/SSE_PROTOCOL.md).
- The admin-only **Incident Timeline** aggregates operational events from system logs, notifications, bot commands, player transitions, nearby sightings, farm annotations, bot status and TPS. Events sharing one operation use a correlation ID; an event can be promoted to an incident with a ±10 minute context, ownership, cause, notes, resolution, and JSON/Markdown export. The model and API are documented in [`site/INCIDENT_TIMELINE.md`](site/INCIDENT_TIMELINE.md).
- Normalized operational events older than `OPERATIONAL_EVENT_RETENTION_DAYS` (90 by default) are moved to `operational_events_archive` in bounded daily batches. Events linked to incidents are retained in the active table. Existing source logs are not removed, and legacy records remain visible through compatibility adapters.
- Growing Child stores its learning database locally, preserves it across schema upgrades, and exposes memory/state controls only to administrators. Its learning and privacy model is documented in [`features/growingChild/README.md`](features/growingChild/README.md).

## Obsidian farm analytics

Analytics combines `obsidian_farm_daily`, `obsidian_farm_hourly`, TPS samples, mined totals, retired-pickaxe statistics, supply snapshots, and recorded farm annotations. The default reporting timezone is `Europe/Vilnius`; administrators can change it and the daily Discord report schedule on the Obsidian Farm page. The report is sent once per local calendar day in a direct message to `DISCORD_OWNER_ID`; it is never posted to a server channel. Settings changes and production goals are written to the audit/system log.

Forecasts deliberately remain unavailable while confidence is `insufficient` (fewer than six completed hourly observations). Pickaxe exhaustion uses remaining durability and historical blocks per retired pickaxe. Food exhaustion needs at least six hours of supply-history coverage and ignores increases caused by refills. These are operational estimates, not guarantees. CSV data is available from `/api/obsidian/export.csv` to every authenticated dashboard user.
