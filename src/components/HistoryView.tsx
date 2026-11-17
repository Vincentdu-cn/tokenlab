import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import type { BenchmarkRunResult } from '../types/benchmark';
import { maskSecretHeaders } from '../utils/metrics';

interface HistoryViewProps {
  runs: BenchmarkRunResult[];
  onDeleteRun: (id: string) => void;
  onClearRuns: () => void;
  onResetSeedRuns: () => void;
}

export function HistoryView({
  runs,
  onDeleteRun,
  onClearRuns,
  onResetSeedRuns,
}: HistoryViewProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'error'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(runs[0]?.id ?? null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runs.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.providerName.toLowerCase().includes(q) ||
        r.modelName.toLowerCase().includes(q) ||
        r.modelId.toLowerCase().includes(q) ||
        r.reasoningEffort.toLowerCase().includes(q) ||
        r.promptTitle.toLowerCase().includes(q)
      );
    });
  }, [runs, query, statusFilter]);

  const inspected = filtered.find((r) => r.id === expandedId) ?? filtered[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            运行历史与请求审计
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            检索每次测试的完整参数快照、HTTP 状态码、错误堆栈与原始输出，所有数据均缓存在本地浏览器。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onResetSeedRuns}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>恢复示例基准数据</span>
          </button>
          <button
            type="button"
            onClick={onClearRuns}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#DC2626] dark:text-rose-400 bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 whitespace-nowrap cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>清空记录</span>
          </button>
        </div>
      </div>

      {/* Search & Status Filter */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="搜索运行历史"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索提供商、模型名称、Effort 或 Prompt..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
          {(
            [
              { id: 'all', label: '全部' },
              { id: 'completed', label: '成功' },
              { id: 'error', label: '失败' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`px-3 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                statusFilter === item.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg py-16 text-center text-sm text-slate-500 dark:text-slate-400">
          未找到匹配的测试记录。
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
            {filtered.map((run) => {
              const selected = inspected?.id === run.id;
              return (
                <div
                  key={run.id}
                  className={`p-4 flex items-start justify-between gap-3 transition-colors ${
                    selected
                      ? 'bg-blue-50/60 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(run.id)}
                    className="text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      {run.status === 'completed' ? (
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-[#16A34A] dark:text-emerald-400 shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <AlertCircle
                          className="w-3.5 h-3.5 text-[#DC2626] dark:text-rose-400 shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {run.modelName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {run.providerName} · effort={run.reasoningEffort}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">
                      {run.promptTitle}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1">
                      {new Date(run.timestamp).toLocaleString()} · TTFT{' '}
                      {run.ttftMs.toFixed(0)}ms · {run.outputTps.toFixed(1)} tok/s
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={`删除记录 ${run.modelName} ${run.id}`}
                    onClick={() => onDeleteRun(run.id)}
                    className="p-1.5 text-slate-400 hover:text-[#DC2626] shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>

          {inspected && (
            <section
              aria-label="单次运行请求与响应详情"
              className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
            >
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {inspected.modelName} · 请求审计详情
                </h2>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                  {inspected.providerName} · ID {inspected.id} · HTTP{' '}
                  {inspected.httpStatus ?? 'N/A'}
                </p>
              </div>

              {inspected.errorMessage && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded text-xs text-[#DC2626] dark:text-rose-400">
                  {inspected.errorMessage}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  请求报文快照 (已脱敏认证头)
                </div>
                <pre className="p-3 bg-slate-900 dark:bg-slate-950 text-slate-100 border border-slate-800 rounded text-[11px] font-mono overflow-x-auto max-h-56 whitespace-pre-wrap break-all">
                  {JSON.stringify(
                    {
                      url: inspected.requestSnapshot.url,
                      headers: maskSecretHeaders(inspected.requestSnapshot.headers),
                      body: inspected.requestSnapshot.body,
                    },
                    null,
                    2
                  )}
                </pre>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  响应正文输出
                </div>
                <pre className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words max-h-56 overflow-y-auto">
                  {inspected.outputText || '(无输出内容)'}
                </pre>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
