-- Rebuild the last 30 days of daily playtime from recorded join/leave events,
-- so the 7-day and 30-day leaderboards are meaningful right away instead of
-- starting empty. Only whole UTC days before live daily tracking began are
-- filled; the live checkpoints own that first day and everything after it.
-- Only a join closed by a leave counts, plus the still-open session of a
-- player who is online now: a join followed by another join has no known end
-- and is skipped rather than stretched over a gap.
WITH bounds AS (
  SELECT
    cutoff_day,
    (cutoff_day::timestamp AT TIME ZONE 'UTC') AS cutoff_at,
    ((cutoff_day - 30)::timestamp AT TIME ZONE 'UTC') AS window_start
  FROM (
    SELECT COALESCE(MIN(day), (NOW() AT TIME ZONE 'UTC')::date) AS cutoff_day
    FROM player_playtime_daily
  ) first_tracked
), ordered_events AS (
  SELECT
    LOWER(username) AS username_key,
    event_type,
    occurred_at,
    LEAD(event_type) OVER player_events AS next_event_type,
    LEAD(occurred_at) OVER player_events AS next_occurred_at
  FROM player_session_events
  WHERE LOWER(username) <> ''
  WINDOW player_events AS (PARTITION BY LOWER(username) ORDER BY occurred_at, id)
), online_now AS (
  SELECT LOWER(username) AS username_key
  FROM player_activity
  WHERE is_online = TRUE
  GROUP BY LOWER(username)
), sessions AS (
  SELECT
    event.username_key,
    GREATEST(event.occurred_at, bounds.window_start) AS started_at,
    -- No branch matches (NULL) for a session without a known end; LEAST would
    -- silently turn that NULL into the cutoff, so it is applied per branch.
    CASE
      WHEN event.next_event_type = 'player_left' THEN LEAST(event.next_occurred_at, bounds.cutoff_at)
      WHEN event.next_event_type IS NULL AND online_now.username_key IS NOT NULL THEN bounds.cutoff_at
    END AS ended_at
  FROM ordered_events event
  CROSS JOIN bounds
  LEFT JOIN online_now USING (username_key)
  WHERE event.event_type = 'player_joined'
), identities AS (
  -- Daily rows use the same key as the live tracker: the playtime row's UUID
  -- when it has one, otherwise its lower-case name. Old nicknames resolve
  -- through the name history to the current UUID-owned row.
  SELECT DISTINCT ON (names.username_key)
    names.username_key,
    COALESCE(pt.player_uuid::text, LOWER(pt.username), names.username_key) AS identity_key
  FROM (SELECT DISTINCT username_key FROM sessions) names
  LEFT JOIN player_name_history history ON LOWER(history.username) = names.username_key
  LEFT JOIN player_playtime pt
    ON (history.player_uuid IS NOT NULL AND pt.player_uuid = history.player_uuid)
    OR LOWER(pt.username) = names.username_key
  ORDER BY names.username_key, (pt.player_uuid IS NOT NULL) DESC
), day_slices AS (
  SELECT
    identities.identity_key,
    slice_day::date AS day,
    EXTRACT(EPOCH FROM (
      LEAST(sessions.ended_at, (slice_day + INTERVAL '1 day') AT TIME ZONE 'UTC')
      - GREATEST(sessions.started_at, slice_day AT TIME ZONE 'UTC')
    )) AS seconds
  FROM sessions
  JOIN identities USING (username_key)
  CROSS JOIN LATERAL generate_series(
    date_trunc('day', sessions.started_at AT TIME ZONE 'UTC'),
    date_trunc('day', sessions.ended_at AT TIME ZONE 'UTC'),
    INTERVAL '1 day'
  ) AS slice_day
  WHERE sessions.ended_at > sessions.started_at
)
INSERT INTO player_playtime_daily (identity_key, day, seconds)
SELECT identity_key, day, FLOOR(SUM(seconds))::bigint
FROM day_slices
CROSS JOIN bounds
WHERE seconds > 0
  AND day < bounds.cutoff_day
GROUP BY identity_key, day
HAVING FLOOR(SUM(seconds)) > 0
ON CONFLICT (identity_key, day) DO NOTHING;
