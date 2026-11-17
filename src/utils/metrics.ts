import type {
  ApiProvider,
  ApiProviderFormat,
  BenchmarkPrompt,
  BenchmarkRunResult,
  ComparisonGroupSummary,
  HeaderParam,
  ModelConfig,
  PromptCategory,
  QualityAssessment,
  ReasoningEffort,
} from '../types/benchmark';

export const PROMPT_CATEGORY_LABELS: Record<PromptCategory, string> = {
  extraction: '信息抽取 / 结构化',
  coding: '代码生成 / 工程',
  reasoning: '逻辑 / 数学推理',
  synthesis: '综合摘要 / 分析',
  custom: '自定义综合',
};

export function parseExpectedKeywords(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,，\n]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

export function formatExpectedKeywords(keywords: string[]): string {
  return keywords.join(', ');
}

export interface ParsedStreamDelta {
  reasoningDelta: string;
  contentDelta: string;
  promptTokens?: number;
  reasoningTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  done?: boolean;
}

export const ALL_REASONING_EFFORTS: ReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export const REASONING_EFFORT_LABELS: Record<ReasoningEffort, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
};

export const THINKING_BUDGET_MAP: Record<ReasoningEffort, number> = {
  none: 0,
  minimal: 512,
  low: 1024,
  medium: 4096,
  high: 12288,
  xhigh: 24576,
  max: 32768,
};

export function parseSseDataLine(rawLine: string): unknown | 'DONE' | null {
  const trimmed = rawLine.trim();
  if (!trimmed || trimmed.startsWith(':')) {
    return null;
  }
  if (!trimmed.startsWith('data:')) {
    return null;
  }
  const payload = trimmed.slice(5).trim();
  if (!payload) {
    return null;
  }
  if (payload === '[DONE]') {
    return 'DONE';
  }
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function extractStreamDelta(
  parsed: unknown,
  format: ApiProviderFormat
): ParsedStreamDelta {
  const result: ParsedStreamDelta = {
    reasoningDelta: '',
    contentDelta: '',
  };

  if (!parsed || typeof parsed !== 'object') {
    return result;
  }

  const obj = parsed as Record<string, unknown>;

  if (format === 'openai-chat') {
    const choices = Array.isArray(obj.choices) ? obj.choices : [];
    const first = (choices[0] ?? {}) as Record<string, unknown>;
    const delta = (first.delta ?? {}) as Record<string, unknown>;

    if (typeof delta.reasoning_content === 'string') {
      result.reasoningDelta += delta.reasoning_content;
    } else if (typeof delta.reasoning === 'string') {
      result.reasoningDelta += delta.reasoning;
    } else if (Array.isArray(delta.reasoning_details)) {
      for (const item of delta.reasoning_details) {
        if (!item || typeof item !== 'object') continue;
        const detail = item as Record<string, unknown>;
        if (typeof detail.text === 'string') {
          result.reasoningDelta += detail.text;
        } else if (typeof detail.summary === 'string') {
          result.reasoningDelta += detail.summary;
        }
      }
    }

    if (typeof delta.content === 'string') {
      result.contentDelta += delta.content;
    }

    if (typeof first.finish_reason === 'string' && first.finish_reason) {
      result.finishReason = first.finish_reason;
    }

    const usage = obj.usage as Record<string, unknown> | undefined;
    if (usage) {
      if (typeof usage.prompt_tokens === 'number') {
        result.promptTokens = usage.prompt_tokens;
      }
      if (typeof usage.completion_tokens === 'number') {
        result.outputTokens = usage.completion_tokens;
      }
      const details = usage.completion_tokens_details as Record<string, unknown> | undefined;
      if (details && typeof details.reasoning_tokens === 'number') {
        result.reasoningTokens = details.reasoning_tokens;
      }
    }
    return result;
  }

  if (format === 'openai-responses') {
    const type = typeof obj.type === 'string' ? obj.type : '';
    if (type === 'response.output_text.delta' && typeof obj.delta === 'string') {
      result.contentDelta += obj.delta;
    } else if (
      (type === 'response.reasoning_summary_text.delta' ||
        type === 'response.reasoning.delta') &&
      typeof obj.delta === 'string'
    ) {
      result.reasoningDelta += obj.delta;
    } else if (type === 'response.completed') {
      result.done = true;
      result.finishReason = 'stop';
      const response = (obj.response ?? {}) as Record<string, unknown>;
      const usage = response.usage as Record<string, unknown> | undefined;
      if (usage) {
        if (typeof usage.input_tokens === 'number') {
          result.promptTokens = usage.input_tokens;
        }
        if (typeof usage.output_tokens === 'number') {
          result.outputTokens = usage.output_tokens;
        }
        const details = usage.output_tokens_details as Record<string, unknown> | undefined;
        if (details && typeof details.reasoning_tokens === 'number') {
          result.reasoningTokens = details.reasoning_tokens;
        }
      }
    }
    return result;
  }

  if (format === 'anthropic') {
    const type = typeof obj.type === 'string' ? obj.type : '';
    if (type === 'content_block_delta') {
      const delta = (obj.delta ?? {}) as Record<string, unknown>;
      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        result.reasoningDelta += delta.thinking;
      } else if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        result.contentDelta += delta.text;
      }
    } else if (type === 'message_delta') {
      const delta = (obj.delta ?? {}) as Record<string, unknown>;
      if (typeof delta.stop_reason === 'string') {
        result.finishReason = delta.stop_reason;
      }
      const usage = obj.usage as Record<string, unknown> | undefined;
      if (usage && typeof usage.output_tokens === 'number') {
        result.outputTokens = usage.output_tokens;
      }
    } else if (type === 'message_start') {
      const message = (obj.message ?? {}) as Record<string, unknown>;
      const usage = message.usage as Record<string, unknown> | undefined;
      if (usage && typeof usage.input_tokens === 'number') {
        result.promptTokens = usage.input_tokens;
      }
    } else if (type === 'message_stop') {
      result.done = true;
    }
    return result;
  }

  if (format === 'gemini') {
    const candidates = Array.isArray(obj.candidates) ? obj.candidates : [];
    const first = (candidates[0] ?? {}) as Record<string, unknown>;
    const content = (first.content ?? {}) as Record<string, unknown>;
    const parts = Array.isArray(content.parts) ? content.parts : [];
    for (const rawPart of parts) {
      if (!rawPart || typeof rawPart !== 'object') continue;
      const part = rawPart as Record<string, unknown>;
      if (typeof part.text === 'string') {
        if (part.thought === true) {
          result.reasoningDelta += part.text;
        } else {
          result.contentDelta += part.text;
        }
      }
    }
    if (typeof first.finishReason === 'string' && first.finishReason) {
      result.finishReason = first.finishReason.toLowerCase();
    }
    const usage = obj.usageMetadata as Record<string, unknown> | undefined;
    if (usage) {
      if (typeof usage.promptTokenCount === 'number') {
        result.promptTokens = usage.promptTokenCount;
      }
      if (typeof usage.candidatesTokenCount === 'number') {
        result.outputTokens = usage.candidatesTokenCount;
      }
      if (typeof usage.thoughtsTokenCount === 'number') {
        result.reasoningTokens = usage.thoughtsTokenCount;
      }
    }
    return result;
  }

  return result;
}

