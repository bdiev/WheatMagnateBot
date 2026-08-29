# Browser push notifications

WheatMagnateBot uses the standard Service Worker Push API with VAPID authentication. Push is optional and remains disabled until a signed-in user presses **Enable on this device** and grants browser permission.

## Configuration

Generate one VAPID key pair:

```bash
npx web-push generate-vapid-keys
```

Configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and a valid `VAPID_SUBJECT` (`mailto:` or HTTPS URL) in the deployment environment. The private key is read only by the bot and site processes. It is never returned by an API, written to PostgreSQL, included in a push payload, or exposed to frontend code. Keep the same key pair across deployments; replacing it invalidates existing browser subscriptions.

If the VAPID pair is replaced, **Settings** now detects that the browser still uses the old public key and offers **Repair push on this device**. Repairing unsubscribes the stale browser endpoint and creates a new subscription with the current key. A test push should be sent after enabling or repairing a device.

The same repair action is offered when the browser still holds a local subscription that the server removed after a `404`/`410` response, or when the device has recorded delivery failures. Repair preserves that device's preferences, replaces the browser endpoint, and removes the stale server row.

## Delivery rules

Each subscription belongs to one `site_users` row and stores per-device preferences:

- enabled state;
- minimum active-event severity;
- selected event types (an empty list means all supported types);
- separate resolved-event opt-in;
- optional quiet hours using the account-wide timezone from **Settings → Account**.

Operational notifications are delivered only to approved administrators because the existing notification center is admin-only. An owned device can receive selectable previews from **Settings** for a generic push, critical alert, Detailed Whisper, Obsidian daily report, or player milestone. Preview payloads are clearly marked as tests and do not create real events or change delivery rules. `NotificationService` invokes push only when its existing deduplication and cooldown permit channel delivery, so suppressed repetitions do not generate push messages.

Incoming Minecraft whispers can be enabled with the `whisper_message` event type. They are routed only to subscriptions owned by the site username assigned to that whisper dialog and follow the device's quiet hours. Clicking one opens the Chat page and the matching private-message dialog; an already open PWA is focused, while a closed PWA is launched with the same deep link. If authentication has expired, the destination is retained and opened after login. Because a private message is not an operational alert, the minimum-severity filter does not suppress it; the event-type checkbox controls it directly. By default the visible lock-screen text is generic. If `Detailed` is explicitly enabled for `whisper_message`, the lock screen includes the Minecraft sender and message text, and platforms that support per-notification web icons receive the sender's cached Minecraft avatar. Compact mode keeps the Wheat icon so it does not reveal the sender's identity.

While the dashboard is open, the same authenticated realtime event displays a ten-second in-app toast for an incoming private message. The toast shows the sender but not the message body; clicking it switches to the relevant bot account and opens that player's dialog. Outgoing messages never create this toast.

The scheduled `daily_obsidian_report` event is emitted by the existing daily-report scheduler after its atomic per-calendar-day claim, so reconnects, overlapping timers, and multiple replicas cannot create repeated push reports. It follows each device's event selection and quiet hours but is not suppressed by the operational minimum-severity filter. Compact mode shows only the report title. Detailed mode adds the combined 24-hour mined total and hourly average across the primary and all managed bots, their aggregate pickaxe and food counts, and a per-bot estimate of how many days its usable pickaxes will last. The estimate uses the active session rate when enough session data exists, otherwise the bot's recent production rate, and its observed blocks per retired pickaxe with a 1,500-block fallback. Clicking the push opens **Obsidian Farm**.

The scheduled `player_milestone` event uses the same daily scheduler and calendar timezone. It is emitted at most once per day when one or more whitelisted players have a registration anniversary that day and can be delivered to devices owned by any approved site account. Multiple anniversaries are combined into one push. The event follows device selection and quiet hours, but not the operational minimum-severity filter. Compact mode keeps player names private; Detailed mode lists up to three player names and anniversary years. Clicking the push opens **Player Stats**.

Each device can also enable a **Minecraft time alert** and choose an in-game time in `HH:MM` format. The primary Mineflayer connection observes the server's absolute world clock and sends the push once when that time is crossed on each Minecraft day. Minecraft tick `0` is displayed as `06:00`, tick `6000` as `12:00`, tick `12000` as `18:00`, and tick `18000` as `00:00`. Reconnect baselines, backwards clock changes, frozen daylight cycles, and large `/time` jumps do not generate catch-up bursts. The alert is personal to the device, works for any approved site account, follows quiet hours, and is independent of operational severity and event-type filters.

Each selected event type also has an optional `Detailed` preference. It is disabled by default and stored per device. Detailed pushes may include allowlisted operational measurements such as TPS, food level, durability, distance, stall duration, or reconnect count. Arbitrary operational errors and coordinates are not copied to the lock screen. `whisper_message` is the explicit exception: its Detailed mode shows the sender and message text and should be enabled only on a trusted device.

Standard push payloads contain only a fixed generic event label and a dashboard link. Detailed mode adds the explicitly documented fields for that event; Detailed whispers include their sender and text. Expired endpoints returning HTTP 404 or 410 are removed automatically.

Browsers without Service Workers, Push API support, notification support, or a secure context continue to use the PWA normally without push.
