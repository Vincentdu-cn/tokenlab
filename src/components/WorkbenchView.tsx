import { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Loader2,
  Play,
  Plus,
  SlidersHorizontal,
  Square,
  Trash2,
} from 'lucide-react';
import type {
  ApiProvider,
  BenchmarkPrompt,
  BenchmarkRunResult,
  BenchmarkTestSuite,
  HeaderParam,
  ModelConfig,
  ReasoningEffort,
} from '../types/benchmark';
import {
  ALL_REASONING_EFFORTS,
  buildRequestConfig,
  maskSecretHeaders,
  parseExtraJson,
  REASONING_EFFORT_LABELS,
} from '../utils/metrics';
import { KpiStrip } from './KpiStrip';
import { TokenVelocityChart } from './Charts';

interface WorkbenchViewProps {
  providers: ApiProvider[];
  models: ModelConfig[];
  selectedModelIds: string[];
  onToggleModel: (id: string) => void;
  selectedEfforts: ReasoningEffort[];
  onToggleEffort: (effort: ReasoningEffort) => void;
  testSuites: BenchmarkTestSuite[];
  selectedSuiteId: string;
  onSelectSuiteId: (id: string) => void;
  customPromptText: string;
  onChangeCustomPromptText: (val: string) => void;
  useCustomPrompt: boolean;
  onToggleCustomPrompt: (val: boolean) => void;
  requireJson: boolean;
  onChangeRequireJson: (val: boolean) => void;
  onSaveCustomAsSuite: () => void;
  iterations: number;
  onChangeIterations: (n: number) => void;
  globalHeaders: HeaderParam[];
  onChangeGlobalHeaders: (headers: HeaderParam[]) => void;
  globalExtraBodyJson: string;
  onChangeGlobalExtraBodyJson: (json: string) => void;
  runs: BenchmarkRunResult[];
  activeRunId: string | null;
  onSelectRunId: (id: string) => void;
  isRunning: boolean;
  progressText: string;
  validationError: string | null;
  onStartBenchmark: () => void;
  onStopBenchmark: () => void;
}

