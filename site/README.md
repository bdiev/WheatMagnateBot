# WheatMagnateBot Site

Локальная панель статистики для бота.

Public registration never creates an administrator. See [ADMIN_SETUP.md](ADMIN_SETUP.md) for the environment bootstrap, local CLI, and migration instructions.

## Запуск

```powershell
cd site
npm start
```

По умолчанию сайт откроется на `http://localhost:3080`.

Сервер читает централизованную конфигурацию из корневого `.env`. Для запуска обязательны `DATABASE_URL`, `SITE_PORT` и `SITE_PUBLIC_ORIGIN`. `SITE_ADMIN_USERNAME` и `SITE_ADMIN_PASSWORD` задаются только вместе для bootstrap администратора; полный список и диапазоны приведены в корневых `.env.example` и `README.md`.
