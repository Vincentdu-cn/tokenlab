import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Play,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import type {
  BenchmarkPrompt,
  BenchmarkTestSuite,
  PromptCategory,
} from '../types/benchmark';
import {
  estimateTokenCount,
  formatExpectedKeywords,
  parseExpectedKeywords,
  PROMPT_CATEGORY_LABELS,
} from '../utils/metrics';

interface TestSuitesViewProps {
  testSuites: BenchmarkTestSuite[];
  selectedSuiteId: string;
  onAddSuite: () => BenchmarkTestSuite;
  onUpdateSuite: (id: string, patch: Partial<BenchmarkTestSuite>) => void;
  onDuplicateSuite: (id: string) => BenchmarkTestSuite;
  onDeleteSuite: (id: string) => void;
  onResetDefaultSuites: () => void;
  onUseSuiteInWorkbench: (id: string) => void;
}

const CATEGORIES: PromptCategory[] = [
  'extraction',
  'coding',
  'reasoning',
  'synthesis',
  'custom',
];

export function TestSuitesView({
  testSuites,
  selectedSuiteId,
  onAddSuite,
  onUpdateSuite,
  onDuplicateSuite,
  onDeleteSuite,
  onResetDefaultSuites,
  onUseSuiteInWorkbench,
}: TestSuitesViewProps) {
  const [editingSuiteId, setEditingSuiteId] = useState<string>(
    () => selectedSuiteId || testSuites[0]?.id || ''
  );
  const [activeCaseIndex, setActiveCaseIndex] = useState(0);
  const [keywordsDraft, setKeywordsDraft] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const activeSuite =
    testSuites.find((s) => s.id === editingSuiteId) ?? testSuites[0] ?? null;

  const safeCaseIndex =
    activeSuite && activeCaseIndex < activeSuite.cases.length
      ? activeCaseIndex
      : 0;
  const activeCase = activeSuite?.cases[safeCaseIndex] ?? null;

  useEffect(() => {
    if (activeCase) {
      setKeywordsDraft(formatExpectedKeywords(activeCase.expectedKeywords));
    } else {
      setKeywordsDraft('');
    }
  }, [activeSuite?.id, activeCase?.id]);

  const handleSelectSuite = (id: string) => {
    setEditingSuiteId(id);
    setActiveCaseIndex(0);
    setFormError(null);
    setSaveFeedback(null);
  };

  const handleCreateSuite = () => {
    const created = onAddSuite();
    setEditingSuiteId(created.id);
    setActiveCaseIndex(0);
    setFormError(null);
    setSaveFeedback('已新建测试集并保存至本地');
  };

  const handleAddCase = () => {
    if (!activeSuite) return;
    const nextCase: BenchmarkPrompt = {
      id: `case-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: `用例 ${activeSuite.cases.length + 1}`,
      category: activeSuite.category,
      systemPrompt: '',
      userPrompt: '',
      requireJson: false,
      expectedKeywords: [],
      minChars: 120,
    };
    const nextCases = [...activeSuite.cases, nextCase];
    onUpdateSuite(activeSuite.id, { cases: nextCases });
    setActiveCaseIndex(nextCases.length - 1);
    setFormError(null);
  };

  const handleUpdateActiveCase = (patch: Partial<BenchmarkPrompt>) => {
    if (!activeSuite || !activeCase) return;
    const nextCases = activeSuite.cases.map((c, idx) =>
      idx === safeCaseIndex ? { ...c, ...patch } : c
    );
    onUpdateSuite(activeSuite.id, { cases: nextCases });
    setFormError(null);
  };

  const handleDeleteCase = (idx: number) => {
    if (!activeSuite || activeSuite.cases.length <= 1) return;
    const nextCases = activeSuite.cases.filter((_, i) => i !== idx);
    onUpdateSuite(activeSuite.id, { cases: nextCases });
    setActiveCaseIndex(Math.max(0, Math.min(idx, nextCases.length - 1)));
  };

  const validateAndSave = (switchToWorkbench: boolean) => {
    if (!activeSuite) return;
    const trimmedName = activeSuite.name.trim();
    if (!trimmedName) {
      setFormError('请填写测试集名称后再保存。');
      return;
    }
    const emptyCaseIndex = activeSuite.cases.findIndex(
      (c) => !c.userPrompt.trim()
    );
    if (emptyCaseIndex >= 0) {
      setActiveCaseIndex(emptyCaseIndex);
      setFormError(`用例 ${emptyCaseIndex + 1} 的 User Prompt 不能为空。`);
      return;
    }

    onUpdateSuite(activeSuite.id, {
      name: trimmedName,
      cases: activeSuite.cases.map((c, idx) => ({
        ...c,
        title: c.title.trim() || `${trimmedName} · 用例 ${idx + 1}`,
        category: activeSuite.category,
      })),
    });

    setFormError(null);
    if (switchToWorkbench) {
      onUseSuiteInWorkbench(activeSuite.id);
    } else {
      setSaveFeedback('测试集已保存至本地浏览器');
      window.setTimeout(() => setSaveFeedback(null), 2500);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            测试集配置
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            创建、编辑并保存自定义基准测试集，支持单条或多条用例、System/User 提示词以及 JSON 契约与关键词自动评分规则。
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              onResetDefaultSuites();
              setSaveFeedback('已恢复默认预设测试集');
              window.setTimeout(() => setSaveFeedback(null), 2500);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>恢复默认测试集</span>
          </button>

          <button
            type="button"
            onClick={handleCreateSuite}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md hover:bg-[#1D4ED8] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>新建测试集</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Saved Test Suites */}
        <aside className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
          <div className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
            已保存测试集 ({testSuites.length})
          </div>
          {testSuites.map((suite) => {
            const isSelected = activeSuite?.id === suite.id;
            const hasJsonRule = suite.cases.some((c) => c.requireJson);
            const totalKeywords = suite.cases.reduce(
              (acc, c) => acc + c.expectedKeywords.length,
              0
            );

            return (
              <div
                key={suite.id}
                className={`p-3.5 flex items-start justify-between gap-2 transition-colors ${
                  isSelected
                    ? 'bg-blue-50/70 dark:bg-blue-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleSelectSuite(suite.id)}
                  className="text-left min-w-0 flex-1 cursor-pointer"
                >
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {suite.name || '未命名测试集'}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
                    {suite.category} · {suite.cases.length} 条用例
                    {totalKeywords > 0 ? ` · ${totalKeywords} 关键词` : ''}
                    {hasJsonRule ? ' · JSON' : ''}
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    aria-label={`复制测试集 ${suite.name}`}
                    onClick={() => {
                      const copy = onDuplicateSuite(suite.id);
                      setEditingSuiteId(copy.id);
                      setActiveCaseIndex(0);
                    }}
                    className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  {testSuites.length > 1 && (
                    <button
                      type="button"
                      aria-label={`删除测试集 ${suite.name}`}
                      onClick={() => {
                        onDeleteSuite(suite.id);
                        if (activeSuite?.id === suite.id) {
                          const next = testSuites.find((x) => x.id !== suite.id);
                          if (next) handleSelectSuite(next.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-[#DC2626] rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </aside>

        {/* Right Detail Editor */}
        {activeSuite && (
          <div className="lg:col-span-8 space-y-6">
            {/* Test Suite Metadata */}
            <section
              aria-label="测试集基本信息"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  测试集基本信息 · {activeSuite.name || '未命名'}
                </h2>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  更改实时持久化到本地浏览器
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="suite-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    测试集名称
                  </label>
                  <input
                    id="suite-name"
                    type="text"
                    value={activeSuite.name}
                    onChange={(e) => {
                      onUpdateSuite(activeSuite.id, { name: e.target.value });
                      setFormError(null);
                    }}
                    placeholder="例如: SQL 生成与慢查询优化基准"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="suite-category"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    任务分类
                  </label>
                  <select
                    id="suite-category"
                    value={activeSuite.category}
                    onChange={(e) => {
                      const nextCat = e.target.value as PromptCategory;
                      onUpdateSuite(activeSuite.id, {
                        category: nextCat,
                        cases: activeSuite.cases.map((c) => ({
                          ...c,
                          category: nextCat,
                        })),
                      });
                    }}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat} — {PROMPT_CATEGORY_LABELS[cat]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="suite-desc"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    测试集说明（可选）
                  </label>
                  <input
                    id="suite-desc"
                    type="text"
                    value={activeSuite.description}
                    onChange={(e) =>
                      onUpdateSuite(activeSuite.id, {
                        description: e.target.value,
                      })
                    }
                    placeholder="描述测试集考察的推理维度、延迟期望或输出契约..."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>
              </div>
            </section>

            {/* Case Editor */}
            {activeCase && (
              <section
                aria-label="测试用例编辑"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeSuite.cases.map((c, idx) => {
                      const isCaseActive = idx === safeCaseIndex;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setActiveCaseIndex(idx)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                            isCaseActive
                              ? 'bg-[#2563EB] text-white border-[#2563EB]'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          用例 {idx + 1}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={handleAddCase}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-md transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>添加用例</span>
                    </button>
                  </div>

                  {activeSuite.cases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCase(safeCaseIndex)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#DC2626] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>删除当前用例</span>
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="case-title"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      用例标题
                    </label>
                    <input
                      id="case-title"
                      type="text"
                      value={activeCase.title}
                      onChange={(e) =>
                        handleUpdateActiveCase({ title: e.target.value })
                      }
                      placeholder="例如: 复合索引设计并输出 JSON 迁移脚本"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="case-system"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      System Prompt（系统指令，可选）
                    </label>
                    <textarea
                      id="case-system"
                      rows={2}
                      value={activeCase.systemPrompt}
                      onChange={(e) =>
                        handleUpdateActiveCase({ systemPrompt: e.target.value })
                      }
                      placeholder="例如: 你是一名资深数据库工程师，请直接输出结论..."
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="case-user"
                        className="text-xs font-medium text-slate-700 dark:text-slate-300"
                      >
                        User Prompt（测试输入内容）
                      </label>
                      <span className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                        {activeCase.userPrompt.length} 字符 · 约{' '}
                        {estimateTokenCount(
                          activeCase.systemPrompt + activeCase.userPrompt
                        )}{' '}
                        tokens
                      </span>
                    </div>
                    <textarea
                      id="case-user"
                      rows={5}
                      value={activeCase.userPrompt}
                      onChange={(e) =>
                        handleUpdateActiveCase({ userPrompt: e.target.value })
                      }
                      placeholder="输入要测试的模型提示词..."
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                  </div>

                  {/* Rubric Settings */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        自动质量评分规则 (Rubric)
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        关键词命中(45%) + 结构充实度(45%) + JSON契约(10%)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                      <div className="sm:col-span-2 space-y-1.5">
                        <label
                          htmlFor="case-keywords"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                        >
                          期望命中关键词（逗号分隔）
                        </label>
                        <input
                          id="case-keywords"
                          type="text"
                          value={keywordsDraft}
                          onChange={(e) => {
                            const val = e.target.value;
                            setKeywordsDraft(val);
                            handleUpdateActiveCase({
                              expectedKeywords: parseExpectedKeywords(val),
                            });
                          }}
                          placeholder="例如: index, latency, transaction"
                          className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          已解析 {activeCase.expectedKeywords.length} 个检测词
                          {activeCase.expectedKeywords.length > 0
                            ? `：${activeCase.expectedKeywords.join(' · ')}`
                            : '（留空则默认关键词得分 100%）'}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label
                          htmlFor="case-min-chars"
                          className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                        >
                          期望最小输出字符数
                        </label>
                        <input
                          id="case-min-chars"
                          type="number"
                          min={0}
                          step={20}
                          value={activeCase.minChars}
                          onChange={(e) =>
                            handleUpdateActiveCase({
                              minChars: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                        />
                      </div>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        id="case-require-json"
                        type="checkbox"
                        checked={activeCase.requireJson}
                        onChange={(e) =>
                          handleUpdateActiveCase({
                            requireJson: e.target.checked,
                          })
                        }
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#2563EB]"
                      />
                      <span>校验模型输出为合法 JSON 格式（支持自动剥离 Markdown 代码块）</span>
                    </label>
                  </div>
                </div>

                {formError && (
                  <div
                    role="alert"
                    className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-md text-xs text-[#DC2626] dark:text-rose-400 flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs">
                    {saveFeedback ? (
                      <span className="inline-flex items-center gap-1.5 text-[#16A34A] dark:text-emerald-400 font-medium">
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{saveFeedback}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">
                        当前测试集包含 {activeSuite.cases.length} 条用例
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => validateAndSave(false)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <Save className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>保存测试集</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => validateAndSave(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md hover:bg-[#1D4ED8] transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                      <span>保存并在工作台测试</span>
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