export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  let cjkCount = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0x4e00 && code <= 0x9fff) {
      cjkCount += 1;
    }
  }
  const nonCjkLength = text.length - cjkCount;
  return Math.max(1, Math.round(cjkCount * 1.15 + nonCjkLength / 3.8));
}

export function deepMergeObjects(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMergeObjects(
        existing as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function setNestedPath(
  target: Record<string, unknown>,
  dotPath: string,
  value: unknown
): Record<string, unknown> {
  const segments = dotPath
    .split('.')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return target;

  const clone: Record<string, unknown> = { ...target };
  let cursor: Record<string, unknown> = clone;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const existing = cursor[seg];
    const nextObj =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    cursor[seg] = nextObj;
    cursor = nextObj;
  }

  cursor[segments[segments.length - 1]] = value;
  return clone;
}

export function parseCustomEffortValue(raw: string | undefined, fallback: string): unknown {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fallback;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function parseExtraJson(
  rawJson: string
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    return { ok: true, value: {} };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: '额外 Body 参数必须是有效的 JSON 对象 ({ ... })' };
    }
    return { ok: true, value: parsed as Record<string, unknown> };
  } catch (err) {
    return {
      ok: false,
      error: `JSON 语法错误: ${err instanceof Error ? err.message : '无法解析'}`,
    };
  }
}

