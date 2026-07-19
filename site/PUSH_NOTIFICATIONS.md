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
- optional quiet hours using the account-wide timezone from **Settings → Account**.

Operational notifications are delivered only to approved administrators because the existing notification center is admin-only. A test notification can be sent to an owned device from **Settings**. `NotificationService` invokes push only when its existing deduplication and cooldown permit channel delivery, so suppressed repetitions do not generate push messages.

Incoming Minecraft whispers can be enabled with the `whisper_message` event type. They are routed only to subscriptions owned by the site username assigned to that whisper dialog, follow the device's quiet hours, and open the private-message panel. Because a private message is not an operational alert, the minimum-severity filter does not suppress it; the event-type checkbox controls it directly. By default the lock-screen payload is generic. If `Detailed` is explicitly enabled for `whisper_message`, the lock screen includes the Minecraft sender and message text.

Each selected event type also has an optional `Detailed` preference. It is disabled by default and stored per device. Detailed pushes may include allowlisted operational measurements such as TPS, food level, durability, distance, stall duration, or reconnect count. Arbitrary operational errors and coordinates are not copied to the lock screen. `whisper_message` is the explicit exception: its Detailed mode shows the sender and message text and should be enabled only on a trusted device.

Standard push payloads contain only a fixed generic event label and a dashboard link. Detailed mode adds the explicitly documented fields for that event; Detailed whispers include their sender and text. Expired endpoints returning HTTP 404 or 410 are removed automatically.

Browsers without Service Workers, Push API support, notification support, or a secure context continue to use the PWA normally without push.
