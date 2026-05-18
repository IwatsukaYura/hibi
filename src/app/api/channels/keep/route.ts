import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServiceClient } from '@/lib/supabase';

// POST /api/channels/keep
// Body: { youtubeChannelIds: string[] }
// Resets selected_at to NOW() for the given (currently selected) channels.
// Effect: the 14-day "haven't watched" warning counter restarts for them.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const body = raw as { youtubeChannelIds?: unknown };
  if (
    !Array.isArray(body.youtubeChannelIds) ||
    body.youtubeChannelIds.some((id) => typeof id !== 'string')
  ) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const ids = body.youtubeChannelIds as string[];
  if (ids.length === 0) return NextResponse.json({ ok: true });

  const db = createServiceClient();
  const { error } = await db
    .from('channels')
    .update({ selected_at: new Date().toISOString() })
    .eq('user_id', session.user.id)
    .eq('is_selected', true)
    .in('youtube_channel_id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
