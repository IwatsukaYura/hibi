import type { YoutubeSubscription, YoutubeVideoMeta } from "@/models/youtube";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
// Reference width for the embed-aspect Shorts probe. Any value in [72, 8192]
// works; small values keep the API response compact. Aspect ratio is the
// signal we care about, not the absolute pixel size.
const EMBED_PROBE_WIDTH = 200;

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = Number(match[1] ?? 0);
  const m = Number(match[2] ?? 0);
  const s = Number(match[3] ?? 0);
  return h * 3600 + m * 60 + s;
}

async function youtubeGet(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<unknown> {
  const url = new URL(`${YOUTUBE_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${body}`);
  }

  return res.json();
}

async function youtubeDelete(
  path: string,
  params: Record<string, string>,
  accessToken: string
): Promise<void> {
  const url = new URL(`${YOUTUBE_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${body}`);
  }
}

// Find the user's subscription resource ID for a given channel.
// subscriptions.delete needs the subscription ID, not the channel ID.
export async function findSubscriptionId(
  channelId: string,
  accessToken: string
): Promise<string | null> {
  const data = (await youtubeGet(
    "/subscriptions",
    { part: "id", mine: "true", forChannelId: channelId },
    accessToken
  )) as { items?: Array<{ id: string }> };

  return data.items?.[0]?.id ?? null;
}

export async function deleteSubscription(
  subscriptionId: string,
  accessToken: string
): Promise<void> {
  await youtubeDelete("/subscriptions", { id: subscriptionId }, accessToken);
}

export async function fetchSubscriptions(accessToken: string): Promise<YoutubeSubscription[]> {
  const results: YoutubeSubscription[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      part: "snippet",
      mine: "true",
      maxResults: "50",
    };
    if (pageToken) params.pageToken = pageToken;

    const data = (await youtubeGet("/subscriptions", params, accessToken)) as {
      items?: Array<{
        snippet: {
          resourceId: { channelId: string };
          title: string;
          thumbnails: { default?: { url: string } };
        };
      }>;
      nextPageToken?: string;
    };

    for (const item of data.items ?? []) {
      results.push({
        channelId: item.snippet.resourceId.channelId,
        title: item.snippet.title,
        thumbnailUrl: item.snippet.thumbnails.default?.url ?? "",
      });
    }

    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
}

export async function fetchUploadsPlaylistId(
  channelId: string,
  accessToken: string
): Promise<string | null> {
  const data = (await youtubeGet(
    "/channels",
    { part: "contentDetails", id: channelId },
    accessToken
  )) as {
    items?: Array<{
      contentDetails: { relatedPlaylists: { uploads: string } };
    }>;
  };

  return data.items?.[0]?.contentDetails.relatedPlaylists.uploads ?? null;
}

export async function fetchRecentVideoIds(
  uploadsPlaylistId: string,
  accessToken: string,
  maxResults = 50
): Promise<Array<{ videoId: string; publishedAt: string }>> {
  const data = (await youtubeGet(
    "/playlistItems",
    {
      part: "contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(maxResults),
    },
    accessToken
  )) as {
    items?: Array<{
      contentDetails: { videoId: string; videoPublishedAt: string };
    }>;
  };

  return (data.items ?? []).map((item) => ({
    videoId: item.contentDetails.videoId,
    publishedAt: item.contentDetails.videoPublishedAt,
  }));
}

export async function fetchVideoMetas(
  videoIds: string[],
  accessToken: string
): Promise<YoutubeVideoMeta[]> {
  if (videoIds.length === 0) return [];

  const results: YoutubeVideoMeta[] = [];

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const data = (await youtubeGet(
      "/videos",
      {
        part: "snippet,contentDetails,player",
        id: batch.join(","),
        maxWidth: String(EMBED_PROBE_WIDTH),
      },
      accessToken
    )) as {
      items?: Array<{
        id: string;
        snippet: {
          channelId: string;
          title: string;
          publishedAt: string;
          thumbnails: { medium?: { url: string } };
        };
        contentDetails?: { duration?: string };
        player?: { embedWidth?: string | number; embedHeight?: string | number };
      }>;
    };

    type VideoItem = NonNullable<typeof data.items>[number];
    type ValidVideoItem = VideoItem & { contentDetails: { duration: string } };

    // Deleted / private / region-blocked / live videos may omit contentDetails.duration.
    // Skip them so downstream code can rely on a usable duration string.
    const items = (data.items ?? []).filter((item): item is ValidVideoItem => {
      if (typeof item.contentDetails?.duration !== "string") {
        console.warn(`[fetchVideoMetas] skip video without duration: ${item.id}`);
        return false;
      }
      return true;
    });

    for (const item of items) {
      const embedWidth = Number(item.player?.embedWidth ?? 0);
      const embedHeight = Number(item.player?.embedHeight ?? 0);
      // Shorts use a 9:16 player aspect, so the embed comes back taller than wide.
      // If the API omits player dimensions for any reason, fall back to false to
      // avoid over-filtering legitimate videos.
      const isShorts = embedWidth > 0 && embedHeight > embedWidth;

      results.push({
        videoId: item.id,
        channelId: item.snippet.channelId,
        title: item.snippet.title,
        thumbnailUrl: item.snippet.thumbnails.medium?.url ?? "",
        durationSeconds: parseDuration(item.contentDetails.duration),
        isShorts,
        publishedAt: item.snippet.publishedAt,
      });
    }
  }

  return results;
}
