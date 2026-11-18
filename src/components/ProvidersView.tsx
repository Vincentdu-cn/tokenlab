import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Copy,
  Eye,
  EyeOff,
  ListChecks,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { ModelDiscoveryModal } from './ModelDiscoveryModal';
import type {
  ApiProvider,
  ApiProviderFormat,
  BenchmarkPrompt,
  HeaderParam,
  ModelConfig,
  ReasoningEffort,
  ReasoningMappingMode,
} from '../types/benchmark';
import {
  ALL_REASONING_EFFORTS,
  buildRequestConfig,
  maskSecretHeaders,
  parseExtraJson,
  REASONING_EFFORT_LABELS,
} from '../utils/metrics';

interface ProvidersViewProps {
  providers: ApiProvider[];
  models: ModelConfig[];
  onAddProvider: () => ApiProvider;
  onUpdateProvider: (id: string, patch: Partial<ApiProvider>) => void;
  onDeleteProvider: (id: string) => void;
  onAddModel: (providerId: string) => ModelConfig;
  onAddModelsBatch: (
    providerId: string,
    items: Array<{
      modelId: string;
      name: string;
      reasoningMapping: ReasoningMappingMode;
    }>
  ) => ModelConfig[];
  onUpdateModel: (id: string, patch: Partial<ModelConfig>) => void;
  onDuplicateModel: (id: string) => ModelConfig;
  onDeleteModel: (id: string) => void;
  samplePrompt: BenchmarkPrompt;
  globalHeaders: HeaderParam[];
  globalExtraBodyJson: string;
}