export function applyReasoningEffortParam(
  body: Record<string, unknown>,
  effort: ReasoningEffort,
  model: ModelConfig,
  format: ApiProviderFormat
): Record<string, unknown> {
  const next = { ...body };
  const mode = model.reasoningMapping;

  if (mode === 'reasoning_effort') {
    next.reasoning_effort = effort;
    return next;
  }

  if (mode === 'reasoning.effort') {
    next.reasoning = {
      ...((typeof next.reasoning === 'object' && next.reasoning) || {}),
      effort,
    };
    return next;
  }

  if (mode === 'thinking_budget') {
    const budget = THINKING_BUDGET_MAP[effort];
    if (format === 'anthropic') {
      next.thinking =
        budget === 0
          ? { type: 'disabled' }
          : { type: 'enabled', budget_tokens: budget };
    } else if (format === 'gemini') {
      next.generationConfig = {
        ...((typeof next.generationConfig === 'object' && next.generationConfig) || {}),
        thinkingConfig: { thinkingBudget: budget },
      };
    } else {
      next.thinking = {
        type: budget === 0 ? 'disabled' : 'enabled',
        budget_tokens: budget,
      };
    }
    return next;
  }

  if (mode === 'thinking_level') {
    const mappedLevel =
      effort === 'xhigh' || effort === 'max'
        ? 'HIGH'
        : effort === 'none'
          ? 'MINIMAL'
          : effort.toUpperCase();
    if (format === 'gemini') {
      next.generationConfig = {
        ...((typeof next.generationConfig === 'object' && next.generationConfig) || {}),
        thinkingConfig: { thinkingLevel: mappedLevel },
      };
    } else {
      next.thinking_level = effort;
    }
    return next;
  }

  if (mode === 'custom') {
    const path = model.customReasoningPath.trim() || 'reasoning.effort';
    const rawVal = model.customEffortValues[effort];
    const parsedVal = parseCustomEffortValue(rawVal, effort);
    return setNestedPath(next, path, parsedVal);
  }

  return next;
}

export interface BuildRequestInput {
  provider: ApiProvider;
  model: ModelConfig;
  prompt: BenchmarkPrompt;
  reasoningEffort: ReasoningEffort;
  globalHeaders: HeaderParam[];
  globalExtraBodyJson: string;
  requireAuth?: boolean;
}

export type BuildRequestOutput =
  | {
      ok: true;
      url: string;
      headers: Record<string, string>;
      body: Record<string, unknown>;
    }
  | {
      ok: false;
      error: string;
    };

export function buildRequestConfig(input: BuildRequestInput): BuildRequestOutput {
  const { provider, model, prompt, reasoningEffort, globalHeaders, globalExtraBodyJson } =
    input;
  const trimmedUrl = provider.baseUrl.trim().replace(/\/+$/, '');
  if (!trimmedUrl) {
    return { ok: false, error: `提供商「${provider.name}」缺少 Base URL` };
  }
  if (!model.modelId.trim()) {
    return { ok: false, error: `模型「${model.name}」缺少 Model ID` };
  }
  if (input.requireAuth && !provider.apiKey.trim()) {
    return { ok: false, error: `提供商「${provider.name}」缺少 API Key` };
  }

  const modelExtra = parseExtraJson(model.extraBodyJson);
  if (!modelExtra.ok) {
    return { ok: false, error: `模型额外参数错误: ${modelExtra.error}` };
  }

  const globalExtra = parseExtraJson(globalExtraBodyJson);
  if (!globalExtra.ok) {
    return { ok: false, error: `全局额外参数错误: ${globalExtra.error}` };
  }

  let url = trimmedUrl;
  let baseBody: Record<string, unknown> = {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider.format === 'openai-chat') {
    if (!url.endsWith('/chat/completions')) {
      url = `${url}/chat/completions`;
    }
    if (provider.apiKey.trim()) {
      headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
    }
    const messages: Array<{ role: string; content: string }> = [];
    if (prompt.systemPrompt.trim()) {
      messages.push({ role: 'system', content: prompt.systemPrompt.trim() });
    }
    if (
      Array.isArray(prompt.userMessages) &&
      prompt.userMessages.length > 0 &&
      prompt.userPrompt === prompt.userMessages.join('\n\n')
    ) {
      for (const msg of prompt.userMessages) {
        messages.push({ role: 'user', content: msg });
      }
    } else {
      messages.push({ role: 'user', content: prompt.userPrompt });
    }
    baseBody = {
      model: model.modelId.trim(),
      messages,
      stream: true,
      stream_options: { include_usage: true },
    };
  } else if (provider.format === 'openai-responses') {
    if (!url.endsWith('/responses')) {
      url = `${url}/responses`;
    }
    if (provider.apiKey.trim()) {
      headers.Authorization = `Bearer ${provider.apiKey.trim()}`;
    }
    baseBody = {
      model: model.modelId.trim(),
      instructions: prompt.systemPrompt.trim() || undefined,
      input: prompt.userPrompt,
      stream: true,
    };
  } else if (provider.format === 'anthropic') {
    if (!url.endsWith('/messages')) {
      url = `${url}/messages`;
    }
    if (provider.apiKey.trim()) {
      headers['x-api-key'] = provider.apiKey.trim();
    }
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    baseBody = {
      model: model.modelId.trim(),
      max_tokens: 4096,
      system: prompt.systemPrompt.trim() || undefined,
      messages: [{ role: 'user', content: prompt.userPrompt }],
      stream: true,
    };
  } else if (provider.format === 'gemini') {
    const modelPath = model.modelId.trim();
    if (!url.includes(':streamGenerateContent')) {
      url = `${url}/models/${modelPath}:streamGenerateContent?alt=sse`;
    }
    if (provider.apiKey.trim()) {
      headers['x-goog-api-key'] = provider.apiKey.trim();
    }
    baseBody = {
      contents: [{ role: 'user', parts: [{ text: prompt.userPrompt }] }],
      ...(prompt.systemPrompt.trim()
        ? { systemInstruction: { parts: [{ text: prompt.systemPrompt.trim() }] } }
        : {}),
    };
  }

  let mergedBody = applyReasoningEffortParam(
    baseBody,
    reasoningEffort,
    model,
    provider.format
  );
  mergedBody = deepMergeObjects(mergedBody, modelExtra.value);
  mergedBody = deepMergeObjects(mergedBody, globalExtra.value);

  for (const h of provider.customHeaders) {
    if (h.enabled && h.key.trim()) {
      headers[h.key.trim()] = h.value;
    }
  }
  for (const h of model.customHeaders) {
    if (h.enabled && h.key.trim()) {
      headers[h.key.trim()] = h.value;
    }
  }
  for (const h of globalHeaders) {
    if (h.enabled && h.key.trim()) {
      headers[h.key.trim()] = h.value;
    }
  }

  return {
    ok: true,
    url,
    headers,
    body: mergedBody,
  };
}

