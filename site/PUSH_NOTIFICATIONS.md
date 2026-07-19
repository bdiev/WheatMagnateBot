# Browser push notifications

WheatMagnateBot uses the standard Service Worker Push API with VAPID authentication. Push is optional and remains disabled until a signed-in user presses **Enable on this device** and grants browser permission.

## Configuration

Generate one VAPID key pair:

```bash
npx web-push generate-vapid-keys
```

Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a valid `VAPID_SUBJECT` (`mailto:` or HTTPS URL) in the deployment environment. The private key is read only by the bot and site processes. It is never returned by an API, written to PostgreSQL, included in a push payload, or exposed to frontend code. Keep the same key pair across deployments; replacing it invalidates existing browser subscriptions.

## Delivery rules

Each subscription belongs to one `site_users` row and stores per-device preferences:

- enabled state;
- minimum active-event severity;
- selected event types (an empty list means all supported types);
- separate resolved-event opt-in;
- timezone and optional quiet hours.

Operational notifications are delivered only to approved administrators because the existing notification center is admin-only. A test notification can be sent to an owned device from **Settings**. `NotificationService` invokes push only when its existing deduplication and cooldown permit channel delivery, so suppressed repetitions do not generate push messages.

Push payloads contain only a fixed generic event label and a dashboard link. Notification messages, metadata, player names, coordinates, commands, database errors, and other sensitive details are never placed on the lock screen. Expired endpoints returning HTTP 404 or 410 are removed automatically.

Browsers without Service Workers, Push API support, notification support, or a secure context continue to use the PWA normally without push.
