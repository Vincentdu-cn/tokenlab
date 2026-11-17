import { useMemo, useState } from 'react';
import { Download, Star } from 'lucide-react';
import type { BenchmarkRunResult, ReasoningEffort } from '../types/benchmark';
import {
  aggregateComparisonGroups,
  ALL_REASONING_EFFORTS,
  exportResultsAsCsv,
  exportResultsAsJson,
  exportResultsAsMarkdown,
} from '../utils/metrics';
import {
  EffortSweepChart,
  LatencyBreakdownBars,
  ParetoScatterChart,
} from './Charts';

interface ReportsViewProps {
  runs: BenchmarkRunResult[];
  onRateRun: (runId: string, rating: number) => void;
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ReportsView({ runs, onRateRun }: ReportsViewProps) {
  const [modelFilter, setModelFilter] = useState<string>('all');
  const [effortFilter, setEffortFilter] = useState<ReasoningEffort | 'all'>('all');
  const [sweepMetric, setSweepMetric] = useState<
    'e2e' | 'tps' | 'quality' | 'reasoningTokens'
  >('e2e');

  const completedRuns = useMemo(
    () => runs.filter((r) => r.status === 'completed'),
    [runs]
  );

  const uniqueModels = useMemo(
    () => Array.from(new Set(completedRuns.map((r) => r.modelName))),
    [completedRuns]
  );

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (r.status === 'running') return false;
      if (modelFilter !== 'all' && r.modelName !== modelFilter) return false;
      if (effortFilter !== 'all' && r.reasoningEffort !== effortFilter) return false;
      return true;
    });
  }, [runs, modelFilter, effortFilter]);

  const groups = useMemo(
    () => aggregateComparisonGroups(filteredRuns),
    [filteredRuns]
  );

  const [leftRunId, setLeftRunId] = useState<string>('');
  const [rightRunId, setRightRunId] = useState<string>('');

  const leftRun =
    completedRuns.find((r) => r.id === leftRunId) ?? completedRuns[0] ?? null;
  const rightRun =
    completedRuns.find((r) => r.id === rightRunId) ??
    completedRuns[Math.min(1, completedRuns.length - 1)] ??
    null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            可视化性能对比报告
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            对比不同模型与 Reasoning Effort 推理强度下的延迟分布、吞吐帕累托前沿、推理 Token 占比、可用率与输出质量。
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              triggerDownload(
                'tokenlab-report.md',
                exportResultsAsMarkdown(filteredRuns),
                'text/markdown;charset=utf-8'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>导出 Markdown</span>
          </button>
          <button
            type="button"
            onClick={() =>
              triggerDownload(
                'tokenlab-runs.csv',
                exportResultsAsCsv(filteredRuns),
                'text/csv;charset=utf-8'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>导出 CSV</span>
          </button>
          <button
            type="button"
            onClick={() =>
              triggerDownload(
                'tokenlab-runs.json',
                exportResultsAsJson(filteredRuns),
                'application/json;charset=utf-8'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-[#0F172A] dark:bg-[#2563EB] rounded-md hover:bg-slate-800 dark:hover:bg-[#1D4ED8] whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>导出 JSON</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label
              htmlFor="report-model-filter"
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              模型筛选
            </label>
            <select
              id="report-model-filter"
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
            >
              <option value="all">全部模型 ({uniqueModels.length})</option>
              {uniqueModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="report-effort-filter"
              className="text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              推理强度
            </label>
            <select
              id="report-effort-filter"
              value={effortFilter}
              onChange={(e) =>
                setEffortFilter(e.target.value as ReasoningEffort | 'all')
              }
              className="px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
            >
              <option value="all">全部强度</option>
              {ALL_REASONING_EFFORTS.map((eff) => (
                <option key={eff} value={eff}>
                  {eff}
                </option>
              ))}
            </select>
          </div>
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
          当前汇总 {groups.length} 组配置 · {completedRuns.length} 条有效样本
        </span>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          aria-label="TTFT 与吞吐量帕累托对比"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3"
        >
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              首字延迟 (TTFT) vs 输出吞吐 (TPS) 帕累托分析
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              悬停数据点查看各推理强度下的具体延迟与质量得分，气泡大小代表质量分数。
            </p>
          </div>
          <ParetoScatterChart groups={groups} />
        </section>

        <section
          aria-label="Reasoning Effort 梯度对比"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3"
        >
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                Reasoning Effort 推理强度梯度影响
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                直观评估增强推理强度带来的延迟代价与质量收益。
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
              {(
                [
                  { id: 'e2e', label: '总延迟' },
                  { id: 'tps', label: 'TPS' },
                  { id: 'reasoningTokens', label: '推理 Tokens' },
                  { id: 'quality', label: '质量分' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSweepMetric(tab.id)}
                  className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                    sweepMetric === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <EffortSweepChart groups={groups} metric={sweepMetric} />
        </section>
      </div>

      {/* Latency Breakdown + Summary Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section
          aria-label="端到端延迟阶段分解"
          className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
        >
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              端到端延迟阶段分解 (E2E Breakdown)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              拆解首字等待 (TTFT)、推理思考 (Thinking) 与正文输出阶段占比。
            </p>
          </div>
          <LatencyBreakdownBars groups={groups} />
        </section>

        <section
          aria-label="模型配置聚合对比矩阵"
          className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
        >
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              聚合对比矩阵 (P50 / P95 · 可用率 · 推理占比)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  <th className="py-2.5 px-4">模型 / Effort</th>
                  <th className="py-2.5 px-2 text-right">可用率</th>
                  <th className="py-2.5 px-2.5 text-right">TTFT P50</th>
                  <th className="py-2.5 px-2.5 text-right">TTFT P95</th>
                  <th className="py-2.5 px-2.5 text-right">TPOT</th>
                  <th className="py-2.5 px-2.5 text-right">Output TPS</th>
                  <th className="py-2.5 px-2.5 text-right">推理占比</th>
                  <th className="py-2.5 px-4 text-right">质量</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {groups.map((g) => (
                  <tr
                    key={g.groupKey}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-900 dark:text-slate-100">
                        {g.modelName}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {g.providerName} · {g.reasoningEffort}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {g.successRate}%
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                      {g.p50TtftMs.toFixed(0)} ms
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {g.p95TtftMs.toFixed(0)} ms
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {g.meanTpotMs.toFixed(2)} ms
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-[#2563EB] dark:text-blue-400">
                      {g.meanOutputTps.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {g.reasoningSharePct}%
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {g.meanQualityScore}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Side-by-Side Response Quality Inspector */}
      <section
        aria-label="输出质量与推理链路并排对比"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
      >
        <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
          <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            响应内容与质量并排对比 (Side-by-Side Inspector)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            直接对照两次运行的思考过程、JSON 合规性、关键词命中率及人工质量评分。
          </p>
        </div>

        {completedRuns.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            暂无已完成的运行记录可对比。
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[
              { label: '样本 A', run: leftRun, onSelect: setLeftRunId },
              { label: '样本 B', run: rightRun, onSelect: setRightRunId },
            ].map((slot) => (
              <div
                key={slot.label}
                className="border border-slate-200 dark:border-slate-800 rounded-md p-4 space-y-3 bg-slate-50/40 dark:bg-slate-950/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {slot.label}
                  </span>
                  <select
                    aria-label={`选择${slot.label}`}
                    value={slot.run?.id ?? ''}
                    onChange={(e) => slot.onSelect(e.target.value)}
                    className="flex-1 max-w-sm px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                  >
                    {completedRuns.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.modelName} · effort={r.reasoningEffort} · {r.outputTps.toFixed(1)} tok/s
                      </option>
                    ))}
                  </select>
                </div>

                {slot.run && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-400 border-y border-slate-200 dark:border-slate-800 py-2">
                      <span>TTFT {slot.run.ttftMs.toFixed(0)}ms</span>
                      <span>TPS {slot.run.outputTps.toFixed(1)}</span>
                      <span>E2E {(slot.run.e2eMs / 1000).toFixed(2)}s</span>
                      <span>
                        自动分 {slot.run.quality.overallScore}/100 ·{' '}
                        {slot.run.quality.jsonValid === null
                          ? `结构 ${slot.run.quality.structureScore}%`
                          : slot.run.quality.jsonValid
                            ? 'JSON 合法'
                            : 'JSON 无效'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">
                        人工质量盲评打分:
                      </span>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const active = (slot.run?.quality.manualRating ?? 0) >= star;
                          return (
                            <button
                              key={star}
                              type="button"
                              aria-label={`为${slot.label}评分 ${star} 星`}
                              onClick={() => slot.run && onRateRun(slot.run.id, star)}
                              className="p-0.5 cursor-pointer"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  active
                                    ? 'fill-[#D97706] text-[#D97706]'
                                    : 'text-slate-300 dark:text-slate-700'
                                }`}
                                aria-hidden="true"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {slot.run.reasoningText && (
                      <details className="bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded p-2.5 text-xs">
                        <summary className="font-medium text-amber-900 dark:text-amber-300 cursor-pointer">
                          展开推理思考过程 ({slot.run.reasoningTokens} tokens)
                        </summary>
                        <pre className="mt-2 font-mono text-amber-950 dark:text-amber-100 whitespace-pre-wrap break-words leading-relaxed">
                          {slot.run.reasoningText}
                        </pre>
                      </details>
                    )}

                    <pre className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words max-h-64 overflow-y-auto leading-relaxed">
                      {slot.run.outputText}
                    </pre>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