export interface ComputeRunMetricsInput {
  startTimeMs: number;
  firstTokenMs: number | null;
  firstContentTokenMs: number | null;
  endTimeMs: number;
  interTokenDeltasMs: number[];
  reasoningTokens: number;
  outputTokens: number;
}

export interface ComputedRunMetrics {
  ttftMs: number;
  thinkingDurationMs: number;
  generationDurationMs: number;
  e2eMs: number;
  tpotMs: number;
  outputTps: number;
  totalTps: number;
  jitterStdDevMs: number;
}

export function calculateStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(variance);
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  );
  return sorted[idx];
}

export function computeRunMetrics(input: ComputeRunMetricsInput): ComputedRunMetrics {
  const e2eMs = Math.max(1, input.endTimeMs - input.startTimeMs);
  const ttftMs =
    input.firstTokenMs !== null
      ? Math.max(1, input.firstTokenMs - input.startTimeMs)
      : e2eMs;

  const contentStartMs = input.firstContentTokenMs ?? input.firstTokenMs ?? input.endTimeMs;
  const thinkingDurationMs =
    input.firstTokenMs !== null && input.firstContentTokenMs !== null
      ? Math.max(0, input.firstContentTokenMs - input.firstTokenMs)
      : 0;

  const generationDurationMs = Math.max(1, input.endTimeMs - contentStartMs);
  const totalGeneratedTokens = Math.max(0, input.reasoningTokens + input.outputTokens);

  const outputTps =
    input.outputTokens > 0
      ? Number(((input.outputTokens / generationDurationMs) * 1000).toFixed(2))
      : 0;

  const streamWindowMs = Math.max(1, input.endTimeMs - (input.firstTokenMs ?? input.startTimeMs));
  const totalTps =
    totalGeneratedTokens > 0
      ? Number(((totalGeneratedTokens / streamWindowMs) * 1000).toFixed(2))
      : 0;

  const tpotMs =
    input.outputTokens > 1
      ? Number((generationDurationMs / (input.outputTokens - 1)).toFixed(2))
      : input.outputTokens === 1
        ? Number(generationDurationMs.toFixed(2))
        : 0;

  const jitterStdDevMs = Number(calculateStdDev(input.interTokenDeltasMs).toFixed(2));

  return {
    ttftMs: Number(ttftMs.toFixed(1)),
    thinkingDurationMs: Number(thinkingDurationMs.toFixed(1)),
    generationDurationMs: Number(generationDurationMs.toFixed(1)),
    e2eMs: Number(e2eMs.toFixed(1)),
    tpotMs,
    outputTps,
    totalTps,
    jitterStdDevMs,
  };
}

