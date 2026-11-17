import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateComparisonGroups,
  buildRequestConfig,
  computeRunMetrics,
  evaluateResponseQuality,
  extractStreamDelta,
  formatExpectedKeywords,
  parseExpectedKeywords,
  parseSseDataLine,
} from './metrics';
import type {
  ApiProvider,
  BenchmarkPrompt,
  BenchmarkRunResult,
  ModelConfig,
} from '../types/benchmark';
import { DEFAULT_TEST_SUITES } from '../data/seedData';
import { handleMcpJsonRpc, MCP_TOOLS } from '../mcp/mcpCore';

const sampleProvider: ApiProvider = {
  id: 'prov-or',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-or-v1-test-key-123456',
  format: 'openai-chat',
  customHeaders: [
    { id: 'ph1', key: 'HTTP-Referer', value: 'https://tokenlab.local', enabled: true },
  ],
};

const sampleModel: ModelConfig = {
  id: 'mod-1',
  providerId: 'prov-or',
  name: 'Ling 3.2 Flash',
  modelId: 'inclusionai/ling-3.2-flash:free',
  reasoningMapping: 'reasoning.effort',
  customReasoningPath: 'reasoning.effort',
  customEffortValues: {},
  customHeaders: [
    { id: 'mh1', key: 'X-Model-Tag', value: 'flash', enabled: true },
    { id: 'mh2', key: 'X-Disabled', value: 'ignore', enabled: false },
  ],
  extraBodyJson: '{"temperature": 0.2, "max_completion_tokens": 2048}',
  enabled: true,
};

const samplePrompt: BenchmarkPrompt = {
  id: 'p-1',
  title: 'JSON Extraction',
  category: 'extraction',
  systemPrompt: 'Respond with valid JSON.',
  userPrompt: 'Extract fields: latency and throughput.',
  requireJson: true,
  expectedKeywords: ['latency', 'throughput'],
  minChars: 20,
};

test('parseSseDataLine parses JSON and DONE markers cleanly', () => {
  assert.equal(parseSseDataLine(''), null);
  assert.equal(parseSseDataLine(': keep-alive'), null);
  assert.equal(parseSseDataLine('data: [DONE]'), 'DONE');
  assert.deepEqual(parseSseDataLine('data: {"ok":true}'), { ok: true });
});

