import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServiceClient } from "@/lib/supabase";
import { computeStats, type StatsPeriod } from "@/lib/stats";

const VALID_PERIODS: ReadonlySet<StatsPeriod> = new Set([
  "today",
  "week",
  "month",
  "all",
]);

function parsePeriod(value: string | null): StatsPeriod {
  if (value && VALID_PERIODS.has(value as StatsPeriod)) {
    return value as StatsPeriod;
  }
  return "month";
}

export async function GET(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const period = parsePeriod(url.searchParams.get("period"));

  const db = createServiceClient();
  const stats = await computeStats(db, userId, period);

  return NextResponse.json(stats);
}
