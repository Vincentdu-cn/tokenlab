import type {
  ApiProvider,
  ApiProviderFormat,
  HeaderParam,
  ReasoningMappingMode,
} from '../types/benchmark';

export interface DiscoveredModel {
  id: string;
  name: string;
  ownedBy?: string;
  contextLength?: number;
  description?: string;
}

export type ModelsListRequestPlan =
  | {
      ok: true;
      urls: string[];
      headers: Record<string, string>;
    }
  | {
      ok: false;
      error: string;
    };

export function normalizeProviderBaseUrlForModels(rawUrl: string): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  // Strip accidental full endpoint paths if user pasted them
  return trimmed
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/models$/i, '');
}

export function buildModelsListRequestPlan(
  provider: ApiProvider,
  globalHeaders: HeaderParam[] = [],
  options?: {
    includeProviderHeaders?: boolean;
    includeGlobalHeaders?: boolean;
  }
): ModelsListRequestPlan {
  const includeProviderHeaders = options?.includeProviderHeaders ?? true;
  const includeGlobalHeaders = options?.includeGlobalHeaders ?? false;

  const normalizedBase = normalizeProviderBaseUrlForModels(provider.baseUrl);
  if (!normalizedBase) {
    return { ok: false, error: `提供商「${provider.name}」缺少 Base URL` };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedBase);
  } catch {
    return {
      ok: false,
      error: `Base URL 格式无效：${provider.baseUrl}`,
    };
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return {
      ok: false,
      error: 'Base URL 必须以 http:// 或 https:// 开头',
    };
  }

  const urls: string[] = [`${normalizedBase}/models`];
  const pathname = parsedUrl.pathname.replace(/\/+$/, '');

  // If user entered a bare domain (e.g. https://integrate.api.nvidia.com) for OpenAI-compatible APIs,
  // include /v1/models as a secondary probe target.
  if (
    (provider.format === 'openai-chat' || provider.format === 'openai-responses') &&
    pathname === ''
  ) {
    urls.push(`${normalizedBase}/v1/models`);
  }

  const headers: Record<string, string> = {};
  const apiKey = provider.apiKey.trim();

  if (provider.format === 'openai-chat' || provider.format === 'openai-responses') {
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
  } else if (provider.format === 'anthropic') {
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  } else if (provider.format === 'gemini') {
    if (apiKey) {
      headers['x-goog-api-key'] = apiKey;
    }
  }

  if (includeProviderHeaders) {
    for (const h of provider.customHeaders) {
      if (h.enabled && h.key.trim()) {
        headers[h.key.trim()] = h.value;
      }
    }
  }

  if (includeGlobalHeaders) {
    for (const h of globalHeaders) {
      if (h.enabled && h.key.trim()) {
        headers[h.key.trim()] = h.value;
      }
    }
  }

  return {
    ok: true,
    urls,
    headers,
  };
}

export function formatModelDisplayName(id: string, explicitName?: string): string {
  const trimmedName = (explicitName ?? '').trim();
  if (trimmedName && trimmedName !== id) {
    return trimmedName;
  }
  const cleanId = id.replace(/^models\//, '').trim();
  const slashIdx = cleanId.lastIndexOf('/');
  if (slashIdx >= 0 && slashIdx < cleanId.length - 1) {
    return cleanId.slice(slashIdx + 1);
  }
  return cleanId;
}

export function parseModelsListResponse(
  payload: unknown,
  format: ApiProviderFormat
): DiscoveredModel[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  let rawList: unknown[] = [];
  if (Array.isArray(payload)) {
    rawList = payload;
  } else {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.data)) {
      rawList = obj.data;
    } else if (Array.isArray(obj.models)) {
      rawList = obj.models;
    }
  }

  const seen = new Set<string>();
  const models: DiscoveredModel[] = [];

  for (const rawItem of rawList) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const item = rawItem as Record<string, unknown>;

    if (format === 'gemini') {
      const rawName = typeof item.name === 'string' ? item.name.trim() : '';
      const rawId = typeof item.id === 'string' ? item.id.trim() : '';
      const id = (rawId || rawName).replace(/^models\//, '');
      if (!id || seen.has(id)) continue;

      const methods = Array.isArray(item.supportedGenerationMethods)
        ? item.supportedGenerationMethods.filter(
            (m): m is string => typeof m === 'string'
          )
        : [];
      if (
        methods.length > 0 &&
        !methods.includes('generateContent') &&
        !methods.includes('streamGenerateContent') &&
        !methods.includes('bidiGenerateContent')
      ) {
        continue;
      }

      seen.add(id);
      const displayName =
        typeof item.displayName === 'string' ? item.displayName : undefined;
      const contextLength =
        typeof item.inputTokenLimit === 'number' ? item.inputTokenLimit : undefined;
      const description =
        typeof item.description === 'string' ? item.description : undefined;

      models.push({
        id,
        name: formatModelDisplayName(id, displayName),
        ownedBy: 'google',
        contextLength,
        description,
      });
      continue;
    }

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const explicitName =
      typeof item.display_name === 'string'
        ? item.display_name
        : typeof item.name === 'string'
          ? item.name
          : undefined;

    let ownedBy =
      typeof item.owned_by === 'string' && item.owned_by.trim()
        ? item.owned_by.trim()
        : undefined;
    if (!ownedBy && id.includes('/')) {
      ownedBy = id.split('/')[0];
    }

    const topProvider =
      item.top_provider && typeof item.top_provider === 'object'
        ? (item.top_provider as Record<string, unknown>)
        : undefined;

    const contextLength =
      typeof item.context_length === 'number'
        ? item.context_length
        : topProvider && typeof topProvider.context_length === 'number'
          ? topProvider.context_length
          : typeof item.max_context_length === 'number'
            ? item.max_context_length
            : undefined;

    const description =
      typeof item.description === 'string' ? item.description : undefined;

    models.push({
      id,
      name: formatModelDisplayName(id, explicitName),
      ownedBy,
      contextLength,
      description,
    });
  }

  return models.sort((a, b) => {
    const aSpecial = /^[a-z0-9]/i.test(a.id) ? 0 : 1;
    const bSpecial = /^[a-z0-9]/i.test(b.id) ? 0 : 1;
    if (aSpecial !== bSpecial) return aSpecial - bSpecial;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function inferReasoningMapping(
  format: ApiProviderFormat,
  baseUrl: string,
  modelId = ''
): ReasoningMappingMode {
  if (format === 'anthropic') {
    return 'thinking_budget';
  }
  if (format === 'gemini') {
    if (/gemini-3|gemini-2\.5/i.test(modelId)) {
      return 'thinking_level';
    }
    return 'thinking_budget';
  }
  if (format === 'openai-responses') {
    return 'reasoning.effort';
  }
  if (baseUrl.toLowerCase().includes('openrouter.ai')) {
    return 'reasoning.effort';
  }
  return 'reasoning_effort';
}

export function filterDiscoveredModels(
  items: DiscoveredModel[],
  query: string,
  existingModelIds: Set<string>,
  hideExisting: boolean
): DiscoveredModel[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (hideExisting && existingModelIds.has(item.id)) {
      return false;
    }
    if (!q) return true;
    return (
      item.id.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      (item.ownedBy ?? '').toLowerCase().includes(q)
    );
  });
}

export function formatContextLength(tokens?: number): string | null {
  if (!tokens || !Number.isFinite(tokens) || tokens <= 0) return null;
  if (tokens >= 1_000_000) {
    const m = tokens / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M ctx`;
  }
  if (tokens >= 1000) {
    return `${Math.round(tokens / 1000)}K ctx`;
  }
  return `${tokens} ctx`;
}