test('extractStreamDelta handles OpenAI reasoning_content and OpenRouter reasoning_details', () => {
  const openRouterChunk = {
    choices: [
      {
        delta: {
          reasoning_details: [{ type: 'reasoning.text', text: 'Deliberating step 1. ' }],
          content: 'Result',
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 42,
      completion_tokens: 18,
      completion_tokens_details: { reasoning_tokens: 10 },
    },
  };

  const parsed = extractStreamDelta(openRouterChunk, 'openai-chat');
  assert.equal(parsed.reasoningDelta, 'Deliberating step 1. ');
  assert.equal(parsed.contentDelta, 'Result');
  assert.equal(parsed.finishReason, 'stop');
  assert.equal(parsed.promptTokens, 42);
  assert.equal(parsed.outputTokens, 18);
  assert.equal(parsed.reasoningTokens, 10);
});

test('buildRequestConfig merges 2-level provider + model headers, max effort, and extra body', () => {
  const built = buildRequestConfig({
    provider: sampleProvider,
    model: sampleModel,
    prompt: samplePrompt,
    reasoningEffort: 'max',
    globalHeaders: [{ id: 'g1', key: 'X-Suite', value: 'v2', enabled: true }],
    globalExtraBodyJson: '{"top_p": 0.9}',
    requireAuth: true,
  });

  assert.equal(built.ok, true);
  if (built.ok) {
    assert.equal(built.url, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(built.headers['Authorization'], 'Bearer sk-or-v1-test-key-123456');
    assert.equal(built.headers['HTTP-Referer'], 'https://tokenlab.local');
    assert.equal(built.headers['X-Model-Tag'], 'flash');
    assert.equal(built.headers['X-Disabled'], undefined);
    assert.equal(built.headers['X-Suite'], 'v2');
    assert.deepEqual(built.body.reasoning, { effort: 'max' });
    assert.equal(built.body.temperature, 0.2);
    assert.equal(built.body.top_p, 0.9);
  }
});

test('buildRequestConfig supports custom reasoning dot-path and typed custom values', () => {
  const customModel: ModelConfig = {
    ...sampleModel,
    reasoningMapping: 'custom',
    customReasoningPath: 'extra_body.thinking.budget',
    customEffortValues: {
      max: '32000',
      none: '{"enabled": false}',
    },
  };

  const builtMax = buildRequestConfig({
    provider: sampleProvider,
    model: customModel,
    prompt: samplePrompt,
    reasoningEffort: 'max',
    globalHeaders: [],
    globalExtraBodyJson: '',
    requireAuth: true,
  });
  assert.equal(builtMax.ok, true);
  if (builtMax.ok) {
    assert.deepEqual(builtMax.body.extra_body, { thinking: { budget: 32000 } });
  }

  const builtNone = buildRequestConfig({
    provider: sampleProvider,
    model: customModel,
    prompt: samplePrompt,
    reasoningEffort: 'none',
    globalHeaders: [],
    globalExtraBodyJson: '',
    requireAuth: true,
  });
  assert.equal(builtNone.ok, true);
  if (builtNone.ok) {
    assert.deepEqual(builtNone.body.extra_body, {
      thinking: { budget: { enabled: false } },
    });
  }
});

test('computeRunMetrics calculates TTFT, thinking/generation duration, TPOT, and TPS accurately', () => {
  const metrics = computeRunMetrics({
    startTimeMs: 1000,
    firstTokenMs: 1200,
    firstContentTokenMs: 1600,
    endTimeMs: 2600,
    interTokenDeltasMs: [10, 12, 8, 10],
    reasoningTokens: 40,
    outputTokens: 100,
  });

  assert.equal(metrics.ttftMs, 200);
  assert.equal(metrics.thinkingDurationMs, 400);
  assert.equal(metrics.generationDurationMs, 1000);
  assert.equal(metrics.e2eMs, 1600);
  assert.equal(metrics.outputTps, 100);
  assert.equal(metrics.totalTps, 100);
  assert.ok(metrics.tpotMs > 10 && metrics.tpotMs < 10.2);
  assert.ok(metrics.jitterStdDevMs > 1 && metrics.jitterStdDevMs < 2);
});

test('evaluateResponseQuality scores valid JSON and keyword rubric matches', () => {
  const pass = evaluateResponseQuality({
    outputText: '```json\n{"latency": 120, "throughput": 95.4}\n```',
    reasoningTokens: 50,
    outputTokens: 50,
    prompt: samplePrompt,
    stopReason: 'stop',
  });
  assert.equal(pass.jsonValid, true);
  assert.equal(pass.rubricMatchRate, 100);
  assert.equal(pass.overallScore, 100);
});

test('aggregateComparisonGroups calculates successRate, reasoningSharePct, and averages', () => {
  const baseRun: BenchmarkRunResult = {
    id: 'r1',
    batchId: 'b1',
    timestamp: '2026-11-17T00:00:00.000Z',
    providerId: 'prov-or',
    providerName: 'OpenRouter',
    modelConfigId: 'mod-1',
    modelName: 'Ling 3.2 Flash',
    modelId: 'inclusionai/ling-3.2-flash:free',
    format: 'openai-chat',
    reasoningEffort: 'max',
    promptId: 'p-1',
    promptTitle: 'JSON Extraction',
    status: 'completed',
    ttftMs: 200,
    thinkingDurationMs: 300,
    generationDurationMs: 1000,
    e2eMs: 1500,
    tpotMs: 10,
    outputTps: 100,
    totalTps: 90,
    promptTokens: 50,
    reasoningTokens: 100,
    outputTokens: 100,
    jitterStdDevMs: 2,
    reasoningText: '...',
    outputText: '{}',
    samples: [],
    quality: {
      overallScore: 95,
      jsonValid: true,
      rubricMatchRate: 100,
      structureScore: 100,
      reasoningEfficiencyRatio: 0.5,
      stopReason: 'stop',
      manualRating: null,
      notes: '',
    },
    requestSnapshot: { url: 'https://openrouter.ai/api/v1/chat/completions', headers: {}, body: {} },
  };

  const runs: BenchmarkRunResult[] = [
    baseRun,
    { ...baseRun, id: 'r2', status: 'error', errorMessage: '429' },
  ];

  const groups = aggregateComparisonGroups(runs);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].runCount, 1);
  assert.equal(groups[0].successRate, 50);
  assert.equal(groups[0].reasoningSharePct, 50);
});

test('parseExpectedKeywords normalizes delimiters, trims whitespace, and deduplicates case-insensitively', () => {
  const parsed = parseExpectedKeywords('latency, throughput，Latency\nJSON ,  , tpot ');
  assert.deepEqual(parsed, ['latency', 'throughput', 'JSON', 'tpot']);
  assert.equal(formatExpectedKeywords(parsed), 'latency, throughput, JSON, tpot');
});

test('MCP JSON-RPC 2.0 handles initialize, tools/list, and tools/call cleanly', async () => {
  const initRes = await handleMcpJsonRpc({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
  });
  assert.equal(initRes.jsonrpc, '2.0');
  assert.equal(initRes.id, 1);
  assert.ok(initRes.result);

  const listRes = await handleMcpJsonRpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
  });
  const listResult = listRes.result as { tools: typeof MCP_TOOLS };
  assert.equal(listResult.tools.length, 5);

  const buildCall = await handleMcpJsonRpc({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'tokenlab_build_request_payload',
      arguments: {
        format: 'openai-chat',
        baseUrl: 'https://openrouter.ai/api/v1',
        modelId: 'inclusionai/ling-3.2-flash:free',
        reasoningEffort: 'max',
        reasoningMapping: 'reasoning.effort',
        userPrompt: 'Test prompt',
      },
    },
  });
  const callResult = buildCall.result as {
    content: Array<{ type: string; text: string }>;
    isError: boolean;
  };
  assert.equal(callResult.isError, false);
  const parsedPayload = JSON.parse(callResult.content[0].text) as {
    url: string;
    body: { reasoning: { effort: string } };
  };
  assert.equal(parsedPayload.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.deepEqual(parsedPayload.body.reasoning, { effort: 'max' });
});

