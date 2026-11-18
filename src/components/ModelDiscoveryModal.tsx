import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  Loader2,
  RefreshCw,
  Search,
  Server,
  X,
} from 'lucide-react';
import type {
  ApiProvider,
  HeaderParam,
  ModelConfig,
  ReasoningMappingMode,
} from '../types/benchmark';
import { fetchProviderModels } from '../services/modelDiscoveryClient';
import {
  filterDiscoveredModels,
  formatContextLength,
  inferReasoningMapping,
  type DiscoveredModel,
} from '../utils/modelDiscovery';

interface ModelDiscoveryModalProps {
  isOpen: boolean;
  provider: ApiProvider;
  existingModels: ModelConfig[];
  globalHeaders: HeaderParam[];
  onClose: () => void;
  onImportModels: (
    items: Array<{
      modelId: string;
      name: string;
      reasoningMapping: ReasoningMappingMode;
    }>
  ) => void;
  onApplyResolvedBaseUrl?: (nextBaseUrl: string) => void;
}

const INITIAL_RENDER_LIMIT = 150;

export function ModelDiscoveryModal({
  isOpen,
  provider,
  existingModels,
  globalHeaders,
  onClose,
  onImportModels,
  onApplyResolvedBaseUrl,
}: ModelDiscoveryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCorsError, setIsCorsError] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string>('');
  const [viaProxy, setViaProxy] = useState(false);
  const [usedFallbackV1, setUsedFallbackV1] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredModel[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [hideExisting, setHideExisting] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const [defaultMapping, setDefaultMapping] = useState<ReasoningMappingMode>(() =>
    inferReasoningMapping(provider.format, provider.baseUrl)
  );

  const abortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const existingModelIds = useMemo(
    () => new Set(existingModels.map((m) => m.modelId.trim())),
    [existingModels]
  );

  const runFetch = async (useProxy = false) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setIsCorsError(false);

    const result = await fetchProviderModels(provider, globalHeaders, {
      useProxy,
      signal: controller.signal,
    });

    if (controller.signal.aborted) return;

    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      setIsCorsError(result.isCorsOrNetworkError);
      setDiscovered([]);
      return;
    }

    setDiscovered(result.models);
    setResolvedUrl(result.resolvedUrl);
    setViaProxy(result.viaProxy);
    setUsedFallbackV1(result.usedFallbackV1);
    setShowAllRows(false);

    if (
      result.usedFallbackV1 &&
      onApplyResolvedBaseUrl &&
      result.resolvedUrl.endsWith('/v1/models')
    ) {
      onApplyResolvedBaseUrl(result.resolvedUrl.replace(/\/models$/, ''));
    }
  };

  useEffect(() => {
    if (!isOpen) {
      abortRef.current?.abort();
      return;
    }
    setSearchQuery('');
    setSelectedIds(new Set());
    setDefaultMapping(inferReasoningMapping(provider.format, provider.baseUrl));
    void runFetch(false);

    return () => {
      abortRef.current?.abort();
    };
    // Intentionally fetch when modal opens for the active provider
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, provider.id]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && !loading && discovered.length > 0) {
      searchInputRef.current?.focus();
    }
  }, [isOpen, loading, discovered.length]);

  const filteredModels = useMemo(
    () =>
      filterDiscoveredModels(
        discovered,
        searchQuery,
        existingModelIds,
        hideExisting
      ),
    [discovered, searchQuery, existingModelIds, hideExisting]
  );

  const visibleModels = useMemo(
    () =>
      showAllRows
        ? filteredModels
        : filteredModels.slice(0, INITIAL_RENDER_LIMIT),
    [filteredModels, showAllRows]
  );

  const selectableFilteredIds = useMemo(
    () =>
      filteredModels
        .filter((m) => !existingModelIds.has(m.id))
        .map((m) => m.id),
    [filteredModels, existingModelIds]
  );

  const alreadyAddedCount = useMemo(
    () => discovered.filter((m) => existingModelIds.has(m.id)).length,
    [discovered, existingModelIds]
  );

  const toggleItem = (id: string) => {
    if (existingModelIds.has(id)) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of selectableFilteredIds) {
        next.add(id);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleConfirmImport = () => {
    if (selectedIds.size === 0) return;
    const byId = new Map(discovered.map((m) => [m.id, m]));
    const itemsToAdd = Array.from(selectedIds)
      .map((id) => byId.get(id))
      .filter((m): m is DiscoveredModel => Boolean(m))
      .map((m) => ({
        modelId: m.id,
        name: m.name,
        reasoningMapping: defaultMapping,
      }));

    if (itemsToAdd.length > 0) {
      onImportModels(itemsToAdd);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/55 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="discover-models-title"
        className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2
              id="discover-models-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"
            >
              <Server className="w-4 h-4 text-[#2563EB] dark:text-blue-400 shrink-0" aria-hidden="true" />
              <span className="truncate">列出可用模型 · {provider.name || '未命名提供商'}</span>
            </h2>
            <p className="mt-1 text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
              {resolvedUrl || `${provider.baseUrl.replace(/\/+$/, '')}/models`}
              {viaProxy ? ' (通过本地服务代理)' : ''}
              {usedFallbackV1 ? ' · 已自动匹配 /v1 路径' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void runFetch(viaProxy)}
              disabled={loading}
              aria-label="重新拉取模型列表"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>刷新</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭模型列表弹窗"
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Controls Bar */}
        {!loading && !error && discovered.length > 0 && (
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search
                  className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  aria-label="搜索可用模型"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索模型 ID、名称或提供方 (如 deepseek, llama, claude)..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <label
                  htmlFor="discover-default-mapping"
                  className="text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap"
                >
                  推理映射:
                </label>
                <select
                  id="discover-default-mapping"
                  value={defaultMapping}
                  onChange={(e) =>
                    setDefaultMapping(e.target.value as ReasoningMappingMode)
                  }
                  className="px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
                >
                  <option value="reasoning_effort">reasoning_effort</option>
                  <option value="reasoning.effort">reasoning.effort</option>
                  <option value="thinking_budget">thinking_budget</option>
                  <option value="thinking_level">thinking_level</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-slate-600 dark:text-slate-400">
                <span className="tabular-nums">
                  共 <strong className="text-slate-900 dark:text-slate-100">{discovered.length}</strong> 个可用模型
                  {alreadyAddedCount > 0 ? ` · ${alreadyAddedCount} 个已加入` : ''}
                </span>
                <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideExisting}
                    onChange={(e) => setHideExisting(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 dark:border-slate-600 text-[#2563EB]"
                  />
                  <span>仅显示未添加</span>
                </label>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  disabled={selectableFilteredIds.length === 0}
                  className="text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline disabled:opacity-40 cursor-pointer"
                >
                  全选当前筛选 ({selectableFilteredIds.length})
                </button>
                <button
                  type="button"
                  onClick={handleClearSelection}
                  disabled={selectedIds.size === 0}
                  className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-40 cursor-pointer"
                >
                  清空勾选
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-[260px]">
          {loading ? (
            <div className="h-64 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <Loader2 className="w-6 h-6 text-[#2563EB] animate-spin" aria-hidden="true" />
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                正在拉取可用模型列表...
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono max-w-md truncate">
                GET {provider.baseUrl.replace(/\/+$/, '')}/models
              </p>
            </div>
          ) : error ? (
            <div className="p-6 space-y-4">
              <div
                role="alert"
                className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md space-y-2"
              >
                <div className="flex items-start gap-2 text-sm font-medium text-[#DC2626] dark:text-rose-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
                {isCorsError && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed pl-6">
                    许多服务端网关（如 NVIDIA NIM <span className="font-mono">integrate.api.nvidia.com</span>）未返回浏览器 CORS 允许头。你可以通过本地 TokenLab 服务单次转发本次 <span className="font-mono">GET /models</span> 请求（密钥仅用于当前请求，不会保存或写入日志）。
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                {isCorsError && (
                  <button
                    type="button"
                    onClick={() => void runFetch(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors cursor-pointer"
                  >
                    <Server className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>通过本地服务代理拉取</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void runFetch(false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>重试直连</span>
                </button>
              </div>
            </div>
          ) : discovered.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              <span>接口返回成功，但未解析出可用模型。</span>
              <span className="text-xs">请检查当前提供商的「接口协议格式」与 Base URL 是否匹配。</span>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="h-56 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-500 dark:text-slate-400">
              <span>没有匹配「{searchQuery || '当前筛选条件'}」的模型。</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleModels.map((item) => {
                const alreadyExists = existingModelIds.has(item.id);
                const checked = alreadyExists || selectedIds.has(item.id);
                const ctxLabel = formatContextLength(item.contextLength);
                return (
                  <label
                    key={item.id}
                    className={`px-5 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                      alreadyExists
                        ? 'bg-slate-50/70 dark:bg-slate-950/30 opacity-65 cursor-not-allowed'
                        : checked
                          ? 'bg-blue-50/70 dark:bg-blue-950/25 cursor-pointer'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={alreadyExists}
                        onChange={() => toggleItem(item.id)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-[#2563EB] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {item.name}
                          </span>
                          {item.ownedBy && (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                              {item.ownedBy}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {item.id}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 text-[11px] font-mono">
                      {ctxLabel && (
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                          {ctxLabel}
                        </span>
                      )}
                      {alreadyExists && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-[#16A34A] dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 font-sans font-medium">
                          <Check className="w-3 h-3" aria-hidden="true" />
                          已添加
                        </span>
                      )}
                    </div>
                  </label>
                );
              })}

              {!showAllRows && filteredModels.length > INITIAL_RENDER_LIMIT && (
                <div className="p-3 text-center bg-slate-50 dark:bg-slate-950/40">
                  <button
                    type="button"
                    onClick={() => setShowAllRows(true)}
                    className="text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    显示全部剩余 {filteredModels.length - INITIAL_RENDER_LIMIT} 个模型（当前展示前 {INITIAL_RENDER_LIMIT} 个）
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            已勾选 <strong className="text-slate-900 dark:text-slate-100">{selectedIds.size}</strong> 个新模型
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer"
            >
              <span>加入所选模型 ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
