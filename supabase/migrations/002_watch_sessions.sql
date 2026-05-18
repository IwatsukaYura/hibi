-- Add user preference for baseline (pre-app) daily YouTube minutes.
-- NULL means "not configured yet" so the UI can prompt for initial setup.
ALTER TABLE user_sessions
  ADD COLUMN IF NOT EXISTS baseline_minutes_per_day integer;

-- watch_sessions: one row per play/pause segment.
-- Aggregation (daily/weekly/monthly) is done in API routes with SUM(watched_seconds).
-- watched_date is the JST calendar date computed on the server before insert.
CREATE TABLE IF NOT EXISTS watch_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  youtube_video_id text NOT NULL,
  watched_seconds integer NOT NULL CHECK (watched_seconds > 0),
  watched_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_watch_sessions_user_date
  ON watch_sessions(user_id, watched_date DESC);

-- Note: RLS intentionally not enabled (same policy as 001).