test('Built-in OpenViking suite preserves 1 system + 5 user messages from attached request log', () => {
  const openvikingSuite = DEFAULT_TEST_SUITES.find(
    (s) => s.id === 'suite-openviking-memory'
  );
  assert.ok(openvikingSuite);
  assert.equal(openvikingSuite.cases.length, 1);
  const promptCase = openvikingSuite.cases[0];
  assert.equal(promptCase.userMessages?.length, 5);
  assert.ok(promptCase.systemPrompt.includes('memory extraction and maintenance agent'));

  const built = buildRequestConfig({
    provider: sampleProvider,
    model: sampleModel,
    prompt: promptCase,
    reasoningEffort: 'low',
    globalHeaders: [],
    globalExtraBodyJson: '{}',
    requireAuth: true,
  });
  assert.equal(built.ok, true);
  if (built.ok) {
    const msgs = built.body.messages as Array<{ role: string; content: string }>;
    assert.equal(msgs.length, 6);
    assert.equal(msgs[0].role, 'system');
    assert.equal(msgs[1].role, 'user');
    assert.equal(msgs[5].role, 'user');
    assert.ok(msgs[5].content.includes('identity_1'));
  }

  const combinedText = `${promptCase.systemPrompt}\n${promptCase.userPrompt}`;
  assert.ok(combinedText.includes('lab.example.invalid'));
  assert.ok(combinedText.includes('10.10.0.1'));
  assert.ok(combinedText.includes('198.51.100.11'));
  assert.equal(/\b192\.168\.\d+\.\d+\b/.test(combinedText), false);
  assert.equal(/\bssh\b/i.test(combinedText), false);
  assert.equal(/\.(fun|xyz)\b/i.test(combinedText), false);
  assert.equal(/\bv\d+\.\d+\.\d+\b/.test(combinedText), false);
});
