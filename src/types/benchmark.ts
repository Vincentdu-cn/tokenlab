export type ApiProviderFormat =
  | 'openai-chat'
  | 'openai-responses'
  | 'anthropic'
  | 'gemini';

export type ReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export type ReasoningMappingMode =
  | 'reasoning_effort'
  | 'reasoning.effort'
  | 'thinking_budget'
  | 'thinking_level'
  | 'custom';

export type NavTab =
  | 'workbench'
  | 'providers'
  | 'prompts'
  | 'reports'
  | 'history'
  | 'mcp';

export type PromptCategory =
  | 'reasoning'
  | 'coding'
  | 'extraction'
  | 'synthesis'
  | 'custom';

export interface HeaderParam {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface ApiProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  format: ApiProviderFormat;
  customHeaders: HeaderParam[];
}

export interface ModelConfig {
  id: string;
  providerId: string;
  name: string;
  modelId: string;
  reasoningMapping: ReasoningMappingMode;
  customReasoningPath: string;
  customEffortValues: Partial<Record<ReasoningEffort, string>>;
  customHeaders: HeaderParam[];
  extraBodyJson: string;
  enabled: boolean;
}

export interface BenchmarkPrompt {
  id: string;
  title: string;
  category: PromptCategory;
  systemPrompt: string;
  userPrompt: string;
  userMessages?: string[];
  requireJson: boolean;
  expectedKeywords: string[];
  minChars: number;
}

export interface BenchmarkTestSuite {
  id: string;
  name: string;
  category: PromptCategory;
  description: string;
  cases: BenchmarkPrompt[];
}

export interface TokenTimingSample {
  elapsedMs: number;
  cumulativeTokens: number;
  instantTps: number;
  phase: 'reasoning' | 'content';
}

export interface QualityAssessment {
  overallScore: number;
  jsonValid: boolean | null;
  rubricMatchRate: number;
  structureScore: number;
  reasoningEfficiencyRatio: number;
  stopReason: string;
  manualRating: number | null;
  notes: string;
}

export interface RequestSnapshot {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface BenchmarkRunResult {
  id: string;
  batchId: string;
  timestamp: string;
  providerId: string;
  providerName: string;
  modelConfigId: string;
  modelName: string;
  modelId: string;
  format: ApiProviderFormat;
  reasoningEffort: ReasoningEffort;
  promptId: string;
  promptTitle: string;
  status: 'running' | 'completed' | 'error';
  errorMessage?: string;
  httpStatus?: number;
  ttftMs: number;
  thinkingDurationMs: number;
  generationDurationMs: number;
  e2eMs: number;
  tpotMs: number;
  outputTps: number;
  totalTps: number;
  promptTokens: number;
  reasoningTokens: number;
  outputTokens: number;
  jitterStdDevMs: number;
  reasoningText: string;
  outputText: string;
  samples: TokenTimingSample[];
  quality: QualityAssessment;
  requestSnapshot: RequestSnapshot;
}

export interface ComparisonGroupSummary {
  groupKey: string;
  modelConfigId: string;
  modelName: string;
  providerName: string;
  modelId: string;
  reasoningEffort: ReasoningEffort;
  runCount: number;
  successRate: number;
  meanTtftMs: number;
  p50TtftMs: number;
  p95TtftMs: number;
  meanThinkingMs: number;
  meanGenerationMs: number;
  meanTpotMs: number;
  meanOutputTps: number;
  meanTotalTps: number;
  meanE2eMs: number;
  meanReasoningTokens: number;
  meanOutputTokens: number;
  reasoningSharePct: number;
  meanQualityScore: number;
}
