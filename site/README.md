# WheatMagnateBot Site

Локальная панель статистики для бота.

## Запуск

```powershell
cd site
npm start
```

По умолчанию сайт откроется на `http://localhost:3080`.

Сервер читает `DATABASE_URL` из корневого `.env`. Порт можно изменить через `SITE_PORT`.

Real-time обновления работают через авторизованный endpoint `GET /api/events`. Формат событий, правила доступа, heartbeat и fallback описаны в [`SSE_PROTOCOL.md`](SSE_PROTOCOL.md).

## Public player pages

`/player/<MinecraftName>` opens a full player profile without login. It reuses the dashboard profile, including sessions, activity, name/skin history, signs and visible chat, and refreshes every 30 seconds while the tab is visible. Unknown tracked players return a profile not-found error. Admin metadata and control actions require login.

Set `SITE_PUBLIC_URL` on the bot to the public website origin (default `https://bdiev.org`). New Discord chat embeds and flood summaries link to these pages; existing Discord messages keep their original links. Public read APIs are limited to `/api/public/player`, `/api/public/player-skins`, `/api/public/player-signs`, avatars and skin/cape textures. Other dashboard APIs still require authentication.
