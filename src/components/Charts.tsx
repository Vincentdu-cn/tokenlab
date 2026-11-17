import { useState } from 'react';
import type {
  BenchmarkRunResult,
  ComparisonGroupSummary,
  ReasoningEffort,
} from '../types/benchmark';

const MODEL_COLORS = [
  '#2563EB', // Cobalt
  '#0F766E', // Deep Teal
  '#D97706', // Amber
  '#7C3AED', // Indigo Violet
  '#DC2626', // Crimson
  '#64748B', // Slate
];

function getColorForModel(modelName: string, allModels: string[]): string {
  const idx = allModels.indexOf(modelName);
  return MODEL_COLORS[(idx >= 0 ? idx : 0) % MODEL_COLORS.length];
}

export function ParetoScatterChart({
  groups,
}: {
  groups: ComparisonGroupSummary[];
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  if (groups.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        暂无已完成样本，运行测试后将生成 TTFT 与吞吐量帕累托散点图。
      </div>
    );
  }

  const models = Array.from(new Set(groups.map((g) => g.modelName)));
  const width = 560;
  const height = 290;
  const pad = { top: 24, right: 28, bottom: 44, left: 58 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxTtft = Math.max(500, ...groups.map((g) => g.meanTtftMs)) * 1.15;
  const maxTps = Math.max(50, ...groups.map((g) => g.meanOutputTps)) * 1.15;

  const xScale = (ttft: number) => pad.left + (ttft / maxTtft) * plotW;
  const yScale = (tps: number) => pad.top + plotH - (tps / maxTps) * plotH;

  const sortedByTtft = [...groups].sort((a, b) => a.meanTtftMs - b.meanTtftMs);
  const paretoPoints: ComparisonGroupSummary[] = [];
  let bestTps = -1;
  for (const g of sortedByTtft) {
    if (g.meanOutputTps > bestTps) {
      bestTps = g.meanOutputTps;
      paretoPoints.push(g);
    }
  }

  const paretoPath = paretoPoints
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${xScale(p.meanTtftMs)} ${yScale(p.meanOutputTps)}`)
    .join(' ');

  const hovered = groups.find((g) => g.groupKey === hoveredKey) ?? null;

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          {models.map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm inline-block"
                style={{ backgroundColor: getColorForModel(m, models) }}
              />
              <span>{m}</span>
            </span>
          ))}
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          左上角为最优帕累托前沿 (低延迟 + 高吞吐)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="TTFT 延迟与输出吞吐量散点图"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.top + plotH * (1 - t);
          const x = pad.left + plotW * t;
          return (
            <g key={t}>
              <line
                x1={pad.left}
                y1={y}
                x2={pad.left + plotW}
                y2={y}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
              >
                {Math.round(maxTps * t)}
              </text>
              <line
                x1={x}
                y1={pad.top}
                x2={x}
                y2={pad.top + plotH}
                className="stroke-slate-100 dark:stroke-slate-800/70"
                strokeWidth="1"
              />
              <text
                x={x}
                y={pad.top + plotH + 16}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
              >
                {Math.round(maxTtft * t)}ms
              </text>
            </g>
          );
        })}

        <text
          x={pad.left + plotW / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-slate-600 dark:fill-slate-400 text-[11px] font-medium"
        >
          首字延迟 TTFT (ms) — 越低越快
        </text>
        <text
          x={14}
          y={pad.top + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 14 ${pad.top + plotH / 2})`}
          className="fill-slate-600 dark:fill-slate-400 text-[11px] font-medium"
        >
          输出吞吐 (tok/s)
        </text>

        {paretoPoints.length > 1 && (
          <path
            d={paretoPath}
            fill="none"
            className="stroke-slate-400 dark:stroke-slate-600"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
        )}

        {groups.map((g) => {
          const cx = xScale(g.meanTtftMs);
          const cy = yScale(g.meanOutputTps);
          const color = getColorForModel(g.modelName, models);
          const isHovered = hoveredKey === g.groupKey;
          const radius = Math.max(5, Math.min(10, 4 + g.meanQualityScore / 20));
          return (
            <g
              key={g.groupKey}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredKey(g.groupKey)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? radius + 3 : radius}
                fill={color}
                fillOpacity={isHovered ? 0.95 : 0.85}
                className="stroke-white dark:stroke-slate-900"
                strokeWidth="1.5"
              />
              <text
                x={cx}
                y={cy - radius - 4}
                textAnchor="middle"
                className="fill-slate-700 dark:fill-slate-300 text-[9.5px] font-mono"
              >
                {g.reasoningEffort}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div className="mt-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded text-xs text-slate-700 dark:text-slate-200 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums">
          <span className="font-sans font-semibold text-slate-900 dark:text-slate-100">
            {hovered.modelName} ({hovered.reasoningEffort})
          </span>
          <span>TTFT {hovered.meanTtftMs} ms</span>
          <span>TPS {hovered.meanOutputTps} tok/s</span>
          <span>E2E {(hovered.meanE2eMs / 1000).toFixed(2)} s</span>
          <span>质量 {hovered.meanQualityScore}/100</span>
        </div>
      )}
    </div>
  );
}

