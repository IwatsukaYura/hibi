"use client";

import { useEffect, useRef } from "react";
import { loadYouTubeIframeApi } from "@/lib/youtubeIframeApi";

type Props = {
  videoId: string;
  title: string;
  channelName: string;
  publishedAt: string;
  onClose: () => void;
};

const MIN_REPORTABLE_SECONDS = 1;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function reportWatched(videoId: string, seconds: number): Promise<void> {
  if (seconds < MIN_REPORTABLE_SECONDS) return;
  try {
    await fetch("/api/watch-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeVideoId: videoId, watchedSeconds: seconds }),
      keepalive: true,
    });
  } catch {
    // Tracking is best-effort; do not surface failures to the user.
  }
}

export default function VideoModal({ videoId, title, channelName, publishedAt, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const segmentStartRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef<number>(0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const mountNode = containerRef.current;
    if (!mountNode) return;

    const stopSegment = () => {
      if (segmentStartRef.current !== null) {
        accumulatedMsRef.current += Date.now() - segmentStartRef.current;
        segmentStartRef.current = null;
      }
    };

    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !window.YT?.Player) return;
        playerRef.current = new window.YT.Player(mountNode, {
          videoId,
          playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
          events: {
            onStateChange: (event) => {
              const state = event.data;
              if (state === window.YT?.PlayerState.PLAYING) {
                if (segmentStartRef.current === null) {
                  segmentStartRef.current = Date.now();
                }
              } else if (
                state === window.YT?.PlayerState.PAUSED ||
                state === window.YT?.PlayerState.ENDED ||
                state === window.YT?.PlayerState.BUFFERING
              ) {
                stopSegment();
              }
            },
          },
        });
      })
      .catch(() => {
        // If the API fails to load, the modal still closes cleanly.
      });

    return () => {
      cancelled = true;
      stopSegment();
      const totalSeconds = Math.round(accumulatedMsRef.current / 1000);
      void reportWatched(videoId, totalSeconds);
      playerRef.current?.destroy();
      playerRef.current = null;
      segmentStartRef.current = null;
      accumulatedMsRef.current = 0;
    };
  }, [videoId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          <div ref={containerRef} className="absolute inset-0 w-full h-full" />
        </div>
        <div className="p-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-gray-900 line-clamp-2">{title}</p>
            <p className="text-sm text-gray-500 mt-1">
              {channelName} · {formatDate(publishedAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors text-xl font-bold"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
