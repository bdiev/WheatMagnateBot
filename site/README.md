# WheatMagnateBot Site

Локальная панель статистики для бота.

Public registration never creates an administrator. See [ADMIN_SETUP.md](ADMIN_SETUP.md) for the environment bootstrap, local CLI, and migration instructions.

## Запуск

```powershell
cd site
npm start
```

По умолчанию сайт откроется на `http://localhost:3080`.

Сервер читает `DATABASE_URL` из корневого `.env`. Порт можно изменить через `SITE_PORT`.
