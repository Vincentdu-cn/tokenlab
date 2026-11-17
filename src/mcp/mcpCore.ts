import type {
  ApiProvider,
  ApiProviderFormat,
  BenchmarkPrompt,
  BenchmarkRunResult,
  BenchmarkTestSuite,
  ModelConfig,
  PromptCategory,
  ReasoningEffort,
  ReasoningMappingMode,
} from '../types/benchmark';
import { DEFAULT_TEST_SUITES } from '../data/seedData';
import {
  aggregateComparisonGroups,
  ALL_REASONING_EFFORTS,
  buildRequestConfig,
  computeRunMetrics,
  estimateTokenCount,
  evaluateResponseQuality,
  extractStreamDelta,
  maskSecretHeaders,
  parseSseDataLine,
} from '../utils/metrics';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MCP_SERVER_INFO = {
  name: 'tokenlab-mcp-server',
  version: '1.0.0',
  protocolVersion: '2024-11-05',
};

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'tokenlab_list_test_suites',
    description:
      '列出 TokenLab 基准测试集与自动评分规则（Rubric），可按任务分类（extraction / coding / reasoning / synthesis / custom）筛选。',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['extraction', 'coding', 'reasoning', 'synthesis', 'custom'],
          description: '可选：按任务分类过滤测试集',
        },
      },
    },
  },
  {
    name: 'tokenlab_build_request_payload',
    description:
      '根据提供商协议格式（openai-chat / openai-responses / anthropic / gemini）、模型与 Reasoning Effort 强度（none ~ max，支持 custom 自定义路径映射），构建标准化流式请求 URL、脱敏 Headers 与合并后的 Body。',
    inputSchema: {
      type: 'object',
      properties: {
        format: {
          type: 'string',
          enum: ['openai-chat', 'openai-responses', 'anthropic', 'gemini'],
          description: '网关接口协议格式',
        },
        baseUrl: {
          type: 'string',
          description: 'API 网关 Base URL，例如 https://openrouter.ai/api/v1',
        },
        modelId: {
          type: 'string',
          description: '模型 ID，例如 inclusionai/ling-3.2-flash:free 或 gpt-5.2',
        },
        reasoningEffort: {
          type: 'string',
          enum: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
          description: '推理思考强度档位',
        },
        reasoningMapping: {
          type: 'string',
          enum: [
            'reasoning.effort',
            'reasoning_effort',
            'thinking_budget',
            'thinking_level',
            'custom',
          ],
          description: 'Reasoning 参数映射方式',
        },
        customReasoningPath: {
          type: 'string',
          description: '当 reasoningMapping=custom 时的点分字段路径，例如 extra_body.thinking.budget',
        },
        customEffortValue: {
          type: 'string',
          description: '当 reasoningMapping=custom 时当前档位的自定义映射值',
        },
        systemPrompt: {
          type: 'string',
          description: '可选 System Prompt',
        },
        userPrompt: {
          type: 'string',
          description: '测试输入 User Prompt',
        },
        extraBody: {
          type: 'object',
          description: '可选额外合并到请求 Body 的 JSON 对象',
        },
      },
      required: ['baseUrl', 'modelId', 'reasoningEffort', 'userPrompt'],
    },
  },
  {
    name: 'tokenlab_evaluate_response_quality',
    description:
      '根据测试集 Rubric 自动评估大模型输出质量，计算 JSON 契约合法性、期望关键词命中率、结构完整度、推理效率比与综合质量分（0-100）。',
    inputSchema: {
      type: 'object',
      properties: {
        outputText: {
          type: 'string',
          description: '模型生成的正文文本',
        },
        reasoningText: {
          type: 'string',
          description: '可选：模型生成的思考链（Reasoning）文本',
        },
        requireJson: {
          type: 'boolean',
          description: '是否强制校验输出为合法 JSON',
        },
        expectedKeywords: {
          type: 'array',
          items: { type: 'string' },
          description: '期望在输出中命中的关键词列表',
        },
        minChars: {
          type: 'number',
          description: '期望最小输出字符数（默认 120）',
        },
      },
      required: ['outputText'],
    },
  },
  {
    name: 'tokenlab_run_model_benchmark',
    description:
      '对指定大模型 API 发起真实流式（SSE）速度与质量基准测试，测量 TTFT 首字延迟、Thinking 推理耗时、TPOT 单 Token 耗时、Output TPS 吞吐量、抖动标准差及自动质量评分。',
    inputSchema: {
      type: 'object',
      properties: {
        baseUrl: {
          type: 'string',
          description: 'API 网关 Base URL，例如 https://openrouter.ai/api/v1',
        },
        apiKey: {
          type: 'string',
          description: '用于发起流式请求的 API Key',
        },
        format: {
          type: 'string',
          enum: ['openai-chat', 'openai-responses', 'anthropic', 'gemini'],
          description: '接口协议格式，默认 openai-chat',
        },
        modelId: {
          type: 'string',
          description: '模型 ID，例如 inclusionai/ling-3.2-flash:free',
        },
        reasoningEffort: {
          type: 'string',
          enum: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
          description: '推理思考程度档位，默认 low',
        },
        reasoningMapping: {
          type: 'string',
          enum: [
            'reasoning.effort',
            'reasoning_effort',
            'thinking_budget',
            'thinking_level',
            'custom',
          ],
          description: 'Reasoning 参数映射模式，默认 reasoning.effort',
        },
        customReasoningPath: {
          type: 'string',
          description: '当 reasoningMapping=custom 时的点分路径',
        },
        userPrompt: {
          type: 'string',
          description: '测试提示词（若不传则使用指定 suiteId 的首条用例）',
        },
        suiteId: {
          type: 'string',
          description: '可选：使用预设或已保存测试集 ID（如 suite-arch-json）',
        },
        extraHeaders: {
          type: 'object',
          description: '可选：附加 HTTP 请求头键值对',
        },
        extraBody: {
          type: 'object',
          description: '可选：附加合并到请求 Body 的 JSON 参数',
        },
      },
      required: ['baseUrl', 'apiKey', 'modelId'],
    },
  },
  {
    name: 'tokenlab_compare_effort_sweep',
    description:
      '对比单个模型在多个 Reasoning Effort 强度档位下（或多组历史测试样本）的延迟、吞吐、推理 Token 占比与质量得分，输出帕累托最优档位建议。',
    inputSchema: {
      type: 'object',
      properties: {
        runs: {
          type: 'array',
          description: '待聚合分析的基准测试运行记录数组（BenchmarkRunResult[]）',
          items: { type: 'object' },
        },
        modelId: {
          type: 'string',
          description: '可选：仅过滤特定 modelId 的测试记录',
        },
      },
      required: ['runs'],
    },
  },
];

