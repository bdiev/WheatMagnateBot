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
