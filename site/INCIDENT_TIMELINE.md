# Incident Timeline

The admin-only Incident Timeline provides one chronological view over `operational_events` and compatible adapters for existing system logs, notifications, bot commands, player activity, nearby sightings, farm annotations, bot status, and TPS samples. Existing source tables remain authoritative and are not deleted.

## Event model

Each normalized event contains `event_type`, `severity`, `source`, `title`, compact `details`, `actor`, `resource_key`, `correlation_id`, and `occurred_at`. `source_record_type` and `source_record_id` link back to an existing row. Details larger than 4 KiB are reduced to primitive summary fields; the original payload stays in its source table.

Legacy adapters assign stable correlation IDs such as `legacy-command-123`. New operations use UUID correlation IDs. Command completion/failure logs and resulting notifications keep the command correlation. Notification recovery keeps the correlation of the active problem.

## API

All endpoints require an approved administrator session. State-changing endpoints also require the normal Origin and CSRF checks.

- `GET /api/admin/operational-events` — accepts `period`, `from`, `to`, `severity`, `source`, `eventType`, `player`, `correlationId`, and `limit`.
- `GET /api/admin/operational-events/context?id=...` — selected event, ten minutes before/after, and correlated commands/notifications.
- `GET /api/admin/incidents` and `GET /api/admin/incidents/:id` — incident list/detail.
- `POST /api/admin/incidents` with `{ "eventId": "..." }` — creates an incident from an event.
- `PUT /api/admin/incidents/:id` — updates status, cause, notes, resolution, and assigned administrator.
- `GET /api/admin/incidents/:id/export?format=json|markdown` — exports the complete incident context.

The SSE event `operational_event_created` tells connected administrator dashboards to refresh the timeline. Its payload is intentionally small and never contains sensitive event details.

## Retention

`OPERATIONAL_EVENT_RETENTION_DAYS` defaults to 90 days and has a minimum of seven days. Once per day, up to 5,000 expired normalized events are moved to `operational_events_archive`. Events linked to incidents remain active. Archived records remain searchable and can be restored automatically when selected as a new incident root.
