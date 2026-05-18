'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { ChannelWithUsage } from '@/models/channel';
import { WARNING_DAYS } from '@/lib/channelUsage';

function lastWatchedLabel(daysSinceLastWatched: number | null): string {
  if (daysSinceLastWatched === null) return '未視聴';
  if (daysSinceLastWatched === 0) return '今日視聴';
  return `${daysSinceLastWatched}日前に視聴`;
}

async function fetchChannelsApi(): Promise<ChannelWithUsage[]> {
  const res = await fetch('/api/channels');
  if (!res.ok) throw new Error('チャンネルの取得に失敗しました');
  return res.json();
}

function selectedIdsFrom(data: ChannelWithUsage[]): Set<string> {
  return new Set(data.filter((c) => c.isSelected).map((c) => c.youtubeChannelId));
}

export default function ChannelsPage() {
  const [channels, setChannels] = useState<ChannelWithUsage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [openMenuChannelId, setOpenMenuChannelId] = useState<string | null>(
    null,
  );

  // 初回ロードはここで実施 (再利用しない / async 関数を内側で定義)
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await fetchChannelsApi();
        setChannels(data);
        setSelected(selectedIdsFrom(data));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'エラーが発生しました');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const attentionChannels = channels.filter((c) => c.needsAttention);

  // 各ハンドラから呼ぶ用の再読み込み (effect ではないので setState を直接含めて OK)
  const reloadAndMaybeCloseModal = async (): Promise<ChannelWithUsage[]> => {
    const data = await fetchChannelsApi();
    setChannels(data);
    setSelected(selectedIdsFrom(data));
    if (data.filter((c) => c.needsAttention).length === 0) {
      setIsReviewOpen(false);
    }
    return data;
  };

  const syncChannels = async () => {
    setIsSyncing(true);
    setError(null);
    try {
      const res = await fetch('/api/channels/sync', { method: 'POST' });
      if (!res.ok) throw new Error('同期に失敗しました');
      await reloadAndMaybeCloseModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : '同期エラーが発生しました');
    } finally {
      setIsSyncing(false);
    }
  };

  const saveSelection = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected: Array.from(selected) }),
      });
      if (!res.ok) throw new Error('保存に失敗しました');
      await reloadAndMaybeCloseModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存エラーが発生しました');
    } finally {
      setIsSaving(false);
    }
  };

  const toggle = (channelId: string) => {
    //previous stateに基づいて次のstateを計算
    //関数型を利用するのは、selectedが最新の状態で更新されることを保証するため
    setSelected((prev) => {
      //新しいSetを作成して変更を加える（イミュタブルな更新）
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  // モーダルの「そのまま続ける」: selected_at を now() にリセットして 14 日カウントを再スタート
  const handleKeep = async (channelId: string) => {
    setProcessingId(channelId);
    setError(null);
    try {
      const res = await fetch('/api/channels/keep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeChannelIds: [channelId] }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      await reloadAndMaybeCloseModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setProcessingId(null);
    }
  };

  // モーダルの「Hibi で表示を止める」: チェックを外して即座に保存
  const handleUncheckFromModal = async (channelId: string) => {
    setProcessingId(channelId);
    setError(null);
    const next = new Set(selected);
    next.delete(channelId);
    try {
      const res = await fetch('/api/channels', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected: Array.from(next) }),
      });
      if (!res.ok) throw new Error('更新に失敗しました');
      await reloadAndMaybeCloseModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setProcessingId(null);
    }
  };

  // モーダルの「YouTube から購読解除」: YouTube 本体の購読を解除し、DB の行も削除
  const handleUnsubscribe = async (
    channelId: string,
    channelTitle: string,
  ) => {
    const ok = window.confirm(
      `「${channelTitle}」の YouTube 購読を解除します。\nYouTube 側からも消え、元に戻すには手動で再購読が必要です。よろしいですか?`,
    );
    if (!ok) return;

    setProcessingId(channelId);
    setError(null);
    try {
      const res = await fetch('/api/channels/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeChannelId: channelId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? '購読解除に失敗しました');
      }
      await reloadAndMaybeCloseModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました');
    } finally {
      setProcessingId(null);
    }
  };

  const filteredChannels = channels.filter((c) =>
    c.title.toLowerCase().includes(query.toLowerCase()),
  );

  //以下はUI表示ロジック
  let channelListContent;
  if (isLoading) {
    channelListContent = (
      <div className="py-12 text-center text-sm text-gray-400">
        読み込み中...
      </div>
    );
  } else if (filteredChannels.length === 0) {
    channelListContent = (
      <div className="py-12 text-center text-sm text-gray-400">
        {channels.length === 0
          ? 'チャンネルがありません。「チャンネルを同期」を押してください'
          : '該当するチャンネルがありません'}
      </div>
    );
  } else {
    channelListContent = filteredChannels.map((channel) => {
      const isMenuOpen = openMenuChannelId === channel.youtubeChannelId;
      const isBusy = processingId === channel.youtubeChannelId;
      return (
        <div
          key={channel.youtubeChannelId}
          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50"
        >
          <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.has(channel.youtubeChannelId)}
              onChange={() => toggle(channel.youtubeChannelId)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            {channel.thumbnailUrl && (
              <Image
                src={channel.thumbnailUrl}
                alt={channel.title}
                width={32}
                height={32}
                className="rounded-full flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-900 truncate">
                  {channel.title}
                </span>
                {channel.needsAttention && (
                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex-shrink-0">
                    {WARNING_DAYS}日視聴なし
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {lastWatchedLabel(channel.daysSinceLastWatched)}
              </p>
            </div>
          </label>
          <div className="relative flex-shrink-0">
            <button
              onClick={() =>
                setOpenMenuChannelId(
                  isMenuOpen ? null : channel.youtubeChannelId,
                )
              }
              aria-label="操作メニュー"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              ⋯
            </button>
            {isMenuOpen && (
              <>
                {/* 外側クリックで閉じるための透明バックドロップ */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setOpenMenuChannelId(null)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-gray-100 py-1 min-w-[180px]">
                  <button
                    onClick={() => {
                      setOpenMenuChannelId(null);
                      handleUnsubscribe(
                        channel.youtubeChannelId,
                        channel.title,
                      );
                    }}
                    disabled={isBusy}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                  >
                    YouTube から購読解除
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      );
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-gray-400 hover:text-gray-700 transition-colors"
            >
              ← 戻る
            </Link>
            <h1 className="text-lg font-semibold text-gray-900">
              チャンネル設定
            </h1>
          </div>
          <button
            onClick={syncChannels}
            disabled={isSyncing}
            className="text-sm bg-white border border-gray-300 hover:border-gray-400 text-gray-700 py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSyncing ? '同期中...' : 'チャンネルを同期'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        {attentionChannels.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900">
                {WARNING_DAYS}日以上見ていないチャンネルが{' '}
                {attentionChannels.length} 件あります
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                そのまま続けるか、Hibi で表示を止めるかを選べます
              </p>
            </div>
            <button
              onClick={() => setIsReviewOpen(true)}
              className="text-sm bg-amber-600 hover:bg-amber-700 text-white py-2 px-4 rounded-lg transition-colors flex-shrink-0"
            >
              整理する
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              {channels.length}件 / 選択中: {selected.size}件
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setSelected(
                    new Set(channels.map((c) => c.youtubeChannelId)),
                  )
                }
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                全選択
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                全解除
              </button>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-gray-100">
            <input
              type="search"
              placeholder="チャンネルを検索..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>{channelListContent}</div>
        </div>

        <div className="mt-4">
          <button
            onClick={saveSelection}
            disabled={isSaving}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '保存中...' : '変更を保存'}
          </button>
        </div>
      </div>

      {isReviewOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setIsReviewOpen(false)}
        >
          <div
            className="bg-white rounded-xl max-w-md w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {WARNING_DAYS}日以上見ていないチャンネル
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                それぞれのチャンネルについて、どうするか選んでください
              </p>
            </div>

            <div className="flex-1 overflow-y-auto">
              {attentionChannels.map((ch) => {
                const isBusy = processingId === ch.youtubeChannelId;
                return (
                  <div
                    key={ch.youtubeChannelId}
                    className="px-5 py-4 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      {ch.thumbnailUrl && (
                        <Image
                          src={ch.thumbnailUrl}
                          alt={ch.title}
                          width={32}
                          height={32}
                          className="rounded-full flex-shrink-0"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {ch.title}
                        </p>
                        <p className="text-xs text-gray-500">
                          {lastWatchedLabel(ch.daysSinceLastWatched)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleKeep(ch.youtubeChannelId)}
                        disabled={isBusy}
                        className="w-full text-sm bg-white border border-gray-300 hover:border-gray-400 text-gray-700 py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                      >
                        そのまま続ける
                      </button>
                      <button
                        onClick={() =>
                          handleUncheckFromModal(ch.youtubeChannelId)
                        }
                        disabled={isBusy}
                        className="w-full text-sm bg-amber-600 hover:bg-amber-700 text-white py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                      >
                        Hibi で表示を止める
                      </button>
                      <button
                        onClick={() =>
                          handleUnsubscribe(ch.youtubeChannelId, ch.title)
                        }
                        disabled={isBusy}
                        className="w-full text-sm bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded-lg transition-colors disabled:opacity-50"
                      >
                        YouTube から購読解除
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => setIsReviewOpen(false)}
                className="w-full text-sm text-gray-600 hover:text-gray-900 py-2 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
