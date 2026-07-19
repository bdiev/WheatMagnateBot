# WheatMagnateBot SSE protocol

## Connection

The dashboard opens `GET /api/events` using the browser `EventSource` API. Authentication uses the existing `wm_session` HttpOnly cookie. The endpoint returns `401` without an approved session and `429` when the per-user connection limit is reached.

Successful responses use `Content-Type: text/event-stream`, disable proxy buffering, and begin with:

```text
retry: 3000
event: connected
data: {"ok":true}
```

The server sends an SSE comment heartbeat every 25 seconds by default:

```text
: heartbeat 1784450000000
```

Heartbeat comments do not trigger frontend events. Closed and aborted HTTP requests are removed immediately. One shared heartbeat timer serves every client.

## Events

| Event | Payload | Audience | Frontend action |
| --- | --- | --- | --- |
| `bot_status_updated` | `{ "observedAt": ISODate }` | Approved users | Refresh bot statistics |
| `player_joined` | `{ "username": string }` | Approved users | Refresh player/server state |
| `player_left` | `{ "username": string }` | Approved users | Refresh player/server state |
| `chat_message` | `{ "id": string, "createdAt": ISODate }` | Approved users | Refresh public chat |
| `whisper_message` | `{ "id", "playerUsername", "direction", "createdAt" }` | Only the matching site user | Refresh private-message state |
| `farm_status_updated` | `{ "updatedAt": ISODate }` | Approved users | Refresh obsidian farm statistics |
| `notification_created` | `{ "id": string }` | Administrators only | Refresh unread count and notification page |
| `admin_control_updated` | `{ "source", "updatedAt" }` | Administrators only | Refresh admin controls/logs |

Payloads are deliberately small. The browser obtains authorized state through the existing JSON endpoints after receiving an event. Administrative events are denied by the SSE hub even if a publisher omits an explicit role filter. Whisper events are routed by the session username.

## Reconnection and consistency

The browser uses native `EventSource` reconnection with a three-second server retry hint. While disconnected it displays a small reconnecting indicator and enables fallback polling every 15 seconds, with chat polling every 2 seconds. After reconnection it performs exactly one full synchronization, then keeps a 60-second consistency poll for graphs and missed events. While SSE is connected, a lightweight `/api/chat/version` marker is checked every 750 ms; the full chat endpoint is requested only when its latest message ID changes. This prevents a silent SSE stream from freezing chat without restoring the old heavy polling loop.

`EventSource` has no replay buffer in this implementation. The post-reconnect full synchronization is the recovery mechanism for events missed while offline.

## Configuration

```env
SSE_MAX_CONNECTIONS_PER_USER=3
SSE_HEARTBEAT_MS=25000
SSE_DATABASE_POLL_MS=250
```

Limits apply per site process and authenticated user ID. Database changes are detected every 250 ms by default using one shared marker query and broadcast through the single shared hub.
