import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApiProvider,
  BenchmarkPrompt,
  BenchmarkRunResult,
  BenchmarkTestSuite,
  HeaderParam,
  ModelConfig,
  NavTab,
  ReasoningEffort,
  ReasoningMappingMode,
} from './types/benchmark';
import {
  DEFAULT_GLOBAL_HEADERS,
  DEFAULT_MODELS,
  DEFAULT_PROVIDERS,
  DEFAULT_TEST_SUITES,
  SEED_BENCHMARK_RUNS,
} from './data/seedData';
import { executeBenchmarkRun } from './services/clientRunner';
import { parseExtraJson } from './utils/metrics';
import { TopNav } from './components/TopNav';
import { WorkbenchView } from './components/WorkbenchView';
import { ProvidersView } from './components/ProvidersView';
import { TestSuitesView } from './components/TestSuitesView';
import { ReportsView } from './components/ReportsView';
import { HistoryView } from './components/HistoryView';
import { McpView } from './components/McpView';

const STORAGE_KEYS = {
  providers: 'tokenlab_providers_v2',
  models: 'tokenlab_models_v2',
  testSuites: 'tokenlab_test_suites_v2',
  runs: 'tokenlab_runs_v2',
  globalHeaders: 'tokenlab_global_headers_v2',
  globalExtraBody: 'tokenlab_global_extra_body_v2',
  theme: 'tokenlab_theme_v1',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('workbench');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.theme);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // ignore
    }
    return 'light';
  });

  const [providers, setProviders] = useState<ApiProvider[]>(() =>
    loadFromStorage(STORAGE_KEYS.providers, DEFAULT_PROVIDERS)
  );
  const [models, setModels] = useState<ModelConfig[]>(() =>
    loadFromStorage(STORAGE_KEYS.models, DEFAULT_MODELS)
  );
  const [testSuites, setTestSuites] = useState<BenchmarkTestSuite[]>(() => {
    const saved = loadFromStorage<BenchmarkTestSuite[]>(
      STORAGE_KEYS.testSuites,
      DEFAULT_TEST_SUITES
    );
    const builtinMap = new Map(DEFAULT_TEST_SUITES.map((s) => [s.id, s]));

    const refreshedSaved = saved.map((suite) => {
      if (suite.id === 'suite-openviking-memory') {
        const serialized = JSON.stringify(suite);
        if (!serialized.includes('lab.example.invalid')) {
          return builtinMap.get('suite-openviking-memory') ?? suite;
        }
      }
      return suite;
    });

    const savedIds = new Set(refreshedSaved.map((s) => s.id));
    const missingBuiltins = DEFAULT_TEST_SUITES.filter(
      (d) => !savedIds.has(d.id)
    );
    return missingBuiltins.length > 0
      ? [...missingBuiltins, ...refreshedSaved]
      : refreshedSaved;
  });
  const [runs, setRuns] = useState<BenchmarkRunResult[]>(() =>
    loadFromStorage(STORAGE_KEYS.runs, SEED_BENCHMARK_RUNS)
  );
  const [globalHeaders, setGlobalHeaders] = useState<HeaderParam[]>(() =>
    loadFromStorage(STORAGE_KEYS.globalHeaders, DEFAULT_GLOBAL_HEADERS)
  );
  const [globalExtraBodyJson, setGlobalExtraBodyJson] = useState<string>(() =>
    loadFromStorage(STORAGE_KEYS.globalExtraBody, '{\n  "temperature": 0.2\n}')
  );

  const [selectedModelIds, setSelectedModelIds] = useState<string[]>(() =>
    models.filter((m) => m.enabled).map((m) => m.id)
  );
  const [selectedEfforts, setSelectedEfforts] = useState<ReasoningEffort[]>([
    'low',
    'medium',
    'high',
  ]);
  const [selectedSuiteId, setSelectedSuiteId] = useState<string>(
    () => testSuites[0]?.id ?? DEFAULT_TEST_SUITES[0].id
  );
  const [useCustomPrompt, setUseCustomPrompt] = useState(false);
  const [customPromptText, setCustomPromptText] = useState('');
  const [requireJson, setRequireJson] = useState(false);
  const [iterations, setIterations] = useState(1);

  const [activeRunId, setActiveRunId] = useState<string | null>(
    () => runs[0]?.id ?? null
  );
  const [isRunning, setIsRunning] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(STORAGE_KEYS.theme, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.providers, JSON.stringify(providers));
    } catch {
      // ignore
    }
  }, [providers]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.models, JSON.stringify(models));
    } catch {
      // ignore
    }
  }, [models]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.testSuites, JSON.stringify(testSuites));
    } catch {
      // ignore
    }
  }, [testSuites]);

  useEffect(() => {
    try {
      const finishedOnly = runs.filter((r) => r.status !== 'running');
      localStorage.setItem(
        STORAGE_KEYS.runs,
        JSON.stringify(finishedOnly.slice(0, 120))
      );
    } catch {
      // ignore
    }
  }, [runs]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.globalHeaders,
        JSON.stringify(globalHeaders)
      );
    } catch {
      // ignore
    }
  }, [globalHeaders]);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.globalExtraBody,
        JSON.stringify(globalExtraBodyJson)
      );
    } catch {
      // ignore
    }
  }, [globalExtraBodyJson]);

  const activeSuite = useMemo(
    () =>
      testSuites.find((s) => s.id === selectedSuiteId) ??
      testSuites[0] ??
      DEFAULT_TEST_SUITES[0],
    [testSuites, selectedSuiteId]
  );

  const activeCases: BenchmarkPrompt[] = useMemo(() => {
    if (!useCustomPrompt) return activeSuite.cases;
    return [
      {
        id: 'prompt-custom',
        title: '自定义测试 Prompt',
        category: 'custom',
        systemPrompt: activeSuite.cases[0]?.systemPrompt ?? '',
        userPrompt: customPromptText,
        requireJson,
        expectedKeywords: [],
        minChars: 40,
      },
    ];
  }, [activeSuite, useCustomPrompt, customPromptText, requireJson]);

  const toggleModel = (id: string) => {
    setValidationError(null);
    setSelectedModelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleEffort = (effort: ReasoningEffort) => {
    setValidationError(null);
    setSelectedEfforts((prev) =>
      prev.includes(effort)
        ? prev.filter((x) => x !== effort)
        : [...prev, effort]
    );
  };

  const handleAddProvider = (): ApiProvider => {
    const newProv: ApiProvider = {
      id: `prov-${Date.now()}`,
      name: `自定义提供商 ${providers.length + 1}`,
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      format: 'openai-chat',
      customHeaders: [],
    };
    setProviders((prev) => [...prev, newProv]);
    return newProv;
  };

  const handleUpdateProvider = (id: string, patch: Partial<ApiProvider>) => {
    setProviders((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );
  };

  const handleDeleteProvider = (id: string) => {
    setProviders((prev) => prev.filter((p) => p.id !== id));
    setModels((prev) => {
      const removedIds = new Set(
        prev.filter((m) => m.providerId === id).map((m) => m.id)
      );
      setSelectedModelIds((sel) => sel.filter((mid) => !removedIds.has(mid)));
      return prev.filter((m) => m.providerId !== id);
    });
  };

  const handleAddModel = (providerId: string): ModelConfig => {
    const countUnderProv = models.filter((m) => m.providerId === providerId).length;
    const newModel: ModelConfig = {
      id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      providerId,
      name: `新模型 ${countUnderProv + 1}`,
      modelId: 'inclusionai/ling-3.2-flash:free',
      reasoningMapping: 'reasoning.effort',
      customReasoningPath: 'reasoning.effort',
      customEffortValues: {},
      customHeaders: [],
      extraBodyJson: '{}',
      enabled: true,
    };
    setModels((prev) => [...prev, newModel]);
    setSelectedModelIds((prev) => [...prev, newModel.id]);
    return newModel;
  };

  const handleAddModelsBatch = (
    providerId: string,
    items: Array<{
      modelId: string;
      name: string;
      reasoningMapping: ReasoningMappingMode;
    }>
  ): ModelConfig[] => {
    const baseTs = Date.now();
    const existingIds = new Set(
      models
        .filter((m) => m.providerId === providerId)
        .map((m) => m.modelId.trim())
    );
    const created: ModelConfig[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const trimmedId = item.modelId.trim();
      if (!trimmedId || existingIds.has(trimmedId)) continue;
      existingIds.add(trimmedId);
      created.push({
        id: `mod-${baseTs}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        providerId,
        name: item.name.trim() || trimmedId,
        modelId: trimmedId,
        reasoningMapping: item.reasoningMapping,
        customReasoningPath:
          item.reasoningMapping === 'thinking_budget'
            ? 'thinking.budget_tokens'
            : item.reasoningMapping === 'reasoning_effort'
              ? 'reasoning_effort'
              : 'reasoning.effort',
        customEffortValues: {},
        customHeaders: [],
        extraBodyJson: '{}',
        enabled: true,
      });
    }
    if (created.length > 0) {
      setModels((prev) => [...prev, ...created]);
      setSelectedModelIds((prev) => [
        ...prev,
        ...created.map((m) => m.id),
      ]);
    }
    return created;
  };

  const handleUpdateModel = (id: string, patch: Partial<ModelConfig>) => {
    setModels((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  };

  const handleDuplicateModel = (id: string): ModelConfig => {
    const src = models.find((m) => m.id === id) ?? models[0];
    const copy: ModelConfig = {
      ...src,
      id: `mod-${Date.now()}`,
      name: `${src.name} (副本)`,
      customEffortValues: { ...src.customEffortValues },
      customHeaders: src.customHeaders.map((h) => ({
        ...h,
        id: `mh-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      })),
    };
    setModels((prev) => [...prev, copy]);
    return copy;
  };

  const handleDeleteModel = (id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id));
    setSelectedModelIds((prev) => prev.filter((x) => x !== id));
  };

  const handleAddSuite = (): BenchmarkTestSuite => {
    const ts = Date.now();
    const newSuite: BenchmarkTestSuite = {
      id: `suite-${ts}`,
      name: `自定义测试集 ${testSuites.length + 1}`,
      category: 'custom',
      description: '',
      cases: [
        {
          id: `case-${ts}-1`,
          title: '默认测试用例',
          category: 'custom',
          systemPrompt: '',
          userPrompt: '',
          requireJson: false,
          expectedKeywords: [],
          minChars: 120,
        },
      ],
    };
    setTestSuites((prev) => [...prev, newSuite]);
    return newSuite;
  };

  const handleUpdateSuite = (id: string, patch: Partial<BenchmarkTestSuite>) => {
    setTestSuites((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  };

  const handleDuplicateSuite = (id: string): BenchmarkTestSuite => {
    const src = testSuites.find((s) => s.id === id) ?? testSuites[0];
    const ts = Date.now();
    const copy: BenchmarkTestSuite = {
      ...src,
      id: `suite-${ts}`,
      name: `${src.name} (副本)`,
      cases: src.cases.map((c, idx) => ({
        ...c,
        id: `case-${ts}-${idx + 1}`,
        expectedKeywords: [...c.expectedKeywords],
      })),
    };
    setTestSuites((prev) => [...prev, copy]);
    return copy;
  };

  const handleDeleteSuite = (id: string) => {
    setTestSuites((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (selectedSuiteId === id && next[0]) {
        setSelectedSuiteId(next[0].id);
      }
      return next;
    });
  };

  const handleResetDefaultSuites = () => {
    setTestSuites((prev) => {
      const existingIds = new Set(prev.map((s) => s.id));
      const missing = DEFAULT_TEST_SUITES.filter((d) => !existingIds.has(d.id));
      return missing.length > 0 ? [...prev, ...missing] : DEFAULT_TEST_SUITES;
    });
  };

  const handleSaveCustomAsSuite = () => {
    const trimmed = customPromptText.trim();
    if (!trimmed) return;
    const ts = Date.now();
    const titleSnippet =
      trimmed.replace(/\s+/g, ' ').slice(0, 24) +
      (trimmed.length > 24 ? '…' : '');
    const created: BenchmarkTestSuite = {
      id: `suite-${ts}`,
      name: `快捷测试集 · ${titleSnippet}`,
      category: 'custom',
      description: '从测试工作台临时文本保存',
      cases: [
        {
          id: `case-${ts}-1`,
          title: titleSnippet,
          category: 'custom',
          systemPrompt: '',
          userPrompt: trimmed,
          requireJson,
          expectedKeywords: [],
          minChars: 80,
        },
      ],
    };
    setTestSuites((prev) => [created, ...prev]);
    setSelectedSuiteId(created.id);
    setUseCustomPrompt(false);
  };

  const handleStopBenchmark = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsRunning(false);
    setProgressText('');
  };

  const handleStartBenchmark = async () => {
    setValidationError(null);

    const readyModels = models
      .map((model) => ({
        model,
        provider: providers.find((p) => p.id === model.providerId),
      }))
      .filter(
        (pair): pair is { model: ModelConfig; provider: ApiProvider } =>
          Boolean(
            pair.provider &&
              pair.provider.apiKey.trim() &&
              selectedModelIds.includes(pair.model.id)
          )
      );

    if (readyModels.length === 0) {
      setValidationError(
        '请先在「提供商与模型」填写至少一个提供商的 API Key，并在左侧勾选要测试的模型。'
      );
      return;
    }
    if (selectedEfforts.length === 0) {
      setValidationError('请至少选择一个 Reasoning Effort 思考程度。');
      return;
    }
    if (useCustomPrompt && !customPromptText.trim()) {
      setValidationError('已启用自定义 Prompt，请输入测试提示词文本。');
      return;
    }

    const globalJsonCheck = parseExtraJson(globalExtraBodyJson);
    if (!globalJsonCheck.ok) {
      setValidationError(`全局额外 Body 参数无效：${globalJsonCheck.error}`);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsRunning(true);

    const queue: Array<{
      provider: ApiProvider;
      model: ModelConfig;
      effort: ReasoningEffort;
      promptCase: BenchmarkPrompt;
      iter: number;
    }> = [];
    for (let iter = 1; iter <= iterations; iter += 1) {
      for (const pair of readyModels) {
        for (const effort of selectedEfforts) {
          for (const promptCase of activeCases) {
            queue.push({
              provider: pair.provider,
              model: pair.model,
              effort,
              promptCase,
              iter,
            });
          }
        }
      }
    }

    const batchId = `batch-${Date.now()}`;
    let completedCount = 0;

    for (const job of queue) {
      if (controller.signal.aborted) break;
      completedCount += 1;
      setProgressText(`${completedCount}/${queue.length}`);

      await executeBenchmarkRun({
        batchId,
        provider: job.provider,
        model: job.model,
        prompt: job.promptCase,
        reasoningEffort: job.effort,
        globalHeaders,
        globalExtraBodyJson,
        abortSignal: controller.signal,
        onProgress: (partial) => {
          setActiveRunId(partial.id);
          setRuns((prev) => {
            const exists = prev.some((r) => r.id === partial.id);
            if (exists) {
              return prev.map((r) => (r.id === partial.id ? partial : r));
            }
            return [partial, ...prev];
          });
        },
      });
    }

    setIsRunning(false);
    setProgressText('');
    abortControllerRef.current = null;
  };

  const handleRateRun = (runId: string, rating: number) => {
    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              quality: {
                ...r.quality,
                manualRating: rating,
              },
            }
          : r
      )
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#0B1120] text-[#0F172A] dark:text-slate-100 transition-colors">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
        }
      />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'workbench' && (
          <WorkbenchView
            providers={providers}
            models={models}
            selectedModelIds={selectedModelIds}
            onToggleModel={toggleModel}
            selectedEfforts={selectedEfforts}
            onToggleEffort={toggleEffort}
            testSuites={testSuites}
            selectedSuiteId={selectedSuiteId}
            onSelectSuiteId={setSelectedSuiteId}
            customPromptText={customPromptText}
            onChangeCustomPromptText={setCustomPromptText}
            useCustomPrompt={useCustomPrompt}
            onToggleCustomPrompt={setUseCustomPrompt}
            requireJson={requireJson}
            onChangeRequireJson={setRequireJson}
            onSaveCustomAsSuite={handleSaveCustomAsSuite}
            iterations={iterations}
            onChangeIterations={setIterations}
            globalHeaders={globalHeaders}
            onChangeGlobalHeaders={setGlobalHeaders}
            globalExtraBodyJson={globalExtraBodyJson}
            onChangeGlobalExtraBodyJson={setGlobalExtraBodyJson}
            runs={runs}
            activeRunId={activeRunId}
            onSelectRunId={setActiveRunId}
            isRunning={isRunning}
            progressText={progressText}
            validationError={validationError}
            onStartBenchmark={handleStartBenchmark}
            onStopBenchmark={handleStopBenchmark}
          />
        )}

        {activeTab === 'providers' && (
          <ProvidersView
            providers={providers}
            models={models}
            onAddProvider={handleAddProvider}
            onUpdateProvider={handleUpdateProvider}
            onDeleteProvider={handleDeleteProvider}
            onAddModel={handleAddModel}
            onAddModelsBatch={handleAddModelsBatch}
            onUpdateModel={handleUpdateModel}
            onDuplicateModel={handleDuplicateModel}
            onDeleteModel={handleDeleteModel}
            samplePrompt={activeCases[0] ?? DEFAULT_TEST_SUITES[0].cases[0]}
            globalHeaders={globalHeaders}
            globalExtraBodyJson={globalExtraBodyJson}
          />
        )}

        {activeTab === 'prompts' && (
          <TestSuitesView
            testSuites={testSuites}
            selectedSuiteId={selectedSuiteId}
            onAddSuite={handleAddSuite}
            onUpdateSuite={handleUpdateSuite}
            onDuplicateSuite={handleDuplicateSuite}
            onDeleteSuite={handleDeleteSuite}
            onResetDefaultSuites={handleResetDefaultSuites}
            onUseSuiteInWorkbench={(id) => {
              setSelectedSuiteId(id);
              setUseCustomPrompt(false);
              setActiveTab('workbench');
            }}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView runs={runs} onRateRun={handleRateRun} />
        )}

        {activeTab === 'history' && (
          <HistoryView
            runs={runs}
            onDeleteRun={(id) =>
              setRuns((prev) => prev.filter((r) => r.id !== id))
            }
            onClearRuns={() => setRuns([])}
            onResetSeedRuns={() => setRuns(SEED_BENCHMARK_RUNS)}
          />
        )}

        {activeTab === 'mcp' && (
          <McpView
            providers={providers}
            models={models}
            testSuites={testSuites}
            runs={runs}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>TokenLab · 客户端直连大模型 API 基准测试工作台</span>
          <span>所有请求与密钥仅保存在本地浏览器，不经过中转服务器</span>
        </div>
      </footer>
    </div>
  );
}
