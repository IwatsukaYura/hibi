"use client";

type Bucket = {
  date: string;
  watchedSeconds: number;
};

type Props = {
  buckets: Bucket[];
  baselineSecondsPerDay: number | null;
};

const CHART_HEIGHT_PX = 176;
const EMPTY_BAR_HEIGHT_PX = 4;
const Y_AXIS_WIDTH_REM = 2.5;
const Y_AXIS_GAP_REM = 0.75;

function shortLabel(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function fullLabel(date: string): string {
  const [y, m, d] = date.split("-");
  return `${y}年${Number(m)}月${Number(d)}日`;
}

function minutesText(seconds: number): string {
  return `${Math.round(seconds / 60)}分`;
}

export default function DailyBarChart({ buckets, baselineSecondsPerDay }: Props) {
  if (buckets.length === 0) {
    return (
      <div className="text-sm text-stone-400 py-8 text-center">
        データがありません
      </div>
    );
  }

  const maxValue = Math.max(
    ...buckets.map((b) => b.watchedSeconds),
    baselineSecondsPerDay ?? 0,
    1,
  );

  const baselinePct =
    baselineSecondsPerDay !== null ? (baselineSecondsPerDay / maxValue) * 100 : null;

  const labelStep = Math.max(1, Math.ceil(buckets.length / 6));
  const xAxisLeftRem = Y_AXIS_WIDTH_REM + Y_AXIS_GAP_REM;

  return (
    <div className="w-full">
      <div className="flex items-stretch">
        <div
          className="relative shrink-0"
          style={{
            height: CHART_HEIGHT_PX,
            width: `${Y_AXIS_WIDTH_REM}rem`,
            marginRight: `${Y_AXIS_GAP_REM}rem`,
          }}
          aria-hidden
        >
          <span className="absolute right-0 top-0 -translate-y-1/2 text-[10px] text-stone-400">
            {minutesText(maxValue)}
          </span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] text-stone-400">
            {minutesText(maxValue / 2)}
          </span>
          <span className="absolute right-0 bottom-0 translate-y-1/2 text-[10px] text-stone-400">
            0
          </span>
        </div>

        <div className="flex-1 relative" style={{ height: CHART_HEIGHT_PX }}>
          <div
            className="absolute inset-x-0 top-0 border-t border-stone-200/70 pointer-events-none"
            aria-hidden
          />
          <div
            className="absolute inset-x-0 top-1/2 border-t border-stone-200/50 pointer-events-none"
            aria-hidden
          />
          <div
            className="absolute inset-x-0 bottom-0 border-t border-stone-200/70 pointer-events-none"
            aria-hidden
          />

          {baselinePct !== null && (
            <div
              className="absolute inset-x-0 border-t border-dashed border-teal-500/70 pointer-events-none"
              style={{ bottom: `${baselinePct}%` }}
              aria-hidden
            >
              <span className="absolute right-0 -translate-y-1/2 text-[10px] text-teal-700 bg-white px-1 rounded whitespace-nowrap">
                目安 {minutesText(baselineSecondsPerDay ?? 0)}
              </span>
            </div>
          )}

          <div className="absolute inset-0 flex items-end gap-1.5">
            {buckets.map((b) => {
              const isEmpty = b.watchedSeconds === 0;
              const watchedPct = (b.watchedSeconds / maxValue) * 100;
              const overBaseline =
                baselineSecondsPerDay !== null && b.watchedSeconds > baselineSecondsPerDay;
              const tealPct =
                overBaseline && baselineSecondsPerDay !== null
                  ? (baselineSecondsPerDay / maxValue) * 100
                  : watchedPct;
              const amberPct =
                overBaseline && baselineSecondsPerDay !== null
                  ? ((b.watchedSeconds - baselineSecondsPerDay) / maxValue) * 100
                  : 0;
              const deltaText =
                baselineSecondsPerDay !== null
                  ? overBaseline
                    ? `目安より +${minutesText(b.watchedSeconds - baselineSecondsPerDay)}`
                    : `目安より -${minutesText(baselineSecondsPerDay - b.watchedSeconds)}`
                  : null;

              return (
                <div
                  key={b.date}
                  className="group relative flex-1 h-full flex flex-col justify-end"
                >
                  {isEmpty ? (
                    <div
                      className="w-full bg-stone-200 rounded-sm"
                      style={{ height: EMPTY_BAR_HEIGHT_PX }}
                    />
                  ) : overBaseline ? (
                    <>
                      <div
                        className="w-full bg-amber-500 rounded-t-sm transition-colors group-hover:bg-amber-600"
                        style={{ height: `${amberPct}%` }}
                      />
                      <div
                        className="w-full bg-teal-500 transition-colors group-hover:bg-teal-600"
                        style={{ height: `${tealPct}%` }}
                      />
                    </>
                  ) : (
                    <div
                      className="w-full bg-teal-500 rounded-t-sm transition-colors group-hover:bg-teal-600"
                      style={{ height: `${watchedPct}%` }}
                    />
                  )}

                  <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                    <div className="bg-stone-900 text-white text-[11px] rounded-md px-2 py-1.5 shadow-lg whitespace-nowrap">
                      <div className="font-medium">{fullLabel(b.date)}</div>
                      <div className="text-stone-300">
                        視聴 {minutesText(b.watchedSeconds)}
                      </div>
                      {deltaText && (
                        <div
                          className={overBaseline ? "text-amber-300" : "text-teal-300"}
                        >
                          {deltaText}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className="flex gap-1.5 mt-3"
        style={{ marginLeft: `${xAxisLeftRem}rem` }}
      >
        {buckets.map((b, i) => {
          const showLabel = i % labelStep === 0 || i === buckets.length - 1;
          return (
            <div
              key={b.date}
              className="flex-1 text-center text-[10px] text-stone-400"
            >
              {showLabel ? shortLabel(b.date) : ""}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 bg-teal-500 rounded-sm" />
          目安内
        </span>
        {baselineSecondsPerDay !== null && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 bg-amber-500 rounded-sm" />
            目安オーバー
          </span>
        )}
      </div>
    </div>
  );
}
