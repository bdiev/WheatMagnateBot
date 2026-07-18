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

Copy `.env.example` to `.env` in the project root and replace every blank required value. Configuration is parsed and validated by `config/index.js` before a Discord or Minecraft connection is created. Invalid configuration terminates the process with a list of variable names and validation errors; secret values are never included.

Required for the main bot:

```env
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_CHAT_CHANNEL_ID=
DISCORD_DM_CATEGORY_ID=
DISCORD_OWNER_ID=
DATABASE_URL=
MINECRAFT_HOST=
MINECRAFT_PORT=25565
MINECRAFT_USERNAME=WheatMagnate
MINECRAFT_ADMIN_USERNAME=ServerAdmin
MINECRAFT_COMMAND_BOT_USERNAME=CommandBot
MINECRAFT_AUTH=microsoft
DEFAULT_SITE_WHISPER_USERNAME=WheatMagnate
FARM_TARGET_X=0
FARM_TARGET_Y=64
FARM_TARGET_Z=0
FARM_CAULDRON_RADIUS=5
```

Required for the dashboard process:

```env
DATABASE_URL=
SITE_PORT=3080
SITE_PUBLIC_ORIGIN=https://panel.example.org
```

`SITE_ADMIN_USERNAME` and `SITE_ADMIN_PASSWORD` are an optional bootstrap pair: set both to create or refresh the administrator, or omit both after bootstrap. The local admin CLI instead requires `SITE_ADMIN_USERNAME` and the temporary `SITE_ADMIN_CLI_PASSWORD`.

`MINECRAFT_PORT` and `SITE_PORT` must be in `1..65535`. Minecraft coordinates must be integers (`X/Z`: `-30000000..30000000`, `Y`: `-2048..2048`), and the cauldron radius must be `4`, `5`, or `6`. Discord IDs must contain 17–20 digits. Boolean values accept only `true` or `false`.

Operational timeouts, message limits, web rate limits, cookie lifetime, Gemini models, runtime switches, and farm update intervals are also listed in [.env.example](.env.example). Durations whose names end in `_MS` are milliseconds; web security durations ending in `_SECONDS` are seconds.

When HTTPS is terminated by a reverse proxy, set `SITE_PUBLIC_ORIGIN` to the exact browser-visible origin. Enable `SITE_TRUST_PROXY=true` only when the Node process is reachable exclusively through that trusted proxy.

`MINECRAFT_SESSION`, `DISCORD_BOT_TOKEN`, `DATABASE_URL`, `GEMINI_API_KEY`, and administrator passwords are secrets. Do not commit `.env`; known secret values are redacted from bot console/database log capture.

## Notes

- Node.js `22.13.0+` is expected.
- Keep `data/` persistent for Minecraft auth/cache.
- The web dashboard reads the same root `.env`.
- Admin-only dashboard controls are hidden from non-admin users.
- Public registration always creates a pending user. Follow [site/ADMIN_SETUP.md](site/ADMIN_SETUP.md) to create the first administrator securely.

## Docker deployment

Docker uses digest-pinned Node.js 22.23.1 images for the bot and dashboard, plus digest-pinned PostgreSQL 16. The application images run as the unprivileged `node` user. `.env` is excluded by `.dockerignore` and is supplied only by Compose at runtime. Dependency installation is reproducible through the committed npm lockfiles.

Before production startup, copy `.env.example` to `.env`, fill the required bot/site values, and replace `POSTGRES_PASSWORD`. Compose normally builds the internal connection URL from the PostgreSQL variables. If the password contains URL-reserved characters, keep the raw password in `POSTGRES_PASSWORD` and set `DATABASE_URL_DOCKER` separately with its password component percent-encoded and hostname `postgres`.

Build and start:

```sh
docker compose up --build -d
docker compose ps
```

Stop without deleting named volumes:

```sh
docker compose down
```

View logs:

```sh
docker compose logs -f --tail=200
docker compose logs -f bot
docker compose logs -f site
```

Update images and containers:

```sh
docker compose pull postgres
docker compose build --pull
docker compose up -d --remove-orphans
```

Create a PostgreSQL backup:

```sh
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > wheatmagnate.dump
```

Archive the bot runtime state and Minecraft authentication cache:

```sh
mkdir -p backups
docker compose run --rm --no-deps --user 0:0 --entrypoint tar -v ./backups:/backup bot -czf /backup/bot-runtime.tgz -C /app/runtime-data .
docker compose run --rm --no-deps --user 0:0 --entrypoint tar -v ./backups:/backup bot -czf /backup/minecraft-auth-cache.tgz -C /app/data/auth-cache .
```

Restore a backup (this replaces matching database objects):

```sh
docker compose stop bot site
docker compose cp wheatmagnate.dump postgres:/tmp/wheatmagnate.dump
docker compose exec -T postgres sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/wheatmagnate.dump'
docker compose exec -T postgres rm -f /tmp/wheatmagnate.dump
docker compose start bot site
```

Restore bot runtime/auth files after stopping the bot. Extraction overwrites matching files; use archives from a trusted deployment only:

```sh
docker compose stop bot
docker compose run --rm --no-deps --user 0:0 --entrypoint tar -v ./backups:/backup bot -xzf /backup/bot-runtime.tgz -C /app/runtime-data
docker compose run --rm --no-deps --user 0:0 --entrypoint tar -v ./backups:/backup bot -xzf /backup/minecraft-auth-cache.tgz -C /app/data/auth-cache
docker compose start bot
```

The named volumes are `postgres_data`, `minecraft_auth_cache`, and `bot_runtime`. `docker compose down` preserves them. Do not use `docker compose down -v` unless permanent deletion of the database, Microsoft authentication cache, and bot runtime state is intended.

### Safe deployment smoke test

The test override starts the real PostgreSQL and dashboard containers, but runs the bot in a lightweight health-only mode that does not import Discord/Mineflayer or open PostgreSQL, Discord, or Minecraft connections:

```sh
docker compose -f docker-compose.yml -f docker-compose.test.yml up --build -d
docker compose -f docker-compose.yml -f docker-compose.test.yml ps
docker compose -f docker-compose.yml -f docker-compose.test.yml logs --tail=100 bot site postgres
docker compose -f docker-compose.yml -f docker-compose.test.yml down
```

In production keep `BOT_TEST_MODE=false`. Container healthchecks cover PostgreSQL readiness, `/api/health` for the dashboard, and the bot liveness endpoint on `BOT_HEALTH_PORT`.

## Continuous integration

GitHub Actions runs on Node.js 22 with a PostgreSQL 16 service container. The workflow installs the root and site lockfiles independently, checks JavaScript syntax, runs root and site tests separately, applies the PostgreSQL migration twice in an isolated schema, checks tracked-file policy, and scans tracked text files for common secret formats. Bot test mode is enabled, so CI does not connect to Discord or Minecraft and no external credentials are configured.

Dependency audits fail for `high` and `critical` findings. Known `moderate` findings in the Mineflayer/Prismarine dependency tree remain visible in the audit output without blocking CI. Dependabot checks both the root package and `site/` weekly.