export interface McpExecutionContext {
  testSuites?: BenchmarkTestSuite[];
  runs?: BenchmarkRunResult[];
  fetchImpl?: typeof fetch;
}

function asFormat(raw: unknown): ApiProviderFormat {
  if (
    raw === 'openai-chat' ||
    raw === 'openai-responses' ||
    raw === 'anthropic' ||
    raw === 'gemini'
  ) {
    return raw;
  }
  return 'openai-chat';
}

function asEffort(raw: unknown): ReasoningEffort {
  if (typeof raw === 'string' && ALL_REASONING_EFFORTS.includes(raw as ReasoningEffort)) {
    return raw as ReasoningEffort;
  }
  return 'low';
}

function asMapping(raw: unknown): ReasoningMappingMode {
  if (
    raw === 'reasoning_effort' ||
    raw === 'reasoning.effort' ||
    raw === 'thinking_budget' ||
    raw === 'thinking_level' ||
    raw === 'custom'
  ) {
    return raw;
  }
  return 'reasoning.effort';
}

export async function executeMcpToolCall(
  toolName: string,
  args: Record<string, unknown> = {},
  ctx: McpExecutionContext = {}
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean; structured?: unknown }> {
  const suites = ctx.testSuites && ctx.testSuites.length > 0 ? ctx.testSuites : DEFAULT_TEST_SUITES;

  if (toolName === 'tokenlab_list_test_suites') {
    const categoryFilter = typeof args.category === 'string' ? args.category : null;
    const filtered = categoryFilter
      ? suites.filter((s) => s.category === categoryFilter)
      : suites;
    const payload = {
      totalSuites: filtered.length,
      suites: filtered.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        description: s.description,
        caseCount: s.cases.length,
        cases: s.cases.map((c) => ({
          id: c.id,
          title: c.title,
          systemPrompt: c.systemPrompt,
          userPrompt: c.userPrompt,
          requireJson: c.requireJson,
          expectedKeywords: c.expectedKeywords,
          minChars: c.minChars,
        })),
      })),
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structured: payload,
    };
  }

  if (toolName === 'tokenlab_build_request_payload') {
    const baseUrl = String(args.baseUrl ?? 'https://openrouter.ai/api/v1');
    const modelId = String(args.modelId ?? 'inclusionai/ling-3.2-flash:free');
    const format = asFormat(args.format);
    const effort = asEffort(args.reasoningEffort);
    const mapping = asMapping(args.reasoningMapping);
    const customPath = String(args.customReasoningPath ?? 'reasoning.effort');
    const customVal =
      typeof args.customEffortValue === 'string' ? args.customEffortValue : undefined;

    const provider: ApiProvider = {
      id: 'mcp-prov',
      name: 'MCP Provider',
      baseUrl,
      apiKey: 'sk-mcp-preview-key',
      format,
      customHeaders: [],
    };

    const model: ModelConfig = {
      id: 'mcp-model',
      providerId: 'mcp-prov',
      name: modelId,
      modelId,
      reasoningMapping: mapping,
      customReasoningPath: customPath,
      customEffortValues: customVal ? { [effort]: customVal } : {},
      customHeaders: [],
      extraBodyJson:
        args.extraBody && typeof args.extraBody === 'object'
          ? JSON.stringify(args.extraBody)
          : '{}',
      enabled: true,
    };

    const prompt: BenchmarkPrompt = {
      id: 'mcp-prompt',
      title: 'MCP Prompt',
      category: 'custom',
      systemPrompt: String(args.systemPrompt ?? ''),
      userPrompt: String(args.userPrompt ?? 'Hello'),
      requireJson: false,
      expectedKeywords: [],
      minChars: 20,
    };

    const built = buildRequestConfig({
      provider,
      model,
      prompt,
      reasoningEffort: effort,
      globalHeaders: [],
      globalExtraBodyJson: '{}',
      requireAuth: false,
    });

    if (!built.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: built.error }, null, 2) }],
        structured: { error: built.error },
      };
    }

    const output = {
      url: built.url,
      method: 'POST',
      headers: maskSecretHeaders(built.headers),
      body: built.body,
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
      structured: output,
    };
  }

  if (toolName === 'tokenlab_evaluate_response_quality') {
    const outputText = String(args.outputText ?? '');
    const reasoningText = String(args.reasoningText ?? '');
    const requireJson = Boolean(args.requireJson);
    const expectedKeywords = Array.isArray(args.expectedKeywords)
      ? args.expectedKeywords.map((x) => String(x))
      : [];
    const minChars = typeof args.minChars === 'number' ? args.minChars : 120;

    const reasoningTokens = estimateTokenCount(reasoningText);
    const outputTokens = estimateTokenCount(outputText);

    const prompt: BenchmarkPrompt = {
      id: 'mcp-eval',
      title: 'MCP Quality Eval',
      category: 'custom' as PromptCategory,
      systemPrompt: '',
      userPrompt: '',
      requireJson,
      expectedKeywords,
      minChars,
    };

    const quality = evaluateResponseQuality({
      outputText,
      reasoningTokens,
      outputTokens,
      prompt,
      stopReason: 'stop',
    });

    const payload = {
      quality,
      tokenEstimates: {
        reasoningTokens,
        outputTokens,
        reasoningSharePct:
          reasoningTokens + outputTokens > 0
            ? Math.round((reasoningTokens / (reasoningTokens + outputTokens)) * 100)
            : 0,
      },
    };
    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      structured: payload,
    };
  }

  if (toolName === 'tokenlab_run_model_benchmark') {
    const baseUrl = String(args.baseUrl ?? '').trim();
    const apiKey = String(args.apiKey ?? '').trim();
    const modelId = String(args.modelId ?? '').trim();
    if (!baseUrl || !apiKey || !modelId) {
      const errObj = {
        error: '参数缺失：baseUrl、apiKey 与 modelId 均为必填项。',
      };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(errObj, null, 2) }],
        structured: errObj,
      };
    }

    const format = asFormat(args.format);
    const effort = asEffort(args.reasoningEffort);
    const mapping = asMapping(args.reasoningMapping);
    const suite =
      suites.find((s) => s.id === args.suiteId) ?? suites[0] ?? DEFAULT_TEST_SUITES[0];
    const baseCase = suite.cases[0];

    const prompt: BenchmarkPrompt =
      typeof args.userPrompt === 'string' && args.userPrompt.trim()
        ? {
            id: 'mcp-live-prompt',
            title: 'MCP Live Prompt',
            category: 'custom',
            systemPrompt: '',
            userPrompt: args.userPrompt.trim(),
            requireJson: false,
            expectedKeywords: [],
            minChars: 60,
          }
        : baseCase;

    const extraHeadersObj =
      args.extraHeaders && typeof args.extraHeaders === 'object'
        ? (args.extraHeaders as Record<string, string>)
        : {};

    const provider: ApiProvider = {
      id: 'mcp-live-prov',
      name: 'MCP Direct Provider',
      baseUrl,
      apiKey,
      format,
      customHeaders: Object.entries(extraHeadersObj).map(([k, v], i) => ({
        id: `mh-${i}`,
        key: k,
        value: String(v),
        enabled: true,
      })),
    };

    const model: ModelConfig = {
      id: 'mcp-live-model',
      providerId: provider.id,
      name: modelId,
      modelId,
      reasoningMapping: mapping,
      customReasoningPath: String(args.customReasoningPath ?? 'reasoning.effort'),
      customEffortValues: {},
      customHeaders: [],
      extraBodyJson:
        args.extraBody && typeof args.extraBody === 'object'
          ? JSON.stringify(args.extraBody)
          : '{}',
      enabled: true,
    };

    const built = buildRequestConfig({
      provider,
      model,
      prompt,
      reasoningEffort: effort,
      globalHeaders: [],
      globalExtraBodyJson: '{}',
      requireAuth: true,
    });

    if (!built.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: built.error }, null, 2) }],
        structured: { error: built.error },
      };
    }

    const fetchFn = ctx.fetchImpl ?? fetch;
    const startTimeMs = performance.now();
    try {
      const response = await fetchFn(built.url, {
        method: 'POST',
        headers: built.headers,
        body: JSON.stringify(built.body),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        const errPayload = {
          status: 'error',
          httpStatus: response.status,
          errorMessage: `HTTP ${response.status}: ${errText.slice(0, 240)}`,
        };
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify(errPayload, null, 2) }],
          structured: errPayload,
        };
      }

      let firstTokenMs: number | null = null;
      let firstContentTokenMs: number | null = null;
      let lastTokenMs: number | null = null;
      const interTokenDeltasMs: number[] = [];
      let reasoningText = '';
      let outputText = '';
      let promptTokens = estimateTokenCount(prompt.systemPrompt + prompt.userPrompt);
      let reportedReasoningTokens: number | undefined;
      let reportedOutputTokens: number | undefined;
      let finishReason = 'stop';

      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            const parsed = parseSseDataLine(line);
            if (!parsed || parsed === 'DONE') continue;
            const delta = extractStreamDelta(parsed, format);
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
              if (lastTokenMs !== null) interTokenDeltasMs.push(now - lastTokenMs);
              lastTokenMs = now;
              reasoningText += delta.reasoningDelta;
              outputText += delta.contentDelta;
            }
          }
        }
      } else {
        outputText = await response.text();
        firstTokenMs = performance.now();
        firstContentTokenMs = firstTokenMs;
      }

      const endTimeMs = performance.now();
      const finalReasoningTokens =
        reportedReasoningTokens ?? estimateTokenCount(reasoningText);
      const finalOutputTokens = reportedOutputTokens ?? estimateTokenCount(outputText);
      const metrics = computeRunMetrics({
        startTimeMs,
        firstTokenMs,
        firstContentTokenMs,
        endTimeMs,
        interTokenDeltasMs,
        reasoningTokens: finalReasoningTokens,
        outputTokens: finalOutputTokens,
      });
      const quality = evaluateResponseQuality({
        outputText,
        reasoningTokens: finalReasoningTokens,
        outputTokens: finalOutputTokens,
        prompt,
        stopReason: finishReason,
      });

      const resultPayload = {
        status: 'completed',
        modelId,
        format,
        reasoningEffort: effort,
        metrics,
        tokens: {
          promptTokens,
          reasoningTokens: finalReasoningTokens,
          outputTokens: finalOutputTokens,
        },
        quality,
        reasoningPreview: reasoningText.slice(0, 300),
        outputPreview: outputText.slice(0, 500),
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(resultPayload, null, 2) }],
        structured: resultPayload,
      };
    } catch (err) {
      const errPayload = {
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Network error',
      };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(errPayload, null, 2) }],
        structured: errPayload,
      };
    }
  }

  if (toolName === 'tokenlab_compare_effort_sweep') {
    const rawRuns = Array.isArray(args.runs)
      ? (args.runs as BenchmarkRunResult[])
      : ctx.runs ?? [];
    const modelFilter =
      typeof args.modelId === 'string' && args.modelId.trim()
        ? args.modelId.trim().toLowerCase()
        : null;

    const filteredRuns = modelFilter
      ? rawRuns.filter(
          (r) =>
            r.modelId?.toLowerCase().includes(modelFilter) ||
            r.modelName?.toLowerCase().includes(modelFilter)
        )
      : rawRuns;

    const groups = aggregateComparisonGroups(filteredRuns);
    const bestTtft = [...groups].sort((a, b) => a.meanTtftMs - b.meanTtftMs)[0] ?? null;
    const bestTps = [...groups].sort((a, b) => b.meanOutputTps - a.meanOutputTps)[0] ?? null;
    const bestQuality =
      [...groups].sort((a, b) => b.meanQualityScore - a.meanQualityScore)[0] ?? null;

    const summary = {
      totalAnalyzedRuns: filteredRuns.length,
      groupCount: groups.length,
      recommendations: {
        lowestLatencyTtft: bestTtft
          ? `${bestTtft.modelName} (effort=${bestTtft.reasoningEffort}, TTFT=${bestTtft.meanTtftMs}ms)`
          : null,
        highestThroughputTps: bestTps
          ? `${bestTps.modelName} (effort=${bestTps.reasoningEffort}, TPS=${bestTps.meanOutputTps} tok/s)`
          : null,
        highestQuality: bestQuality
          ? `${bestQuality.modelName} (effort=${bestQuality.reasoningEffort}, Quality=${bestQuality.meanQualityScore}/100)`
          : null,
      },
      groups,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
      structured: summary,
    };
  }

  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: `未知的 MCP 工具: ${toolName}` }, null, 2),
      },
    ],
  };
}

export async function handleMcpJsonRpc(
  req: JsonRpcRequest,
  ctx: McpExecutionContext = {}
): Promise<JsonRpcResponse> {
  const id = req.id ?? null;

  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32600,
        message: 'Invalid JSON-RPC 2.0 Request',
      },
    };
  }

  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: MCP_SERVER_INFO.protocolVersion,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: MCP_SERVER_INFO.name,
          version: MCP_SERVER_INFO.version,
        },
      },
    };
  }

  if (req.method === 'notifications/initialized' || req.method === 'ping') {
    return {
      jsonrpc: '2.0',
      id,
      result: {},
    };
  }

  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS,
      },
    };
  }

  if (req.method === 'tools/call') {
    const params = req.params ?? {};
    const toolName = typeof params.name === 'string' ? params.name : '';
    const toolArgs =
      params.arguments && typeof params.arguments === 'object'
        ? (params.arguments as Record<string, unknown>)
        : {};

    const result = await executeMcpToolCall(toolName, toolArgs, ctx);
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: result.content,
        isError: Boolean(result.isError),
      },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32601,
      message: `Method not found: ${req.method}`,
    },
  };
}
