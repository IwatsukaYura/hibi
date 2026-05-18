import type { SupabaseClient } from "@supabase/supabase-js";
import { getTodayJst, getJstDateNDaysAgo } from "@/lib/date";

export type StatsPeriod = "today" | "week" | "month" | "all";

export type StatsResponse = {
  period: StatsPeriod;
  rangeStart: string;
  rangeEnd: string;
  daysInRange: number;
  baselineMinutesPerDay: number | null;
  totalWatchedSeconds: number;
  totalBaselineSeconds: number;
  savedSeconds: number;
  dailyBuckets: Array<{ date: string; watchedSeconds: number }>;
  objectiveMetrics: {
    pickedVideoCount: number;
    watchedPickCount: number;
    skippedPickSeconds: number;
  };
};

const EARLIEST_DATE = "1970-01-01";

function resolveRange(period: StatsPeriod): {
  rangeStart: string;
  rangeEnd: string;
  daysInRange: number;
} {
  const rangeEnd = getTodayJst();
  if (period === "today") {
    return { rangeStart: rangeEnd, rangeEnd, daysInRange: 1 };
  }
  if (period === "week") {
    return { rangeStart: getJstDateNDaysAgo(6), rangeEnd, daysInRange: 7 };
  }
  if (period === "month") {
    return { rangeStart: getJstDateNDaysAgo(29), rangeEnd, daysInRange: 30 };
  }
  return { rangeStart: EARLIEST_DATE, rangeEnd, daysInRange: 0 };
}

function buildDailyBuckets(
  rangeStart: string,
  rangeEnd: string,
  rows: Array<{ watched_date: string; watched_seconds: number }>,
): Array<{ date: string; watchedSeconds: number }> {
  const byDate = new Map<string, number>();
  for (const r of rows) {
    byDate.set(r.watched_date, (byDate.get(r.watched_date) ?? 0) + r.watched_seconds);
  }

  if (rangeStart === EARLIEST_DATE) {
    return Array.from(byDate.entries())
      .map(([date, watchedSeconds]) => ({ date, watchedSeconds }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  const buckets: Array<{ date: string; watchedSeconds: number }> = [];
  const start = new Date(`${rangeStart}T00:00:00Z`);
  const end = new Date(`${rangeEnd}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    buckets.push({ date, watchedSeconds: byDate.get(date) ?? 0 });
  }
  return buckets;
}

export async function computeStats(
  db: SupabaseClient,
  userId: string,
  period: StatsPeriod,
): Promise<StatsResponse> {
  const { rangeStart, rangeEnd, daysInRange } = resolveRange(period);

  const [sessionRes, watchRes, pickRes] = await Promise.all([
    db
      .from("user_sessions")
      .select("baseline_minutes_per_day")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("watch_sessions")
      .select("watched_date, watched_seconds, youtube_video_id")
      .eq("user_id", userId)
      .gte("watched_date", rangeStart)
      .lte("watched_date", rangeEnd),
    db
      .from("daily_picks")
      .select("youtube_video_id, pick_date")
      .eq("user_id", userId)
      .gte("pick_date", rangeStart)
      .lte("pick_date", rangeEnd),
  ]);

  const baselineMinutesPerDay =
    (sessionRes.data?.baseline_minutes_per_day as number | null | undefined) ?? null;

  const watchRows: Array<{
    watched_date: string;
    watched_seconds: number;
    youtube_video_id: string;
  }> = watchRes.data ?? [];

  const pickRows: Array<{ youtube_video_id: string; pick_date: string }> = pickRes.data ?? [];

  const totalWatchedSeconds = watchRows.reduce((sum, r) => sum + r.watched_seconds, 0);

  const effectiveDays =
    period === "all"
      ? Math.max(
          1,
          new Set([
            ...watchRows.map((r) => r.watched_date),
            ...pickRows.map((p) => p.pick_date),
          ]).size,
        )
      : daysInRange;

  const totalBaselineSeconds =
    baselineMinutesPerDay !== null ? baselineMinutesPerDay * 60 * effectiveDays : 0;

  const savedSeconds = Math.max(0, totalBaselineSeconds - totalWatchedSeconds);

  const watchedVideoIds = new Set(watchRows.map((r) => r.youtube_video_id));
  const pickedVideoIds = pickRows.map((p) => p.youtube_video_id);
  const uniquePickedIds = Array.from(new Set(pickedVideoIds));
  const skippedPickIds = uniquePickedIds.filter((id) => !watchedVideoIds.has(id));

  let skippedPickSeconds = 0;
  if (skippedPickIds.length > 0) {
    const { data: skippedVideos } = await db
      .from("videos")
      .select("youtube_video_id, duration_seconds")
      .in("youtube_video_id", skippedPickIds);
    skippedPickSeconds = (skippedVideos ?? []).reduce(
      (sum, v: { duration_seconds: number }) => sum + v.duration_seconds,
      0,
    );
  }

  const watchedPickCount = uniquePickedIds.filter((id) => watchedVideoIds.has(id)).length;

  return {
    period,
    rangeStart,
    rangeEnd,
    daysInRange: period === "all" ? effectiveDays : daysInRange,
    baselineMinutesPerDay,
    totalWatchedSeconds,
    totalBaselineSeconds,
    savedSeconds,
    dailyBuckets: buildDailyBuckets(rangeStart, rangeEnd, watchRows),
    objectiveMetrics: {
      pickedVideoCount: uniquePickedIds.length,
      watchedPickCount,
      skippedPickSeconds,
    },
  };
}