export function EffortSweepChart({
  groups,
  metric,
}: {
  groups: ComparisonGroupSummary[];
  metric: 'e2e' | 'tps' | 'quality' | 'reasoningTokens';
}) {
  if (groups.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        暂无已完成样本。
      </div>
    );
  }

  const effortOrder: ReasoningEffort[] = [
    'none',
    'minimal',
    'low',
    'medium',
    'high',
    'xhigh',
    'max',
  ];
  const presentEfforts = effortOrder.filter((e) =>
    groups.some((g) => g.reasoningEffort === e)
  );
  const models = Array.from(new Set(groups.map((g) => g.modelName)));

  const getValue = (g: ComparisonGroupSummary) => {
    if (metric === 'e2e') return g.meanE2eMs / 1000;
    if (metric === 'tps') return g.meanOutputTps;
    if (metric === 'quality') return g.meanQualityScore;
    return g.meanReasoningTokens;
  };

  const unitLabel =
    metric === 'e2e'
      ? 's'
      : metric === 'tps'
        ? 'tok/s'
        : metric === 'quality'
          ? '分'
          : 'tok';

  const maxVal =
    Math.max(metric === 'quality' ? 100 : 1, ...groups.map((g) => getValue(g))) *
    (metric === 'quality' ? 1 : 1.15);

  const width = 560;
  const height = 290;
  const pad = { top: 24, right: 20, bottom: 42, left: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const groupSlotW = plotW / Math.max(1, presentEfforts.length);
  const barWidth = Math.min(26, (groupSlotW * 0.72) / Math.max(1, models.length));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300 mb-3">
        {models.map((m) => (
          <span key={m} className="inline-flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: getColorForModel(m, models) }}
            />
            <span>{m}</span>
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label="不同推理强度下的指标对比柱状图"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.top + plotH * (1 - t);
          return (
            <g key={t}>
              <line
                x1={pad.left}
                y1={y}
                x2={pad.left + plotW}
                y2={y}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth="1"
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
              >
                {metric === 'e2e'
                  ? (maxVal * t).toFixed(1)
                  : Math.round(maxVal * t)}
              </text>
            </g>
          );
        })}

        {presentEfforts.map((effort, eIdx) => {
          const slotCenterX = pad.left + groupSlotW * (eIdx + 0.5);
          const totalBarsW = models.length * barWidth + (models.length - 1) * 4;
          const startX = slotCenterX - totalBarsW / 2;

          return (
            <g key={effort}>
              <text
                x={slotCenterX}
                y={pad.top + plotH + 18}
                textAnchor="middle"
                className="fill-slate-700 dark:fill-slate-300 text-[11px] font-mono font-medium"
              >
                {effort}
              </text>

              {models.map((modelName, mIdx) => {
                const match = groups.find(
                  (g) => g.modelName === modelName && g.reasoningEffort === effort
                );
                if (!match) return null;
                const val = getValue(match);
                const barH = Math.max(2, (val / maxVal) * plotH);
                const x = startX + mIdx * (barWidth + 4);
                const y = pad.top + plotH - barH;
                const color = getColorForModel(modelName, models);

                return (
                  <g key={modelName}>
                    <rect
                      x={x}
                      y={y}
                      width={barWidth}
                      height={barH}
                      rx={2}
                      fill={color}
                    />
                    <text
                      x={x + barWidth / 2}
                      y={y - 4}
                      textAnchor="middle"
                      className="fill-slate-600 dark:fill-slate-300 text-[9px] font-mono"
                    >
                      {metric === 'e2e' ? val.toFixed(1) : Math.round(val)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        <text
          x={pad.left + plotW / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-slate-600 dark:fill-slate-400 text-[11px] font-medium"
        >
          Reasoning Effort 推理强度梯度 ({unitLabel})
        </text>
      </svg>
    </div>
  );
}

export function LatencyBreakdownBars({
  groups,
}: {
  groups: ComparisonGroupSummary[];
}) {
  if (groups.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        暂无延迟分解数据。
      </div>
    );
  }

  const maxE2e = Math.max(100, ...groups.map((g) => g.meanE2eMs));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-5 text-xs text-slate-600 dark:text-slate-300 pb-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[#0F172A] dark:bg-slate-400 rounded-sm inline-block" />
          <span>TTFT 首字延迟</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[#D97706] rounded-sm inline-block" />
          <span>Reasoning 思考耗时</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[#2563EB] rounded-sm inline-block" />
          <span>正文生成耗时</span>
        </span>
      </div>

      <div className="space-y-2.5">
        {groups.map((g) => {
          const ttftPct = (g.meanTtftMs / maxE2e) * 100;
          const thinkPct = (g.meanThinkingMs / maxE2e) * 100;
          const genPct = (g.meanGenerationMs / maxE2e) * 100;

          return (
            <div key={g.groupKey} className="space-y-1">
              <div className="flex items-center justify-between text-xs gap-4">
                <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                  {g.modelName}{' '}
                  <span className="text-slate-400 dark:text-slate-500 font-normal">
                    · {g.reasoningEffort}
                  </span>
                </span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 shrink-0">
                  {(g.meanE2eMs / 1000).toFixed(2)}s{' '}
                  <span className="text-slate-400 dark:text-slate-500">
                    ({g.meanTtftMs.toFixed(0)}ms + {(g.meanThinkingMs / 1000).toFixed(2)}s +{' '}
                    {(g.meanGenerationMs / 1000).toFixed(2)}s)
                  </span>
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-sm overflow-hidden flex">
                <div
                  style={{ width: `${Math.max(1, ttftPct)}%` }}
                  className="bg-[#0F172A] dark:bg-slate-400 h-full"
                  title={`TTFT: ${g.meanTtftMs} ms`}
                />
                {g.meanThinkingMs > 0 && (
                  <div
                    style={{ width: `${Math.max(1, thinkPct)}%` }}
                    className="bg-[#D97706] h-full"
                    title={`Thinking: ${g.meanThinkingMs} ms`}
                  />
                )}
                <div
                  style={{ width: `${Math.max(1, genPct)}%` }}
                  className="bg-[#2563EB] h-full"
                  title={`Generation: ${g.meanGenerationMs} ms`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TokenVelocityChart({ run }: { run: BenchmarkRunResult | null }) {
  if (!run || run.samples.length === 0) {
    return (
      <div className="h-52 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
        选择任意已完成的测试记录，查看流式瞬时吞吐量波动波形。
      </div>
    );
  }

  const width = 560;
  const height = 210;
  const pad = { top: 18, right: 18, bottom: 34, left: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const samples = run.samples;
  const maxTime = Math.max(100, ...samples.map((s) => s.elapsedMs));
  const maxTps = Math.max(30, ...samples.map((s) => s.instantTps)) * 1.15;

  const xScale = (ms: number) => pad.left + (ms / maxTime) * plotW;
  const yScale = (tps: number) => pad.top + plotH - (tps / maxTps) * plotH;

  const path = samples
    .map((s, idx) => `${idx === 0 ? 'M' : 'L'} ${xScale(s.elapsedMs)} ${yScale(s.instantTps)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto overflow-visible"
      role="img"
      aria-label="流式吞吐量实时波形"
    >
      {[0, 0.5, 1].map((t) => {
        const y = pad.top + plotH * (1 - t);
        return (
          <g key={t}>
            <line
              x1={pad.left}
              y1={y}
              x2={pad.left + plotW}
              y2={y}
              className="stroke-slate-200 dark:stroke-slate-800"
              strokeWidth="1"
            />
            <text
              x={pad.left - 8}
              y={y + 4}
              textAnchor="end"
              className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
            >
              {Math.round(maxTps * t)}
            </text>
          </g>
        );
      })}

      <path
        d={path}
        fill="none"
        className="stroke-[#2563EB] dark:stroke-blue-400"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {samples.map((s, idx) => (
        <circle
          key={idx}
          cx={xScale(s.elapsedMs)}
          cy={yScale(s.instantTps)}
          r="2.8"
          fill={s.phase === 'reasoning' ? '#D97706' : '#2563EB'}
        />
      ))}

      <text
        x={pad.left}
        y={height - 8}
        className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
      >
        0ms
      </text>
      <text
        x={pad.left + plotW}
        y={height - 8}
        textAnchor="end"
        className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
      >
        {maxTime}ms
      </text>
    </svg>
  );
}