export function evaluateResponseQuality(params: {
  outputText: string;
  reasoningTokens: number;
  outputTokens: number;
  prompt: BenchmarkPrompt;
  stopReason: string;
  manualRating?: number | null;
  notes?: string;
}): QualityAssessment {
  const { outputText, reasoningTokens, outputTokens, prompt, stopReason } = params;
  const trimmed = outputText.trim();

  let jsonValid: boolean | null = null;
  if (prompt.requireJson) {
    const candidate = trimmed
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    try {
      JSON.parse(candidate);
      jsonValid = true;
    } catch {
      jsonValid = false;
    }
  }

  let rubricMatchRate = 100;
  if (prompt.expectedKeywords.length > 0) {
    const lower = trimmed.toLowerCase();
    const hits = prompt.expectedKeywords.filter((kw) =>
      lower.includes(kw.toLowerCase())
    ).length;
    rubricMatchRate = Math.round((hits / prompt.expectedKeywords.length) * 100);
  }

  let structureScore = 100;
  if (!trimmed) {
    structureScore = 0;
  } else {
    if (trimmed.length < prompt.minChars) {
      structureScore -= Math.min(
        40,
        Math.round(
          ((prompt.minChars - trimmed.length) / Math.max(1, prompt.minChars)) * 50
        )
      );
    }
    const fenceCount = (trimmed.match(/```/g) || []).length;
    if (fenceCount % 2 !== 0) {
      structureScore -= 25;
    }
    if (stopReason === 'length' || stopReason === 'max_tokens') {
      structureScore -= 25;
    }
    if (jsonValid === false) {
      structureScore -= 35;
    }
  }
  structureScore = Math.max(0, Math.min(100, structureScore));

  const reasoningEfficiencyRatio =
    reasoningTokens > 0 && outputTokens > 0
      ? Number((outputTokens / (outputTokens + reasoningTokens)).toFixed(2))
      : 1;

  const overallScore = Math.round(
    rubricMatchRate * 0.45 +
      structureScore * 0.45 +
      (jsonValid === false ? 0 : 10)
  );

  return {
    overallScore: Math.max(0, Math.min(100, overallScore)),
    jsonValid,
    rubricMatchRate,
    structureScore,
    reasoningEfficiencyRatio,
    stopReason: stopReason || 'stop',
    manualRating: params.manualRating ?? null,
    notes: params.notes ?? '',
  };
}

export function aggregateComparisonGroups(
  runs: BenchmarkRunResult[]
): ComparisonGroupSummary[] {
  const finished = runs.filter((r) => r.status !== 'running');
  const buckets = new Map<string, BenchmarkRunResult[]>();

  for (const run of finished) {
    const key = `${run.modelConfigId}::${run.modelId}::${run.reasoningEffort}`;
    const list = buckets.get(key) ?? [];
    list.push(run);
    buckets.set(key, list);
  }

  const summaries: ComparisonGroupSummary[] = [];
  for (const [groupKey, allItems] of buckets.entries()) {
    const completed = allItems.filter((r) => r.status === 'completed');
    if (completed.length === 0) continue;

    const first = completed[0];
    const count = completed.length;
    const successRate = Math.round((completed.length / allItems.length) * 100);
    const mean = (fn: (r: BenchmarkRunResult) => number) =>
      Number((completed.reduce((s, r) => s + fn(r), 0) / count).toFixed(1));

    const ttfts = completed.map((r) => r.ttftMs);
    const meanReasoningTokens = Math.round(
      completed.reduce((s, r) => s + r.reasoningTokens, 0) / count
    );
    const meanOutputTokens = Math.round(
      completed.reduce((s, r) => s + r.outputTokens, 0) / count
    );
    const totalTokensMean = meanReasoningTokens + meanOutputTokens;
    const reasoningSharePct =
      totalTokensMean > 0
        ? Math.round((meanReasoningTokens / totalTokensMean) * 100)
        : 0;

    summaries.push({
      groupKey,
      modelConfigId: first.modelConfigId,
      modelName: first.modelName,
      providerName: first.providerName,
      modelId: first.modelId,
      reasoningEffort: first.reasoningEffort,
      runCount: count,
      successRate,
      meanTtftMs: mean((r) => r.ttftMs),
      p50TtftMs: Number(calculatePercentile(ttfts, 50).toFixed(1)),
      p95TtftMs: Number(calculatePercentile(ttfts, 95).toFixed(1)),
      meanThinkingMs: mean((r) => r.thinkingDurationMs),
      meanGenerationMs: mean((r) => r.generationDurationMs),
      meanTpotMs: Number(
        (completed.reduce((s, r) => s + r.tpotMs, 0) / count).toFixed(2)
      ),
      meanOutputTps: Number(
        (completed.reduce((s, r) => s + r.outputTps, 0) / count).toFixed(1)
      ),
      meanTotalTps: Number(
        (completed.reduce((s, r) => s + r.totalTps, 0) / count).toFixed(1)
      ),
      meanE2eMs: mean((r) => r.e2eMs),
      meanReasoningTokens,
      meanOutputTokens,
      reasoningSharePct,
      meanQualityScore: Math.round(
        completed.reduce((s, r) => s + r.quality.overallScore, 0) / count
      ),
    });
  }

  const effortOrder: Record<ReasoningEffort, number> = {
    none: 0,
    minimal: 1,
    low: 2,
    medium: 3,
    high: 4,
    xhigh: 5,
    max: 6,
  };

  return summaries.sort((a, b) => {
    const modelCmp = a.modelName.localeCompare(b.modelName);
    if (modelCmp !== 0) return modelCmp;
    return effortOrder[a.reasoningEffort] - effortOrder[b.reasoningEffort];
  });
}

export function maskSecretHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const lower = k.toLowerCase();
    if (
      lower === 'authorization' ||
      lower === 'x-api-key' ||
      lower === 'x-goog-api-key'
    ) {
      if (v.length <= 12) {
        masked[k] = '••••••••';
      } else {
        masked[k] = `${v.slice(0, 10)}••••${v.slice(-4)}`;
      }
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

export function exportResultsAsJson(runs: BenchmarkRunResult[]): string {
  const sanitized = runs.map((r) => ({
    ...r,
    requestSnapshot: {
      ...r.requestSnapshot,
      headers: maskSecretHeaders(r.requestSnapshot.headers),
    },
  }));
  return JSON.stringify(sanitized, null, 2);
}

export function exportResultsAsCsv(runs: BenchmarkRunResult[]): string {
  const headers = [
    'id',
    'timestamp',
    'providerName',
    'modelName',
    'modelId',
    'reasoningEffort',
    'status',
    'ttftMs',
    'thinkingDurationMs',
    'generationDurationMs',
    'e2eMs',
    'tpotMs',
    'outputTps',
    'totalTps',
    'reasoningTokens',
    'outputTokens',
    'jitterStdDevMs',
    'qualityScore',
    'rubricMatchRate',
  ];
  const rows = runs.map((r) =>
    [
      r.id,
      r.timestamp,
      `"${r.providerName.replace(/"/g, '""')}"`,
      `"${r.modelName.replace(/"/g, '""')}"`,
      r.modelId,
      r.reasoningEffort,
      r.status,
      r.ttftMs,
      r.thinkingDurationMs,
      r.generationDurationMs,
      r.e2eMs,
      r.tpotMs,
      r.outputTps,
      r.totalTps,
      r.reasoningTokens,
      r.outputTokens,
      r.jitterStdDevMs,
      r.quality.overallScore,
      r.quality.rubricMatchRate,
    ].join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export function exportResultsAsMarkdown(runs: BenchmarkRunResult[]): string {
  const groups = aggregateComparisonGroups(runs);
  const lines: string[] = [
    '# TokenLab 模型 API 基准对比报告',
    '',
    `生成时间: ${new Date().toISOString()} · 样本总数: ${runs.length}`,
    '',
    '## 1. 汇总指标对比',
    '',
    '| 模型 | 提供商 | Reasoning Effort | 样本数 | 可用率 | TTFT P50 | TTFT P95 | TPOT | Output TPS | E2E (s) | 推理占比 | 质量评分 |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];

  for (const g of groups) {
    lines.push(
      `| ${g.modelName} | ${g.providerName} | ${g.reasoningEffort} | ${g.runCount} | ${g.successRate}% | ${g.p50TtftMs} ms | ${g.p95TtftMs} ms | ${g.meanTpotMs} ms | ${g.meanOutputTps} | ${(g.meanE2eMs / 1000).toFixed(2)} | ${g.reasoningSharePct}% | ${g.meanQualityScore}/100 |`
    );
  }

  return lines.join('\n');
}
