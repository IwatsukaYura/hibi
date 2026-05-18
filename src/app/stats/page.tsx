"use client";

import { useEffect, useRef, useState } from "react";
import Header from "@/components/Header";
import DailyBarChart from "@/components/DailyBarChart";
import type { StatsResponse, StatsPeriod } from "@/lib/stats";

const PERIOD_LABELS: Record<StatsPeriod, string> = {
  today: "今日",
  week: "今週",
  month: "今月",
  all: "全期間",
};

function formatHoursMinutes(seconds: number): string {
  if (seconds <= 0) return "0分";
  const totalMinutes = Math.floor(seconds / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

function MovieEquivalent({ seconds }: { seconds: number }) {
  const movies = Math.floor(seconds / (110 * 60));
  if (movies < 1) return null;
  return <span className="text-sm text-stone-500">= 映画 約{movies}本ぶん</span>;
}

export default function StatsPage() {
  const [period, setPeriod] = useState<StatsPeriod>("month");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/stats?period=${period}`);
        if (!res.ok) throw new Error("統計の取得に失敗しました");
        const data: StatsResponse = await res.json();
        setStats(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "エラーが発生しました");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [period]);

  const handleSaveBaseline = async () => {
    const raw = inputRef.current?.value ?? "";
    const minutes = Number(raw);
    if (raw === "" || !Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
      setError("0〜1440 の範囲で入力してください");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baselineMinutesPerDay: minutes }),
      });
      if (!res.ok) throw new Error("保存に失敗しました");
      const refreshed = await fetch(`/api/stats?period=${period}`);
      if (refreshed.ok) setStats(await refreshed.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  const baselineUnset = stats?.baselineMinutesPerDay === null;

  return (
    <div className="min-h-screen bg-stone-50">
      <Header />

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h2 className="text-xl font-bold text-stone-900">ふりかえり</h2>
          <p className="text-sm text-stone-500 mt-1">
            Hibi を使って YouTube から離れられた時間を、日々のあゆみとして
          </p>
        </div>

        <div className="inline-flex bg-white rounded-lg border border-stone-200 p-1">
          {(Object.keys(PERIOD_LABELS) as StatsPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                period === p
                  ? "bg-teal-600 text-white"
                  : "text-stone-600 hover:bg-stone-50"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {isLoading && !stats ? (
          <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-8 animate-pulse">
            <div className="h-4 bg-stone-200 rounded w-32 mb-4" />
            <div className="h-10 bg-stone-200 rounded w-64" />
          </div>
        ) : stats ? (
          <>
            {baselineUnset ? (
              <div className="bg-stone-50 border border-stone-200 text-stone-700 rounded-xl p-6">
                <p className="font-semibold text-stone-900 mb-1">
                  最初に目安の時間を設定してください
                </p>
                <p className="text-sm">
                  以前 1日あたり YouTube を何分くらい見ていたかを下の設定欄で入力すると、
                  どれだけ離れられたかを計算できるようになります。
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6">
                <p className="text-sm text-stone-500">
                  {PERIOD_LABELS[stats.period]}、YouTube から
                </p>
                <p className="text-3xl font-bold text-stone-900 mt-1">
                  {formatHoursMinutes(stats.savedSeconds)}
                </p>
                <p className="text-sm text-stone-500 mt-1">
                  離れていられました{" "}
                  <MovieEquivalent seconds={stats.savedSeconds} />
                </p>
                <div className="mt-4 pt-4 border-t border-stone-100 grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-stone-500">アプリ内の視聴時間</p>
                    <p className="font-semibold text-stone-900 mt-0.5">
                      {formatHoursMinutes(stats.totalWatchedSeconds)}
                    </p>
                  </div>
                  <div>
                    <p className="text-stone-500">目安の合計</p>
                    <p className="font-semibold text-stone-900 mt-0.5">
                      {formatHoursMinutes(stats.totalBaselineSeconds)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : null}

        {stats && !baselineUnset && (
          <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6">
            <h3 className="font-semibold text-stone-900 mb-4">日次の視聴時間</h3>
            <DailyBarChart
              buckets={stats.dailyBuckets}
              baselineSecondsPerDay={
                stats.baselineMinutesPerDay !== null
                  ? stats.baselineMinutesPerDay * 60
                  : null
              }
            />
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-4">
              <p className="text-xs text-stone-500">視聴した動画</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">
                {stats.objectiveMetrics.watchedPickCount}
                <span className="text-sm font-normal text-stone-500 ml-1">本</span>
              </p>
              <p className="text-xs text-stone-400 mt-1">
                推薦 {stats.objectiveMetrics.pickedVideoCount} 本中
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-4">
              <p className="text-xs text-stone-500">見なかった動画</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">
                {stats.objectiveMetrics.pickedVideoCount -
                  stats.objectiveMetrics.watchedPickCount}
                <span className="text-sm font-normal text-stone-500 ml-1">本</span>
              </p>
              <p className="text-xs text-stone-400 mt-1">推薦されたがスキップ</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-4">
              <p className="text-xs text-stone-500">スキップで離れた時間</p>
              <p className="text-2xl font-bold text-stone-900 mt-1">
                {formatHoursMinutes(stats.objectiveMetrics.skippedPickSeconds)}
              </p>
              <p className="text-xs text-stone-400 mt-1">見なかった動画の合計時間</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-stone-100 p-6">
          <h3 className="font-semibold text-stone-900 mb-2">設定</h3>
          <p className="text-sm text-stone-500 mb-4">
            アプリ導入前に 1日あたり何分 YouTube を見ていたかの目安(分)
          </p>
          <div className="flex items-center gap-3">
            <input
              ref={inputRef}
              key={stats?.baselineMinutesPerDay ?? "unset"}
              type="number"
              min={0}
              max={1440}
              defaultValue={
                stats?.baselineMinutesPerDay !== null &&
                stats?.baselineMinutesPerDay !== undefined
                  ? String(stats.baselineMinutesPerDay)
                  : ""
              }
              placeholder="例: 90"
              className="w-32 border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <span className="text-sm text-stone-500">分/日</span>
            <button
              onClick={handleSaveBaseline}
              disabled={isSaving}
              className="ml-auto bg-teal-600 hover:bg-teal-700 disabled:bg-stone-300 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              {isSaving ? "保存中…" : "保存"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
