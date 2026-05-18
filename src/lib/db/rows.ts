import type { Channel } from '@/models/channel';

export type ChannelRow = {
  id: string;
  youtube_channel_id: string;
  title: string;
  thumbnail_url: string | null;
  is_selected: boolean;
  synced_at: string | null;
  selected_at: string | null;
};

export function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    youtubeChannelId: row.youtube_channel_id,
    title: row.title,
    thumbnailUrl: row.thumbnail_url,
    isSelected: row.is_selected,
    syncedAt: row.synced_at,
    selectedAt: row.selected_at,
  };
}
