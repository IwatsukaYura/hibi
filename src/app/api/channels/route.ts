import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServiceClient } from '@/lib/supabase';
import { rowToChannel, type ChannelRow } from '@/lib/db/rows';
import { getTodayJst } from '@/lib/date';
import { WARNING_DAYS } from '@/lib/channelUsage';
import type { ChannelWithUsage } from '@/models/channel';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const db = createServiceClient();

  //ユーザーのYoutube登録チャンネルを取得する
  const { data, error } = await db
    .from('channels')
    .select(
      'id, youtube_channel_id, title, thumbnail_url, is_selected, synced_at, selected_at',
    )
    .eq('user_id', userId)
    .order('title', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const channels = ((data ?? []) as ChannelRow[]).map(rowToChannel);

  const { data: sessions } = await db
    .from('watch_sessions')
    .select('youtube_video_id, watched_date')
    .eq('user_id', userId)
    .order('watched_date', { ascending: false });

  const videoIds = Array.from(
    new Set(
      (sessions ?? []).map(
        (s: { youtube_video_id: string }) => s.youtube_video_id,
      ),
    ),
  );

  const videoToChannel = new Map<string, string>();
  if (videoIds.length > 0) {
    const { data: videos } = await db
      .from('videos')
      .select('youtube_video_id, youtube_channel_id')
      .in('youtube_video_id', videoIds);

    for (const v of (videos ?? []) as Array<{
      youtube_video_id: string;
      youtube_channel_id: string;
    }>) {
      videoToChannel.set(v.youtube_video_id, v.youtube_channel_id);
    }
  }

  // sessions are sorted by watched_date DESC, so first hit per channel wins.
  const channelLastWatched = new Map<string, string>();
  for (const s of (sessions ?? []) as Array<{
    youtube_video_id: string;
    watched_date: string;
  }>) {
    const channelId = videoToChannel.get(s.youtube_video_id);
    if (!channelId) continue;
    if (!channelLastWatched.has(channelId)) {
      channelLastWatched.set(channelId, s.watched_date);
    }
  }

  const todayMs = Date.parse(`${getTodayJst()}T00:00:00+09:00`);
  const warningCutoffMs = Date.now() - WARNING_DAYS * DAY_MS;

  const enriched: ChannelWithUsage[] = channels.map((ch) => {
    const lastWatched = channelLastWatched.get(ch.youtubeChannelId) ?? null;

    const daysSinceLastWatched =
      lastWatched !== null
        ? Math.floor(
            (todayMs - Date.parse(`${lastWatched}T00:00:00+09:00`)) / DAY_MS,
          )
        : null;

    const honeymoonExpired =
      ch.selectedAt !== null && Date.parse(ch.selectedAt) < warningCutoffMs;
    const watchedRecently =
      daysSinceLastWatched !== null && daysSinceLastWatched < WARNING_DAYS;
    const needsAttention =
      ch.isSelected && honeymoonExpired && !watchedRecently;

    return {
      ...ch,
      daysSinceLastWatched,
      needsAttention,
    };
  });

  return NextResponse.json(enriched);
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as { selected: string[] };
  if (!Array.isArray(body.selected)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: allChannels } = await db
    .from('channels')
    .select('youtube_channel_id, is_selected')
    .eq('user_id', session.user.id);

  if (!allChannels) return NextResponse.json({ ok: true });

  const selectedSet = new Set(body.selected);
  const now = new Date().toISOString();

  const updates = allChannels.flatMap(
    (ch: { youtube_channel_id: string; is_selected: boolean }) => {
      const shouldSelect = selectedSet.has(ch.youtube_channel_id);
      if (shouldSelect === ch.is_selected) return [];

      const patch = shouldSelect
        ? { is_selected: true, selected_at: now }
        : { is_selected: false, selected_at: null };

      return [
        db
          .from('channels')
          .update(patch)
          .eq('user_id', session.user.id)
          .eq('youtube_channel_id', ch.youtube_channel_id),
      ];
    },
  );

  await Promise.all(updates);

  return NextResponse.json({ ok: true });
}
