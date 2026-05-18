export type Channel = {
  id: string;
  youtubeChannelId: string;
  title: string;
  thumbnailUrl: string | null;
  isSelected: boolean;
  syncedAt: string | null;
  selectedAt: string | null;
};

export type ChannelWithUsage = Channel & {
  daysSinceLastWatched: number | null;
  needsAttention: boolean;
};