export function WorkbenchView(props: WorkbenchViewProps) {
  const {
    providers,
    models,
    selectedModelIds,
    onToggleModel,
    selectedEfforts,
    onToggleEffort,
    testSuites,
    selectedSuiteId,
    onSelectSuiteId,
    customPromptText,
    onChangeCustomPromptText,
    useCustomPrompt,
    onToggleCustomPrompt,
    requireJson,
    onChangeRequireJson,
    onSaveCustomAsSuite,
    iterations,
    onChangeIterations,
    globalHeaders,
    onChangeGlobalHeaders,
    globalExtraBodyJson,
    onChangeGlobalExtraBodyJson,
    runs,
    activeRunId,
    onSelectRunId,
    isRunning,
    progressText,
    validationError,
    onStartBenchmark,
    onStopBenchmark,
  } = props;

  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [sortBy, setSortBy] = useState<'latest' | 'ttft' | 'tps' | 'quality'>('latest');

  // Filter out models whose parent provider has no API Key configured
  const readyModels = useMemo(() => {
    return models
      .map((model) => ({
        model,
        provider: providers.find((p) => p.id === model.providerId),
      }))
      .filter(
        (pair): pair is { model: ModelConfig; provider: ApiProvider } =>
          Boolean(pair.provider && pair.provider.apiKey.trim())
      );
  }, [models, providers]);

  const activeSelectedCount = useMemo(
    () =>
      readyModels.filter(({ model }) => selectedModelIds.includes(model.id))
        .length,
    [readyModels, selectedModelIds]
  );

  const activeSuite = useMemo(
    () => testSuites.find((s) => s.id === selectedSuiteId) ?? testSuites[0],
    [testSuites, selectedSuiteId]
  );

  const activeCases: BenchmarkPrompt[] = useMemo(() => {
    const baseCase = activeSuite?.cases[0];
    if (!useCustomPrompt) {
      return activeSuite?.cases ?? [];
    }
    return [
      {
        id: 'prompt-custom',
        title: '自定义测试 Prompt',
        category: activeSuite?.category ?? 'custom',
        systemPrompt: baseCase?.systemPrompt ?? '',
        userPrompt: customPromptText,
        requireJson,
        expectedKeywords: [],
        minChars: 40,
      },
    ];
  }, [activeSuite, useCustomPrompt, customPromptText, requireJson]);

  const activePrompt = activeCases[0] ?? null;

  const jsonValidation = useMemo(
    () => parseExtraJson(globalExtraBodyJson),
    [globalExtraBodyJson]
  );

  const previewPair = useMemo(() => {
    return (
      readyModels.find(({ model }) => selectedModelIds.includes(model.id)) ??
      readyModels[0] ??
      (models[0]
        ? {
            model: models[0],
            provider: providers.find((p) => p.id === models[0].providerId),
          }
        : null)
    );
  }, [readyModels, selectedModelIds, models, providers]);

  const previewEffort = selectedEfforts[0] ?? 'medium';

  const payloadPreview = useMemo(() => {
    if (!previewPair?.provider || !previewPair?.model || !activePrompt) {
      return null;
    }
    return buildRequestConfig({
      provider: previewPair.provider,
      model: previewPair.model,
      prompt: activePrompt,
      reasoningEffort: previewEffort,
      globalHeaders,
      globalExtraBodyJson,
      requireAuth: false,
    });
  }, [
    previewPair,
    activePrompt,
    previewEffort,
    globalHeaders,
    globalExtraBodyJson,
  ]);

  const inspectedRun = useMemo(() => {
    if (activeRunId) {
      const found = runs.find((r) => r.id === activeRunId);
      if (found) return found;
    }
    return runs[0] ?? null;
  }, [runs, activeRunId]);

  const sortedRuns = useMemo(() => {
    const copy = [...runs];
    if (sortBy === 'ttft') {
      return copy.sort((a, b) => (a.ttftMs || 999999) - (b.ttftMs || 999999));
    }
    if (sortBy === 'tps') {
      return copy.sort((a, b) => b.outputTps - a.outputTps);
    }
    if (sortBy === 'quality') {
      return copy.sort((a, b) => b.quality.overallScore - a.quality.overallScore);
    }
    return copy;
  }, [runs, sortBy]);

  const totalMatrixJobs =
    activeSelectedCount *
    selectedEfforts.length *
    Math.max(1, activeCases.length) *
    iterations;

  const addGlobalHeader = () => {
    onChangeGlobalHeaders([
      ...globalHeaders,
      {
        id: `gh-${Date.now()}`,
        key: '',
        value: '',
        enabled: true,
      },
    ]);
  };

  const updateGlobalHeader = (id: string, patch: Partial<HeaderParam>) => {
    onChangeGlobalHeaders(
      globalHeaders.map((h) => (h.id === id ? { ...h, ...patch } : h))
    );
  };

  const removeGlobalHeader = (id: string) => {
    onChangeGlobalHeaders(globalHeaders.filter((h) => h.id !== id));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
          客户端直连 API 基准测试台
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          所有请求由当前浏览器直接发起 (`window.fetch` + 流式微秒计时)，客观测量网络首字延迟、推理耗时、吞吐量与响应质量。
        </p>
      </div>

      <KpiStrip runs={runs} />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Configuration Column */}
        <section
          aria-label="测试参数配置"
          className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <SlidersHorizontal
                className="w-4 h-4 text-slate-500 dark:text-slate-400"
                aria-hidden="true"
              />
              <span>基准矩阵配置</span>
            </h2>
            <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
              {totalMatrixJobs} 次任务
            </span>
          </div>

          {/* Model Selection — strictly models whose provider has API Key */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                就绪模型 ({activeSelectedCount}/{readyModels.length})
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                仅显示已配置 Key 模型
              </span>
            </div>

            {readyModels.length === 0 ? (
              <div className="p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-md bg-slate-50/70 dark:bg-slate-950/50 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                暂无可直连的模型。请通过顶部导航「提供商与模型」为至少一个提供商填入 API Key 后即可在此勾选测试。
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-md">
                {readyModels.map(({ model, provider }) => {
                  const checked = selectedModelIds.includes(model.id);
                  return (
                    <label
                      key={model.id}
                      className="flex items-start gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleModel(model.id)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#2563EB] focus:ring-[#2563EB]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                          {model.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
                          {provider.name} · {model.modelId} · {model.reasoningMapping}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Reasoning Effort Multi-Select (with Max!) */}
          <div className="space-y-2">
            <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Reasoning Effort 思考程度 (支持多选扫描)
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {ALL_REASONING_EFFORTS.map((effort) => {
                const active = selectedEfforts.includes(effort);
                return (
                  <button
                    key={effort}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onToggleEffort(effort)}
                    className={`py-1.5 px-2 text-xs font-mono rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[#2563EB] text-white border-[#2563EB]'
                        : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {REASONING_EFFORT_LABELS[effort]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Test Suite Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                htmlFor="benchmark-prompt-select"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                测试集
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useCustomPrompt}
                  onChange={(e) => onToggleCustomPrompt(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-[#2563EB]"
                />
                <span>临时文本</span>
              </label>
            </div>

            {!useCustomPrompt ? (
              <div className="space-y-1">
                <select
                  id="benchmark-prompt-select"
                  value={activeSuite?.id ?? ''}
                  onChange={(e) => onSelectSuiteId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  {testSuites.map((s) => (
                    <option key={s.id} value={s.id}>
                      [{s.category}] {s.name}
                      {s.cases.length > 1 ? ` (${s.cases.length} 条用例)` : ''}
                    </option>
                  ))}
                </select>
                {activeSuite && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {activeSuite.cases.length} 条用例
                    {activeSuite.cases[0]?.requireJson ? ' · 校验 JSON' : ''}
                    {activeSuite.description ? ` · ${activeSuite.description}` : ''}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  aria-label="自定义测试 Prompt 内容"
                  rows={3}
                  value={customPromptText}
                  onChange={(e) => onChangeCustomPromptText(e.target.value)}
                  placeholder="输入要测试的 Prompt 内容..."
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requireJson}
                      onChange={(e) => onChangeRequireJson(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-[#2563EB]"
                    />
                    <span>校验合法 JSON</span>
                  </label>
                  <button
                    type="button"
                    disabled={!customPromptText.trim()}
                    onClick={onSaveCustomAsSuite}
                    className="text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    保存为新测试集
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Iterations */}
          <div className="flex items-center justify-between">
            <label
              htmlFor="iterations-select"
              className="text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              每组配置重复轮次 (用于 P95 统计)
            </label>
            <select
              id="iterations-select"
              value={iterations}
              onChange={(e) => onChangeIterations(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
            >
              <option value={1}>1 次</option>
              <option value={2}>2 次</option>
              <option value={3}>3 次</option>
              <option value={5}>5 次</option>
            </select>
          </div>

          {/* Global Custom Headers */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                全局自定义 Headers
              </span>
              <button
                type="button"
                onClick={addGlobalHeader}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>添加 Header</span>
              </button>
            </div>

            {globalHeaders.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                暂无全局额外 Header。
              </p>
            ) : (
              <div className="space-y-1.5">
                {globalHeaders.map((h) => (
                  <div key={h.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      aria-label={`启用 Header ${h.key || '未命名'}`}
                      checked={h.enabled}
                      onChange={(e) =>
                        updateGlobalHeader(h.id, { enabled: e.target.checked })
                      }
                      className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-[#2563EB]"
                    />
                    <input
                      type="text"
                      aria-label="Header Key"
                      value={h.key}
                      onChange={(e) =>
                        updateGlobalHeader(h.id, { key: e.target.value })
                      }
                      placeholder="Key"
                      className="w-2/5 px-2 py-1 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="text"
                      aria-label="Header Value"
                      value={h.value}
                      onChange={(e) =>
                        updateGlobalHeader(h.id, { value: e.target.value })
                      }
                      placeholder="Value"
                      className="flex-1 min-w-0 px-2 py-1 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      aria-label={`删除 Header ${h.key || '未命名'}`}
                      onClick={() => removeGlobalHeader(h.id)}
                      className="p-1 text-slate-400 hover:text-[#DC2626] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Global Extra Body JSON */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="global-extra-body"
                className="text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                全局额外 Body 参数 (JSON 合并)
              </label>
              <button
                type="button"
                onClick={() => setShowPayloadPreview((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{showPayloadPreview ? '隐藏预览' : '预览请求'}</span>
              </button>
            </div>
            <textarea
              id="global-extra-body"
              rows={3}
              value={globalExtraBodyJson}
              onChange={(e) => onChangeGlobalExtraBodyJson(e.target.value)}
              placeholder='例如: {"temperature": 0.2, "top_p": 0.9}'
              className={`w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                jsonValidation.ok
                  ? 'border-slate-200 dark:border-slate-700 focus:ring-[#2563EB]'
                  : 'border-[#DC2626] focus:ring-[#DC2626]'
              }`}
            />
            {!jsonValidation.ok && (
              <p role="alert" className="text-xs text-[#DC2626] flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{jsonValidation.error}</span>
              </p>
            )}
          </div>

          {showPayloadPreview && payloadPreview && (
            <div className="p-3 bg-slate-900 dark:bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-[11px] font-mono overflow-x-auto space-y-2">
              <div className="text-slate-400">
                预览 ({previewPair?.model.name} · effort={previewEffort})
              </div>
              {payloadPreview.ok ? (
                <>
                  <div className="text-sky-300 break-all">
                    POST {payloadPreview.url}
                  </div>
                  <pre className="text-slate-300 whitespace-pre-wrap break-all">
                    {JSON.stringify(
                      {
                        headers: maskSecretHeaders(payloadPreview.headers),
                        body: payloadPreview.body,
                      },
                      null,
                      2
                    )}
                  </pre>
                </>
              ) : (
                <div className="text-rose-400">{payloadPreview.error}</div>
              )}
            </div>
          )}

          {validationError && (
            <div
              role="alert"
              className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-md text-xs text-[#DC2626] dark:text-rose-400 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{validationError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={isRunning ? onStopBenchmark : onStartBenchmark}
            className={`w-full py-2.5 px-4 text-xs font-semibold rounded-md flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              isRunning
                ? 'bg-[#DC2626] text-white hover:bg-[#B91C1C]'
                : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
            }`}
          >
            {isRunning ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>中止执行 ({progressText})</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>发起客户端直连基准 ({totalMatrixJobs} 组)</span>
              </>
            )}
          </button>
        </section>

        {/* Right Live Telemetry & Results Column */}
        <div className="lg:col-span-8 space-y-6">
          <section
            aria-label="实时流式监视器"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {inspectedRun
                    ? `${inspectedRun.modelName} · 实时遥测检视`
                    : '实时流式监视器'}
                </h2>
                {inspectedRun && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                    {inspectedRun.providerName} · {inspectedRun.modelId} · effort=
                    {inspectedRun.reasoningEffort} · {inspectedRun.promptTitle}
                  </p>
                )}
              </div>

              {inspectedRun && (
                <div className="flex items-center gap-2 text-xs font-medium">
                  {inspectedRun.status === 'running' && (
                    <span className="inline-flex items-center gap-1.5 text-[#2563EB] dark:text-blue-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>流式接收中</span>
                    </span>
                  )}
                  {inspectedRun.status === 'completed' && (
                    <span className="inline-flex items-center gap-1.5 text-[#16A34A] dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>已完成</span>
                    </span>
                  )}
                  {inspectedRun.status === 'error' && (
                    <span className="inline-flex items-center gap-1.5 text-[#DC2626] dark:text-rose-400">
                      <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>请求失败</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {inspectedRun ? (
              <>
                {inspectedRun.status === 'error' && inspectedRun.errorMessage && (
                  <div
                    role="alert"
                    className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-md text-xs text-[#DC2626] dark:text-rose-400"
                  >
                    {inspectedRun.errorMessage}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      TTFT 首字延迟
                    </div>
                    <div className="font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-100">
                      {inspectedRun.ttftMs.toFixed(0)} ms
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Thinking 耗时
                    </div>
                    <div className="font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-100">
                      {(inspectedRun.thinkingDurationMs / 1000).toFixed(2)} s
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Output TPS
                    </div>
                    <div className="font-mono tabular-nums text-base font-semibold text-[#2563EB] dark:text-blue-400">
                      {inspectedRun.outputTps.toFixed(1)} tok/s
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tokens (推理/输出)
                    </div>
                    <div className="font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-100">
                      {inspectedRun.reasoningTokens} / {inspectedRun.outputTokens}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      质量自动评分
                    </div>
                    <div className="font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-100">
                      {inspectedRun.quality.overallScore} / 100
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 bg-slate-50/50 dark:bg-slate-950/50">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                      流式瞬时吞吐波动 (tok/s)
                    </div>
                    <TokenVelocityChart run={inspectedRun} />
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-md p-3 bg-slate-50/50 dark:bg-slate-950/50 flex flex-col gap-2 max-h-[260px] overflow-y-auto">
                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between">
                      <span>实时输出流 (Reasoning + Content)</span>
                      <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                        TPOT {inspectedRun.tpotMs.toFixed(2)} ms
                      </span>
                    </div>
                    {inspectedRun.reasoningText && (
                      <div className="p-2 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded text-xs text-amber-950 dark:text-amber-200 font-mono whitespace-pre-wrap">
                        <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-400 mb-1">
                          Reasoning Trace
                        </div>
                        {inspectedRun.reasoningText}
                      </div>
                    )}
                    <pre className="text-xs text-slate-800 dark:text-slate-200 font-mono whitespace-pre-wrap break-words leading-relaxed">
                      {inspectedRun.outputText || '等待首个响应分片...'}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                配置模型与推理强度后，点击左侧「发起客户端直连基准」查看实时遥测。
              </div>
            )}
          </section>

          {/* Telemetry Results Table */}
          <section
            aria-label="基准测试遥测明细表"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                  遥测明细表
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  点击任意行切换上方实时波形与输出详情 ({runs.length} 条记录)
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
                {(
                  [
                    { id: 'latest', label: '最新' },
                    { id: 'ttft', label: 'TTFT 最快' },
                    { id: 'tps', label: '吞吐最高' },
                    { id: 'quality', label: '质量最高' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setSortBy(opt.id)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      sortBy === opt.id
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    <th className="py-2.5 px-4">模型与推理强度</th>
                    <th className="py-2.5 px-3">状态</th>
                    <th className="py-2.5 px-3 text-right">TTFT</th>
                    <th className="py-2.5 px-3 text-right">TPOT</th>
                    <th className="py-2.5 px-3 text-right">Output TPS</th>
                    <th className="py-2.5 px-3 text-right">E2E 总耗时</th>
                    <th className="py-2.5 px-3 text-right">Tokens (推/正)</th>
                    <th className="py-2.5 px-4 text-right">质量分</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {sortedRuns.slice(0, 14).map((run) => {
                    const isSelected = inspectedRun?.id === run.id;
                    return (
                      <tr
                        key={run.id}
                        onClick={() => onSelectRunId(run.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50/60 dark:bg-blue-950/30'
                            : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {run.modelName}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                            {run.providerName} · effort={run.reasoningEffort}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {run.status === 'completed' && (
                            <span className="inline-flex items-center gap-1 text-[#16A34A] dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>完成</span>
                            </span>
                          )}
                          {run.status === 'running' && (
                            <span className="inline-flex items-center gap-1 text-[#2563EB] dark:text-blue-400 font-medium">
                              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                              <span>运行中</span>
                            </span>
                          )}
                          {run.status === 'error' && (
                            <span className="inline-flex items-center gap-1 text-[#DC2626] dark:text-rose-400 font-medium">
                              <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>失败</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                          {run.status === 'error' ? '—' : `${run.ttftMs.toFixed(0)} ms`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {run.status === 'error' ? '—' : `${run.tpotMs.toFixed(2)} ms`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {run.status === 'error' ? '—' : `${run.outputTps.toFixed(1)}`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {run.status === 'error'
                            ? '—'
                            : `${(run.e2eMs / 1000).toFixed(2)} s`}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                          {run.reasoningTokens} / {run.outputTokens}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                          {run.status === 'error' ? '—' : `${run.quality.overallScore}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
