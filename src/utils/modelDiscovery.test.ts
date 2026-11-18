import test from 'node:test';
import assert from 'node:assert/strict';
import type { ApiProvider } from '../types/benchmark';
import {
  buildModelsListRequestPlan,
  filterDiscoveredModels,
  formatContextLength,
  inferReasoningMapping,
  parseModelsListResponse,
} from './modelDiscovery';

const openRouterProvider: ApiProvider = {
  id: 'prov-or',
  name: 'OpenRouter',
  baseUrl: 'https://openrouter.ai/api/v1/',
  apiKey: '',
  format: 'openai-chat',
  customHeaders: [{ id: 'h1', key: 'X-Title', value: 'TokenLab', enabled: true }],
};

const nvidiaRootProvider: ApiProvider = {
  id: 'prov-nv',
  name: 'NVIDIA NIM',
  baseUrl: 'https://integrate.api.nvidia.com',
  apiKey: 'nvapi-secret-123',
  format: 'openai-chat',
  customHeaders: [],
};

const anthropicProvider: ApiProvider = {
  id: 'prov-ant',
  name: 'Anthropic',
  baseUrl: 'https://api.anthropic.com/v1/messages',
  apiKey: 'sk-ant-123',
  format: 'anthropic',
  customHeaders: [],
};

const geminiProvider: ApiProvider = {
  id: 'prov-gem',
  name: 'Gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  apiKey: 'AIzaTestKey',
  format: 'gemini',
  customHeaders: [],
};

test('buildModelsListRequestPlan builds OpenRouter, NVIDIA NIM fallback, Anthropic, and Gemini endpoints', () => {
  const orPlan = buildModelsListRequestPlan(openRouterProvider, [
    { id: 'gh1', key: 'X-Client', value: 'TokenLab', enabled: true },
  ]);
  assert.equal(orPlan.ok, true);
  if (orPlan.ok) {
    assert.deepEqual(orPlan.urls, ['https://openrouter.ai/api/v1/models']);
    assert.equal(orPlan.headers['X-Title'], 'TokenLab');
    assert.equal(orPlan.headers['X-Client'], undefined);
    assert.equal(orPlan.headers['Authorization'], undefined);
  }

  const nvPlan = buildModelsListRequestPlan(nvidiaRootProvider);
  assert.equal(nvPlan.ok, true);
  if (nvPlan.ok) {
    assert.deepEqual(nvPlan.urls, [
      'https://integrate.api.nvidia.com/models',
      'https://integrate.api.nvidia.com/v1/models',
    ]);
    assert.equal(nvPlan.headers['Authorization'], 'Bearer nvapi-secret-123');
  }

  const antPlan = buildModelsListRequestPlan(anthropicProvider);
  assert.equal(antPlan.ok, true);
  if (antPlan.ok) {
    assert.deepEqual(antPlan.urls, ['https://api.anthropic.com/v1/models']);
    assert.equal(antPlan.headers['x-api-key'], 'sk-ant-123');
    assert.equal(antPlan.headers['anthropic-version'], '2023-06-01');
  }

  const gemPlan = buildModelsListRequestPlan(geminiProvider);
  assert.equal(gemPlan.ok, true);
  if (gemPlan.ok) {
    assert.deepEqual(gemPlan.urls, [
      'https://generativelanguage.googleapis.com/v1beta/models',
    ]);
    assert.equal(gemPlan.headers['x-goog-api-key'], 'AIzaTestKey');
  }
});

test('parseModelsListResponse normalizes OpenAI/NVIDIA, OpenRouter, Anthropic, and Gemini payloads', () => {
  const nvParsed = parseModelsListResponse(
    {
      object: 'list',
      data: [
        { id: '~alias/special', owned_by: 'alias' },
        { id: 'nvidia/llama-3.1-nemotron-70b-instruct', owned_by: 'nvidia' },
        { id: 'deepseek-ai/deepseek-r1', owned_by: 'deepseek-ai' },
      ],
    },
    'openai-chat'
  );
  assert.equal(nvParsed.length, 3);
  assert.equal(nvParsed[0].id, 'deepseek-ai/deepseek-r1');
  assert.equal(nvParsed[0].name, 'deepseek-r1');
  assert.equal(nvParsed[0].ownedBy, 'deepseek-ai');
  assert.equal(nvParsed[2].id, '~alias/special');

  const orParsed = parseModelsListResponse(
    {
      data: [
        {
          id: 'inclusionai/ling-3.2-flash:free',
          name: 'InclusionAI: Ling 3.2 Flash (free)',
          context_length: 131072,
        },
      ],
    },
    'openai-chat'
  );
  assert.equal(orParsed[0].name, 'InclusionAI: Ling 3.2 Flash (free)');
  assert.equal(orParsed[0].contextLength, 131072);
  assert.equal(orParsed[0].ownedBy, 'inclusionai');

  const antParsed = parseModelsListResponse(
    {
      data: [
        {
          id: 'claude-sonnet-4-6',
          display_name: 'Claude Sonnet 4.6',
          type: 'model',
        },
      ],
    },
    'anthropic'
  );
  assert.equal(antParsed[0].id, 'claude-sonnet-4-6');
  assert.equal(antParsed[0].name, 'Claude Sonnet 4.6');

  const gemParsed = parseModelsListResponse(
    {
      models: [
        {
          name: 'models/gemini-2.5-pro',
          displayName: 'Gemini 2.5 Pro',
          inputTokenLimit: 1048576,
          supportedGenerationMethods: ['generateContent', 'countTokens'],
        },
        {
          name: 'models/text-embedding-004',
          displayName: 'Text Embedding 004',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    },
    'gemini'
  );
  assert.equal(gemParsed.length, 1);
  assert.equal(gemParsed[0].id, 'gemini-2.5-pro');
  assert.equal(gemParsed[0].name, 'Gemini 2.5 Pro');
  assert.equal(gemParsed[0].contextLength, 1048576);
});

test('filterDiscoveredModels and inferReasoningMapping behave accurately', () => {
  const items = [
    { id: 'deepseek-ai/deepseek-r1', name: 'DeepSeek R1', ownedBy: 'deepseek-ai' },
    { id: 'meta/llama-3.3-70b-instruct', name: 'Llama 3.3 70B', ownedBy: 'meta' },
  ];
  const existing = new Set(['deepseek-ai/deepseek-r1']);

  assert.equal(filterDiscoveredModels(items, '', existing, true).length, 1);
  assert.equal(filterDiscoveredModels(items, 'deepseek', existing, false).length, 1);
  assert.equal(filterDiscoveredModels(items, 'meta', existing, true).length, 1);

  assert.equal(
    inferReasoningMapping('openai-chat', 'https://openrouter.ai/api/v1'),
    'reasoning.effort'
  );
  assert.equal(
    inferReasoningMapping('openai-chat', 'https://integrate.api.nvidia.com/v1'),
    'reasoning_effort'
  );
  assert.equal(
    inferReasoningMapping('anthropic', 'https://api.anthropic.com/v1'),
    'thinking_budget'
  );
  assert.equal(
    inferReasoningMapping('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'gemini-2.5-pro'),
    'thinking_level'
  );

  assert.equal(formatContextLength(131072), '131K ctx');
  assert.equal(formatContextLength(1048576), '1.0M ctx');
});
