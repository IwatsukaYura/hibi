import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServiceClient } from "@/lib/supabase";
import { getTodayJst } from "@/lib/date";

const MAX_BASELINE_MINUTES = 24 * 60;

type PreferencesBody = {
  baselineMinutesPerDay: number | null;
};

function parseBody(raw: unknown): PreferencesBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = (raw as Record<string, unknown>).baselineMinutesPerDay;

  if (value === null) return { baselineMinutesPerDay: null };
  if (typeof value !== "number" || !Number.isFinite(value)) return null;

  const int = Math.floor(value);
  if (int < 0 || int > MAX_BASELINE_MINUTES) return null;

  return { baselineMinutesPerDay: int };
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createServiceClient();
  const { data } = await db
    .from("user_sessions")
    .select("baseline_minutes_per_day")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({
    baselineMinutesPerDay:
      (data?.baseline_minutes_per_day as number | null | undefined) ?? null,
  });
}

export async function PUT(request: Request) {
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

  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const db = createServiceClient();
  const { error } = await db.from("user_sessions").upsert(
    {
      user_id: userId,
      baseline_minutes_per_day: body.baselineMinutesPerDay,
      last_used_date: getTodayJst(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ baselineMinutesPerDay: body.baselineMinutesPerDay });
}