export function ProvidersView({
  providers,
  models,
  onAddProvider,
  onUpdateProvider,
  onDeleteProvider,
  onAddModel,
  onAddModelsBatch,
  onUpdateModel,
  onDuplicateModel,
  onDeleteModel,
  samplePrompt,
  globalHeaders,
  globalExtraBodyJson,
}: ProvidersViewProps) {
  const [selectedProviderId, setSelectedProviderId] = useState<string>(
    providers[0]?.id ?? ''
  );
  const [selectedModelId, setSelectedModelId] = useState<string>(
    () =>
      models.find((m) => m.providerId === (providers[0]?.id ?? ''))?.id ??
      models[0]?.id ??
      ''
  );
  const [showKey, setShowKey] = useState(false);
  const [previewEffort, setPreviewEffort] = useState<ReasoningEffort>('max');
  const [isDiscoveryOpen, setIsDiscoveryOpen] = useState(false);

  const activeProvider =
    providers.find((p) => p.id === selectedProviderId) ?? providers[0] ?? null;

  const providerModels = useMemo(
    () =>
      activeProvider
        ? models.filter((m) => m.providerId === activeProvider.id)
        : [],
    [models, activeProvider]
  );

  const activeModel =
    providerModels.find((m) => m.id === selectedModelId) ??
    providerModels[0] ??
    null;

  const jsonCheck = useMemo(
    () =>
      activeModel
        ? parseExtraJson(activeModel.extraBodyJson)
        : { ok: true as const, value: {} },
    [activeModel]
  );

  const previewConfig = useMemo(() => {
    if (!activeProvider || !activeModel) return null;
    return buildRequestConfig({
      provider: activeProvider,
      model: activeModel,
      prompt: samplePrompt,
      reasoningEffort: previewEffort,
      globalHeaders,
      globalExtraBodyJson,
      requireAuth: false,
    });
  }, [
    activeProvider,
    activeModel,
    samplePrompt,
    previewEffort,
    globalHeaders,
    globalExtraBodyJson,
  ]);

  const handleSelectProvider = (providerId: string) => {
    setSelectedProviderId(providerId);
    const firstModel = models.find((m) => m.providerId === providerId);
    if (firstModel) setSelectedModelId(firstModel.id);
  };

  const handleCreateProvider = () => {
    const created = onAddProvider();
    setSelectedProviderId(created.id);
    const firstModel = onAddModel(created.id);
    setSelectedModelId(firstModel.id);
  };

  const handleCreateModel = () => {
    if (!activeProvider) return;
    const created = onAddModel(activeProvider.id);
    setSelectedModelId(created.id);
  };

  const addProviderHeader = () => {
    if (!activeProvider) return;
    onUpdateProvider(activeProvider.id, {
      customHeaders: [
        ...activeProvider.customHeaders,
        { id: `ph-${Date.now()}`, key: '', value: '', enabled: true },
      ],
    });
  };

  const updateProviderHeader = (headerId: string, patch: Partial<HeaderParam>) => {
    if (!activeProvider) return;
    onUpdateProvider(activeProvider.id, {
      customHeaders: activeProvider.customHeaders.map((h) =>
        h.id === headerId ? { ...h, ...patch } : h
      ),
    });
  };

  const removeProviderHeader = (headerId: string) => {
    if (!activeProvider) return;
    onUpdateProvider(activeProvider.id, {
      customHeaders: activeProvider.customHeaders.filter((h) => h.id !== headerId),
    });
  };

  const addModelHeader = () => {
    if (!activeModel) return;
    onUpdateModel(activeModel.id, {
      customHeaders: [
        ...activeModel.customHeaders,
        { id: `mh-${Date.now()}`, key: '', value: '', enabled: true },
      ],
    });
  };

  const updateModelHeader = (headerId: string, patch: Partial<HeaderParam>) => {
    if (!activeModel) return;
    onUpdateModel(activeModel.id, {
      customHeaders: activeModel.customHeaders.map((h) =>
        h.id === headerId ? { ...h, ...patch } : h
      ),
    });
  };

  const removeModelHeader = (headerId: string) => {
    if (!activeModel) return;
    onUpdateModel(activeModel.id, {
      customHeaders: activeModel.customHeaders.filter((h) => h.id !== headerId),
    });
  };

  const applyBodyPreset = (presetObj: Record<string, unknown>) => {
    if (!activeModel) return;
    const current = parseExtraJson(activeModel.extraBodyJson);
    const merged = current.ok ? { ...current.value, ...presetObj } : presetObj;
    onUpdateModel(activeModel.id, {
      extraBodyJson: JSON.stringify(merged, null, 2),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            提供商与模型配置
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            采用「提供商 → 模型」两级管理结构：在提供商统一配置网关与 API Key，并为其下每个模型独立定制推理强度映射、Headers 与额外 Body 参数。
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateProvider}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] rounded-md hover:bg-[#1D4ED8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>新增提供商</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Providers + Nested Models */}
        <aside className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
            <div className="px-4 py-3 text-xs font-semibold text-slate-700 dark:text-slate-300">
              提供商列表 ({providers.length})
            </div>
            {providers.map((prov) => {
              const isSelected = activeProvider?.id === prov.id;
              const childCount = models.filter((m) => m.providerId === prov.id).length;
              const hasKey = Boolean(prov.apiKey.trim());
              return (
                <div
                  key={prov.id}
                  className={`p-3.5 flex items-start justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-blue-50/70 dark:bg-blue-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleSelectProvider(prov.id)}
                    className="text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {prov.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate mt-0.5">
                      {prov.format} · {childCount} 个模型
                    </div>
                    <div
                      className={`text-[11px] mt-1 font-medium ${
                        hasKey
                          ? 'text-[#16A34A] dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {hasKey ? 'API Key 已配置 (工作台可见)' : '未填 API Key'}
                    </div>
                  </button>
                  {providers.length > 1 && (
                    <button
                      type="button"
                      aria-label={`删除提供商 ${prov.name}`}
                      onClick={() => {
                        onDeleteProvider(prov.id);
                        if (selectedProviderId === prov.id) {
                          const next = providers.find((x) => x.id !== prov.id);
                          if (next) handleSelectProvider(next.id);
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-[#DC2626] rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {activeProvider && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
              <div className="px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                  {activeProvider.name} · 旗下模型 ({providerModels.length})
                </span>
                <button
                  type="button"
                  onClick={handleCreateModel}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>添加模型</span>
                </button>
              </div>
              {providerModels.length === 0 ? (
                <div className="p-4 text-xs text-slate-500 dark:text-slate-400">
                  该提供商下暂无模型，点击右上角「添加模型」。
                </div>
              ) : (
                providerModels.map((mod) => {
                  const isSelected = activeModel?.id === mod.id;
                  return (
                    <div
                      key={mod.id}
                      className={`p-3 flex items-center justify-between gap-2 transition-colors ${
                        isSelected
                          ? 'bg-blue-50/70 dark:bg-blue-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedModelId(mod.id)}
                        className="text-left min-w-0 flex-1 cursor-pointer"
                      >
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {mod.name}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {mod.modelId} · {mod.reasoningMapping}
                        </div>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          aria-label={`复制模型 ${mod.name}`}
                          onClick={() => {
                            const copy = onDuplicateModel(mod.id);
                            setSelectedModelId(copy.id);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`删除模型 ${mod.name}`}
                          onClick={() => onDeleteModel(mod.id)}
                          className="p-1 text-slate-400 hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </aside>

        {/* Right Detail Editors */}
        <div className="lg:col-span-8 space-y-6">
          {/* Level 1: Provider Config */}
          {activeProvider && (
            <section
              aria-label="提供商配置"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    提供商设置 · {activeProvider.name || '未命名'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#16A34A]" aria-hidden="true" />
                    <span>填写 API Key 后，该提供商下的模型才会出现在测试工作台。密钥仅存本地浏览器。</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDiscoveryOpen(true)}
                  disabled={!activeProvider.baseUrl.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2563EB] dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-950/70 border border-blue-200 dark:border-blue-800/80 rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ListChecks className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>列出模型</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="prov-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    提供商名称
                  </label>
                  <input
                    id="prov-name"
                    type="text"
                    value={activeProvider.name}
                    onChange={(e) =>
                      onUpdateProvider(activeProvider.id, { name: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="prov-format"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    接口协议格式
                  </label>
                  <select
                    id="prov-format"
                    value={activeProvider.format}
                    onChange={(e) =>
                      onUpdateProvider(activeProvider.id, {
                        format: e.target.value as ApiProviderFormat,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="openai-chat">OpenAI Chat Completions (/chat/completions)</option>
                    <option value="openai-responses">OpenAI Responses API (/responses)</option>
                    <option value="anthropic">Anthropic Messages (/messages)</option>
                    <option value="gemini">Google Gemini REST (:streamGenerateContent)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="prov-baseurl"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Base URL
                  </label>
                  <input
                    id="prov-baseurl"
                    type="url"
                    value={activeProvider.baseUrl}
                    onChange={(e) =>
                      onUpdateProvider(activeProvider.id, { baseUrl: e.target.value })
                    }
                    placeholder="https://openrouter.ai/api/v1"
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="prov-apikey"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      id="prov-apikey"
                      type={showKey ? 'text' : 'password'}
                      value={activeProvider.apiKey}
                      onChange={(e) =>
                        onUpdateProvider(activeProvider.id, { apiKey: e.target.value })
                      }
                      placeholder="sk-..."
                      className="w-full pl-3 pr-10 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                    />
                    <button
                      type="button"
                      aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                      onClick={() => setShowKey((s) => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showKey ? (
                        <EyeOff className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    提供商级默认 Headers
                  </span>
                  <button
                    type="button"
                    onClick={addProviderHeader}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>添加 Header</span>
                  </button>
                </div>

                {activeProvider.customHeaders.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    暂无提供商默认 Header。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeProvider.customHeaders.map((h) => (
                      <div key={h.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`启用提供商 Header ${h.key || '未命名'}`}
                          checked={h.enabled}
                          onChange={(e) =>
                            updateProviderHeader(h.id, { enabled: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#2563EB]"
                        />
                        <input
                          type="text"
                          aria-label="提供商 Header Key"
                          value={h.key}
                          onChange={(e) =>
                            updateProviderHeader(h.id, { key: e.target.value })
                          }
                          placeholder="Key"
                          className="w-1/3 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                        />
                        <input
                          type="text"
                          aria-label="提供商 Header Value"
                          value={h.value}
                          onChange={(e) =>
                            updateProviderHeader(h.id, { value: e.target.value })
                          }
                          placeholder="Value"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          aria-label={`删除提供商 Header ${h.key || '未命名'}`}
                          onClick={() => removeProviderHeader(h.id)}
                          className="p-1.5 text-slate-400 hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Level 2: Model Config */}
          {activeProvider && activeModel && (
            <section
              aria-label="模型请求参数配置"
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5"
            >
              <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  模型参数配置 · {activeModel.name}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  配置模型 ID、Reasoning Effort 映射规则（支持自定义字段路径与映射值）、模型专属 Headers 与额外 Body JSON。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="mod-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    模型显示名称
                  </label>
                  <input
                    id="mod-name"
                    type="text"
                    value={activeModel.name}
                    onChange={(e) =>
                      onUpdateModel(activeModel.id, { name: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="mod-id"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Model ID
                  </label>
                  <input
                    id="mod-id"
                    type="text"
                    value={activeModel.modelId}
                    onChange={(e) =>
                      onUpdateModel(activeModel.id, { modelId: e.target.value })
                    }
                    placeholder="inclusionai/ling-3.2-flash:free"
                    className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label
                    htmlFor="mod-reasoning-map"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Reasoning Effort 参数映射方式
                  </label>
                  <select
                    id="mod-reasoning-map"
                    value={activeModel.reasoningMapping}
                    onChange={(e) =>
                      onUpdateModel(activeModel.id, {
                        reasoningMapping: e.target.value as ReasoningMappingMode,
                      })
                    }
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                  >
                    <option value="reasoning_effort">顶层字段 reasoning_effort (OpenAI / DeepSeek)</option>
                    <option value="reasoning.effort">嵌套对象 reasoning.effort (OpenRouter / Responses)</option>
                    <option value="thinking_budget">预算映射 thinking.budget_tokens (Anthropic / Gemini)</option>
                    <option value="thinking_level">推理等级 thinkingLevel (Gemini 3 / 2.5)</option>
                    <option value="custom">自定义字段路径与强度映射值 (Custom)</option>
                  </select>
                </div>
              </div>

              {activeModel.reasoningMapping === 'custom' && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-md space-y-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="mod-custom-path"
                      className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                    >
                      自定义 JSON 键路径 (支持点分嵌套，如 reasoning.effort 或 extra_body.thinking.budget)
                    </label>
                    <input
                      id="mod-custom-path"
                      type="text"
                      value={activeModel.customReasoningPath}
                      onChange={(e) =>
                        onUpdateModel(activeModel.id, {
                          customReasoningPath: e.target.value,
                        })
                      }
                      placeholder="reasoning.effort"
                      className="w-full px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      各思考强度对应值 (留空则默认传入强度名称；数字/JSON 对象将自动解析类型)
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {ALL_REASONING_EFFORTS.map((effort) => (
                        <div key={effort} className="space-y-1">
                          <label
                            htmlFor={`custom-val-${effort}`}
                            className="block text-[11px] font-mono text-slate-500 dark:text-slate-400"
                          >
                            {REASONING_EFFORT_LABELS[effort]}
                          </label>
                          <input
                            id={`custom-val-${effort}`}
                            type="text"
                            value={activeModel.customEffortValues[effort] ?? ''}
                            onChange={(e) =>
                              onUpdateModel(activeModel.id, {
                                customEffortValues: {
                                  ...activeModel.customEffortValues,
                                  [effort]: e.target.value,
                                },
                              })
                            }
                            placeholder={effort}
                            className="w-full px-2 py-1 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Model Headers */}
              <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    模型专属 Headers (覆盖提供商同名头)
                  </span>
                  <button
                    type="button"
                    onClick={addModelHeader}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>添加 Header</span>
                  </button>
                </div>
                {activeModel.customHeaders.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    暂无模型专属 Header。
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeModel.customHeaders.map((h) => (
                      <div key={h.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`启用模型 Header ${h.key || '未命名'}`}
                          checked={h.enabled}
                          onChange={(e) =>
                            updateModelHeader(h.id, { enabled: e.target.checked })
                          }
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#2563EB]"
                        />
                        <input
                          type="text"
                          aria-label="模型 Header Key"
                          value={h.key}
                          onChange={(e) =>
                            updateModelHeader(h.id, { key: e.target.value })
                          }
                          placeholder="Key"
                          className="w-1/3 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                        />
                        <input
                          type="text"
                          aria-label="模型 Header Value"
                          value={h.value}
                          onChange={(e) =>
                            updateModelHeader(h.id, { value: e.target.value })
                          }
                          placeholder="Value"
                          className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          aria-label={`移除模型 Header ${h.key || '未命名'}`}
                          onClick={() => removeModelHeader(h.id)}
                          className="p-1.5 text-slate-400 hover:text-[#DC2626] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Model Extra Body JSON */}
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="mod-extra-body"
                    className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                  >
                    额外 Body 参数 (JSON 深度合并)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        applyBodyPreset({ temperature: 0.2, top_p: 0.9 })
                      }
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                    >
                      + 采样参数
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        applyBodyPreset({ provider: { sort: 'throughput' } })
                      }
                      className="px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer"
                    >
                      + OpenRouter 极速路由
                    </button>
                  </div>
                </div>

                <textarea
                  id="mod-extra-body"
                  rows={4}
                  value={activeModel.extraBodyJson}
                  onChange={(e) =>
                    onUpdateModel(activeModel.id, { extraBodyJson: e.target.value })
                  }
                  className={`w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-950 border rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 ${
                    jsonCheck.ok
                      ? 'border-slate-200 dark:border-slate-700 focus:ring-[#2563EB]'
                      : 'border-[#DC2626] focus:ring-[#DC2626]'
                  }`}
                />
                {!jsonCheck.ok && (
                  <p role="alert" className="text-xs text-[#DC2626] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{jsonCheck.error}</span>
                  </p>
                )}
              </div>

              {/* Payload Inspector */}
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    请求报文实时预览 (HTTP Payload Inspector)
                  </h3>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">预览强度:</span>
                    <select
                      aria-label="预览推理强度"
                      value={previewEffort}
                      onChange={(e) =>
                        setPreviewEffort(e.target.value as ReasoningEffort)
                      }
                      className="px-2 py-1 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200"
                    >
                      {ALL_REASONING_EFFORTS.map((eff) => (
                        <option key={eff} value={eff}>
                          {eff}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {previewConfig && (
                  <div className="p-4 bg-slate-900 dark:bg-slate-950 text-slate-100 border border-slate-800 rounded-md font-mono text-xs overflow-x-auto">
                    {previewConfig.ok ? (
                      <pre className="whitespace-pre-wrap break-all leading-relaxed">
                        {JSON.stringify(
                          {
                            method: 'POST',
                            url: previewConfig.url,
                            headers: maskSecretHeaders(previewConfig.headers),
                            body: previewConfig.body,
                          },
                          null,
                          2
                        )}
                      </pre>
                    ) : (
                      <div className="text-rose-400">{previewConfig.error}</div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>

      {activeProvider && (
        <ModelDiscoveryModal
          isOpen={isDiscoveryOpen}
          provider={activeProvider}
          existingModels={providerModels}
          globalHeaders={globalHeaders}
          onClose={() => setIsDiscoveryOpen(false)}
          onImportModels={(items) => {
            const added = onAddModelsBatch(activeProvider.id, items);
            if (added[0]) {
              setSelectedModelId(added[0].id);
            }
          }}
          onApplyResolvedBaseUrl={(nextBaseUrl) => {
            onUpdateProvider(activeProvider.id, { baseUrl: nextBaseUrl });
          }}
        />
      )}
    </div>
  );
}
