import type {
  ApiProvider,
  BenchmarkPrompt,
  BenchmarkRunResult,
  HeaderParam,
  ModelConfig,
  ReasoningEffort,
  TokenTimingSample,
} from '../types/benchmark';
import {
  buildRequestConfig,
  computeRunMetrics,
  estimateTokenCount,
  evaluateResponseQuality,
  extractStreamDelta,
  parseSseDataLine,
} from '../utils/metrics';

export interface RunExecutionParams {
  batchId: string;
  provider: ApiProvider;
  model: ModelConfig;
  prompt: BenchmarkPrompt;
  reasoningEffort: ReasoningEffort;
  globalHeaders: HeaderParam[];
  globalExtraBodyJson: string;
  abortSignal?: AbortSignal;
  onProgress: (partial: BenchmarkRunResult) => void;
}

export async function executeBenchmarkRun(
  params: RunExecutionParams
): Promise<BenchmarkRunResult> {
  const {
    batchId,
    provider,
    model,
    prompt,
    reasoningEffort,
    globalHeaders,
    globalExtraBodyJson,
    abortSignal,
    onProgress,
  } = params;

  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = new Date().toISOString();

  const built = buildRequestConfig({
    provider,
    model,
    prompt,
    reasoningEffort,
    globalHeaders,
    globalExtraBodyJson,
    requireAuth: true,
  });

  if (!built.ok) {
    const failed: BenchmarkRunResult = {
      id: runId,
      batchId,
      timestamp,
      providerId: provider.id,
      providerName: provider.name,
      modelConfigId: model.id,
      modelName: model.name,
      modelId: model.modelId,
      format: provider.format,
      reasoningEffort,
      promptId: prompt.id,
      promptTitle: prompt.title,
      status: 'error',
      errorMessage: built.error,
      ttftMs: 0,
      thinkingDurationMs: 0,
      generationDurationMs: 0,
      e2eMs: 0,
      tpotMs: 0,
      outputTps: 0,
      totalTps: 0,
      promptTokens: 0,
      reasoningTokens: 0,
      outputTokens: 0,
      jitterStdDevMs: 0,
      reasoningText: '',
      outputText: '',
      samples: [],
      quality: evaluateResponseQuality({
        outputText: '',
        reasoningTokens: 0,
        outputTokens: 0,
        prompt,
        stopReason: 'error',
      }),
      requestSnapshot: {
        url: provider.baseUrl,
        headers: {},
        body: {},
      },
    };
    onProgress(failed);
    return failed;
  }

  const baseResult: BenchmarkRunResult = {
    id: runId,
    batchId,
    timestamp,
    providerId: provider.id,
    providerName: provider.name,
    modelConfigId: model.id,
    modelName: model.name,
    modelId: model.modelId,
    format: provider.format,
    reasoningEffort,
    promptId: prompt.id,
    promptTitle: prompt.title,
    status: 'running',
    ttftMs: 0,
    thinkingDurationMs: 0,
    generationDurationMs: 0,
    e2eMs: 0,
    tpotMs: 0,
    outputTps: 0,
    totalTps: 0,
    promptTokens: estimateTokenCount(prompt.systemPrompt + prompt.userPrompt),
    reasoningTokens: 0,
    outputTokens: 0,
    jitterStdDevMs: 0,
    reasoningText: '',
    outputText: '',
    samples: [],
    quality: {
      overallScore: 0,
      jsonValid: null,
      rubricMatchRate: 0,
      structureScore: 0,
      reasoningEfficiencyRatio: 1,
      stopReason: 'streaming',
      manualRating: null,
      notes: '',
    },
    requestSnapshot: {
      url: built.url,
      headers: built.headers,
      body: built.body,
    },
  };

  onProgress(baseResult);

  const startTimeMs = performance.now();

  try {
    const response = await fetch(built.url, {
      method: 'POST',
      headers: built.headers,
      body: JSON.stringify(built.body),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const snippet = errorBody.slice(0, 280);
      const errored: BenchmarkRunResult = {
        ...baseResult,
        status: 'error',
        httpStatus: response.status,
        e2eMs: Number((performance.now() - startTimeMs).toFixed(1)),
        errorMessage: `HTTP ${response.status} ${response.statusText}${snippet ? ` — ${snippet}` : ''}`,
      };
      onProgress(errored);
      return errored;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!response.body || contentType.includes('application/json')) {
      const text = await response.text();
      const endTimeMs = performance.now();
      let outputText = text;
      let reasoningText = '';
      let promptTokens = baseResult.promptTokens;
      let reasoningTokens = 0;
      let outputTokens = 0;
      let finishReason = 'stop';

      try {
        const json = JSON.parse(text) as Record<string, unknown>;
        const choices = Array.isArray(json.choices) ? json.choices : [];
        const first = (choices[0] ?? {}) as Record<string, unknown>;
        const msg = (first.message ?? {}) as Record<string, unknown>;
        if (typeof msg.content === 'string') outputText = msg.content;
        if (typeof msg.reasoning_content === 'string') {
          reasoningText = msg.reasoning_content;
        } else if (typeof msg.reasoning === 'string') {
          reasoningText = msg.reasoning;
        }
        if (typeof first.finish_reason === 'string') finishReason = first.finish_reason;
        const usage = json.usage as Record<string, unknown> | undefined;
        if (usage) {
          if (typeof usage.prompt_tokens === 'number') promptTokens = usage.prompt_tokens;
          if (typeof usage.completion_tokens === 'number') outputTokens = usage.completion_tokens;
          const details = usage.completion_tokens_details as Record<string, unknown> | undefined;
          if (details && typeof details.reasoning_tokens === 'number') {
            reasoningTokens = details.reasoning_tokens;
          }
        }
      } catch {
        // Keep raw text fallback
      }

      if (outputTokens === 0) outputTokens = estimateTokenCount(outputText);
      if (reasoningTokens === 0 && reasoningText) {
        reasoningTokens = estimateTokenCount(reasoningText);
      }

      const metrics = computeRunMetrics({
        startTimeMs,
        firstTokenMs: endTimeMs,
        firstContentTokenMs: endTimeMs,
        endTimeMs,
        interTokenDeltasMs: [],
        reasoningTokens,
        outputTokens,
      });

      const completed: BenchmarkRunResult = {
        ...baseResult,
        ...metrics,
        status: 'completed',
        httpStatus: response.status,
        promptTokens,
        reasoningTokens,
        outputTokens,
        reasoningText,
        outputText,
        samples: [
          {
            elapsedMs: Math.round(endTimeMs - startTimeMs),
            cumulativeTokens: reasoningTokens + outputTokens,
            instantTps: metrics.outputTps,
            phase: 'content',
          },
        ],
        quality: evaluateResponseQuality({
          outputText,
          reasoningTokens,
          outputTokens,
          prompt,
          stopReason: finishReason,
        }),
      };
      onProgress(completed);
      return completed;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let firstTokenMs: number | null = null;
    let firstContentTokenMs: number | null = null;
    let lastTokenMs: number | null = null;
    const interTokenDeltasMs: number[] = [];
    const samples: TokenTimingSample[] = [];
    let reasoningText = '';
    let outputText = '';
    let promptTokens = baseResult.promptTokens;
    let reportedReasoningTokens: number | undefined;
    let reportedOutputTokens: number | undefined;
    let finishReason = 'stop';
    let lastUiUpdateMs = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const parsed = parseSseDataLine(line);
        if (!parsed || parsed === 'DONE') continue;

        const delta = extractStreamDelta(parsed, provider.format);
        if (typeof delta.promptTokens === 'number') promptTokens = delta.promptTokens;
        if (typeof delta.reasoningTokens === 'number') {
          reportedReasoningTokens = delta.reasoningTokens;
        }
        if (typeof delta.outputTokens === 'number') {
          reportedOutputTokens = delta.outputTokens;
        }
        if (delta.finishReason) finishReason = delta.finishReason;

        if (delta.reasoningDelta || delta.contentDelta) {
          const now = performance.now();
          if (firstTokenMs === null) firstTokenMs = now;
          if (delta.contentDelta && firstContentTokenMs === null) {
            firstContentTokenMs = now;
          }
          if (lastTokenMs !== null) {
            interTokenDeltasMs.push(now - lastTokenMs);
          }
          lastTokenMs = now;

          reasoningText += delta.reasoningDelta;
          outputText += delta.contentDelta;

          const curReasoningTokens =
            reportedReasoningTokens ?? estimateTokenCount(reasoningText);
          const curOutputTokens = reportedOutputTokens ?? estimateTokenCount(outputText);

          if (now - lastUiUpdateMs >= 45) {
            lastUiUpdateMs = now;
            const metrics = computeRunMetrics({
              startTimeMs,
              firstTokenMs,
              firstContentTokenMs,
              endTimeMs: now,
              interTokenDeltasMs,
              reasoningTokens: curReasoningTokens,
              outputTokens: curOutputTokens,
            });
            const safeInstantTps = delta.contentDelta
              ? firstContentTokenMs !== null && now - firstContentTokenMs >= 45
                ? metrics.outputTps
                : Number(
                    (
                      ((curReasoningTokens + curOutputTokens) /
                        Math.max(45, now - (firstTokenMs ?? startTimeMs))) *
                      1000
                    ).toFixed(1)
                  )
              : Number(
                  (
                    ((curReasoningTokens + curOutputTokens) /
                      Math.max(45, now - (firstTokenMs ?? startTimeMs))) *
                    1000
                  ).toFixed(1)
                );
            samples.push({
              elapsedMs: Math.round(now - startTimeMs),
              cumulativeTokens: curReasoningTokens + curOutputTokens,
              instantTps: safeInstantTps,
              phase: delta.contentDelta ? 'content' : 'reasoning',
            });
            onProgress({
              ...baseResult,
              ...metrics,
              promptTokens,
              reasoningTokens: curReasoningTokens,
              outputTokens: curOutputTokens,
              reasoningText,
              outputText,
              samples: [...samples],
            });
          }
        }
      }
    }

    const endTimeMs = performance.now();
    const finalReasoningTokens =
      reportedReasoningTokens ?? estimateTokenCount(reasoningText);
    const finalOutputTokens = reportedOutputTokens ?? estimateTokenCount(outputText);
    const finalMetrics = computeRunMetrics({
      startTimeMs,
      firstTokenMs,
      firstContentTokenMs,
      endTimeMs,
      interTokenDeltasMs,
      reasoningTokens: finalReasoningTokens,
      outputTokens: finalOutputTokens,
    });

    if (samples.length === 0) {
      samples.push({
        elapsedMs: Math.round(endTimeMs - startTimeMs),
        cumulativeTokens: finalReasoningTokens + finalOutputTokens,
        instantTps: finalMetrics.outputTps,
        phase: 'content',
      });
    }

    const completed: BenchmarkRunResult = {
      ...baseResult,
      ...finalMetrics,
      status: 'completed',
      httpStatus: response.status,
      promptTokens,
      reasoningTokens: finalReasoningTokens,
      outputTokens: finalOutputTokens,
      reasoningText,
      outputText,
      samples,
      quality: evaluateResponseQuality({
        outputText,
        reasoningTokens: finalReasoningTokens,
        outputTokens: finalOutputTokens,
        prompt,
        stopReason: finishReason,
      }),
    };
    onProgress(completed);
    return completed;
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    const isCorsOrNetwork =
      err instanceof TypeError && /fetch|network/i.test(err.message);
    const errorMessage = isAbort
      ? '用户手动中止请求'
      : isCorsOrNetwork
        ? '浏览器直连请求失败 (可能被目标网关 CORS 策略拦截或网络不可达，请确认目标 API 支持浏览器跨域访问或检查 Base URL)'
        : err instanceof Error
          ? err.message
          : '未知网络异常';

    const errored: BenchmarkRunResult = {
      ...baseResult,
      status: 'error',
      e2eMs: Number((performance.now() - startTimeMs).toFixed(1)),
      errorMessage,
    };
    onProgress(errored);
    return errored;
  }
}
