import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createServiceClient } from '@/lib/supabase';
import { findSubscriptionId, deleteSubscription } from '@/lib/youtube';

// POST /api/channels/unsubscribe
// Body: { youtubeChannelId: string }
// Calls YouTube subscriptions.delete and removes the channel row from our DB.
// Requires the `youtube` OAuth scope (not just `youtube.readonly`); existing
// tokens issued before the scope expansion will get 403 here.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const body = raw as { youtubeChannelId?: unknown };
  if (
    typeof body.youtubeChannelId !== 'string' ||
    body.youtubeChannelId.length === 0
  ) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const channelId = body.youtubeChannelId;

  try {
    const subscriptionId = await findSubscriptionId(
      channelId,
      session.accessToken,
    );
    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'YouTube 上にこのチャンネルの購読が見つかりませんでした' },
        { status: 404 },
      );
    }
    await deleteSubscription(subscriptionId, session.accessToken);
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    // Tokens minted under the old `youtube.readonly` scope return 401/403 here.
    if (
      message.startsWith('YouTube API error 401') ||
      message.startsWith('YouTube API error 403')
    ) {
      return NextResponse.json(
        {
          error:
            'YouTube への権限が不足しています。一度ログアウトして再ログインしてください。',
        },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: message || 'YouTube API でエラーが発生しました' },
      { status: 502 },
    );
  }

  const db = createServiceClient();
  const { error: deleteError } = await db
    .from('channels')
    .delete()
    .eq('user_id', session.user.id)
    .eq('youtube_channel_id', channelId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
