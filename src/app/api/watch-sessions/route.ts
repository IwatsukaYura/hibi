import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServiceClient } from "@/lib/supabase";
import { getTodayJst } from "@/lib/date";

const MAX_WATCHED_SECONDS = 12 * 60 * 60;

type WatchSessionInput = {
  youtubeVideoId: string;
  watchedSeconds: number;
};

function parseInput(body: unknown): WatchSessionInput | null {
  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;
  const videoId = obj.youtubeVideoId;
  const seconds = obj.watchedSeconds;

  if (typeof videoId !== "string" || videoId.length === 0) return null;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;

  const intSeconds = Math.floor(seconds);
  if (intSeconds < 1 || intSeconds > MAX_WATCHED_SECONDS) return null;

  return { youtubeVideoId: videoId, watchedSeconds: intSeconds };
}

export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const input = parseInput(raw);
  if (!input) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.from("watch_sessions").insert({
    user_id: userId,
    youtube_video_id: input.youtubeVideoId,
    watched_seconds: input.watchedSeconds,
    watched_date: getTodayJst(),
  });

  if (error) {
    return NextResponse.json({ error: "Failed to record" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
