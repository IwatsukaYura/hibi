-- Track when a channel was marked is_selected = true.
-- Used by the "14日見ていないチャンネル" warning to skip channels
-- that were just enabled (honeymoon period).
-- Set to NOW() on false→true, reset to NULL on true→false.
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS selected_at timestamptz;

-- Backfill: existing is_selected=true rows start counting from today.
UPDATE channels
  SET selected_at = now()
  WHERE is_selected = true AND selected_at IS NULL;

-- Note: RLS intentionally not enabled (same policy as 001).
