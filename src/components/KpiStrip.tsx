import type { BenchmarkRunResult } from '../types/benchmark';
import { calculatePercentile } from '../utils/metrics';

interface KpiStripProps {
  runs: BenchmarkRunResult[];
}

export function KpiStrip({ runs }: KpiStripProps) {
  const finished = runs.filter((r) => r.status !== 'running');
  const completed = finished.filter((r) => r.status === 'completed');
  const count = completed.length;

  const avgTtft =
    count > 0
      ? completed.reduce((s, r) => s + r.ttftMs, 0) / count
      : 0;
  const p95Ttft =
    count > 0
      ? calculatePercentile(
          completed.map((r) => r.ttftMs),
          95
        )
      : 0;

  const avgTps =
    count > 0
      ? completed.reduce((s, r) => s + r.outputTps, 0) / count
      : 0;
  const peakTps =
    count > 0
      ? Math.max(...completed.map((r) => r.outputTps))
      : 0;

  const avgTpot =
    count > 0
      ? completed.reduce((s, r) => s + r.tpotMs, 0) / count
      : 0;
  const avgJitter =
    count > 0
      ? completed.reduce((s, r) => s + r.jitterStdDevMs, 0) / count
      : 0;

  const avgQuality =
    count > 0
      ? completed.reduce((s, r) => s + r.quality.overallScore, 0) / count
      : 0;
  const successRate =
    finished.length > 0
      ? Math.round((completed.length / finished.length) * 100)
      : 0;

  const cards = [
    {
      label: '首字延迟 TTFT (均值)',
      value: count > 0 ? `${avgTtft.toFixed(0)} ms` : '—',
      sub: count > 0 ? `P95 ${p95Ttft.toFixed(0)} ms · ${count} 次有效样本` : '暂无样本',
    },
    {
      label: '输出吞吐 Output TPS',
      value: count > 0 ? `${avgTps.toFixed(1)} tok/s` : '—',
      sub: count > 0 ? `峰值 ${peakTps.toFixed(1)} tok/s · 客户端直连` : '暂无样本',
    },
    {
      label: '单 Token 耗时 TPOT',
      value: count > 0 ? `${avgTpot.toFixed(2)} ms` : '—',
      sub: count > 0 ? `平均抖动 ±${avgJitter.toFixed(1)} ms` : '暂无样本',
    },
    {
      label: '响应质量与可用率',
      value: count > 0 ? `${avgQuality.toFixed(0)} / 100` : '—',
      sub: finished.length > 0 ? `请求成功率 ${successRate}%` : '暂无样本',
    },
  ];

  return (
    <section
      aria-label="核心性能指标汇总"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800"
    >
      {cards.map((card) => (
        <div key={card.label} className="p-5 flex flex-col justify-between gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {card.label}
          </span>
          <div className="font-mono tabular-nums text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {card.value}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {card.sub}
          </span>
        </div>
      ))}
    </section>
  );
}
