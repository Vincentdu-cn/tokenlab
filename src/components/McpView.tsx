import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Loader2,
  Play,
  Terminal,
} from 'lucide-react';
import type {
  ApiProvider,
  BenchmarkRunResult,
  BenchmarkTestSuite,
  ModelConfig,
} from '../types/benchmark';
import {
  handleMcpJsonRpc,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from '../mcp/mcpCore';

interface McpViewProps {
  providers: ApiProvider[];
  models: ModelConfig[];
  testSuites: BenchmarkTestSuite[];
  runs: BenchmarkRunResult[];
}

type ExecutionTarget = 'http-endpoint' | 'browser-direct';

export function McpView({
  providers,
  models,
  testSuites,
  runs,
}: McpViewProps) {
  const [selectedToolName, setSelectedToolName] = useState<string>(
    MCP_TOOLS[0].name
  );
  const [executionTarget, setExecutionTarget] =
    useState<ExecutionTarget>('http-endpoint');
  const [argsJson, setArgsJson] = useState<string>('{}');
  const [rpcResponse, setRpcResponse] = useState<JsonRpcResponse | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [configTab, setConfigTab] = useState<'mcp-json' | 'curl' | 'stdio'>(
    'mcp-json'
  );

  const selectedTool = useMemo(
    () =>
      MCP_TOOLS.find((t) => t.name === selectedToolName) ?? MCP_TOOLS[0],
    [selectedToolName]
  );

  const originUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'http://localhost:3000';
  const mcpEndpointUrl = `${originUrl}/api/mcp`;

  // Generate sensible default arguments whenever the user switches tools
  useEffect(() => {
    const firstProviderWithKey =
      providers.find((p) => p.apiKey.trim()) ?? providers[0];
    const firstModel =
      models.find((m) => m.providerId === firstProviderWithKey?.id) ??
      models[0];

    if (selectedToolName === 'tokenlab_list_test_suites') {
      setArgsJson(JSON.stringify({}, null, 2));
    } else if (selectedToolName === 'tokenlab_build_request_payload') {
      setArgsJson(
        JSON.stringify(
          {
            format: firstProviderWithKey?.format ?? 'openai-chat',
            baseUrl:
              firstProviderWithKey?.baseUrl ?? 'https://openrouter.ai/api/v1',
            modelId:
              firstModel?.modelId ?? 'inclusionai/ling-3.2-flash:free',
            reasoningEffort: 'max',
            reasoningMapping: firstModel?.reasoningMapping ?? 'reasoning.effort',
            customReasoningPath:
              firstModel?.customReasoningPath ?? 'reasoning.effort',
            systemPrompt: '请严格输出 JSON 格式。',
            userPrompt: '设计一个分层令牌桶限流器并给出核心参数。',
            extraBody: { temperature: 0.2 },
          },
          null,
          2
        )
      );
    } else if (selectedToolName === 'tokenlab_evaluate_response_quality') {
      setArgsJson(
        JSON.stringify(
          {
            outputText:
              '{\n  "algorithm": "Hierarchical Edge-L1 + Sharded Redis Token Bucket",\n  "redis_lua_keys": ["rl:{hash}:tokens"],\n  "fallback_strategy": "Local adaptive sliding window",\n  "p99_latency_budget_ms": 1.8\n}',
            reasoningText: '先校核 Redis Lua 原子脚本，再确定降级窗口阈值。',
            requireJson: true,
            expectedKeywords: [
              'algorithm',
              'redis_lua_keys',
              'fallback_strategy',
              'p99_latency_budget_ms',
            ],
            minChars: 120,
          },
          null,
          2
        )
      );
    } else if (selectedToolName === 'tokenlab_run_model_benchmark') {
      setArgsJson(
        JSON.stringify(
          {
            baseUrl:
              firstProviderWithKey?.baseUrl ?? 'https://openrouter.ai/api/v1',
            apiKey: firstProviderWithKey?.apiKey || 'sk-your-api-key',
            format: firstProviderWithKey?.format ?? 'openai-chat',
            modelId:
              firstModel?.modelId ?? 'inclusionai/ling-3.2-flash:free',
            reasoningEffort: 'low',
            reasoningMapping: firstModel?.reasoningMapping ?? 'reasoning.effort',
            suiteId: testSuites[0]?.id ?? 'suite-arch-json',
          },
          null,
          2
        )
      );
    } else if (selectedToolName === 'tokenlab_compare_effort_sweep') {
      setArgsJson(
        JSON.stringify(
          {
            modelId: 'inclusionai/ling-3.2-flash:free',
            runs: runs.slice(0, 5),
          },
          null,
          2
        )
      );
    }
    setRpcResponse(null);
  }, [selectedToolName, providers, models, testSuites, runs]);

  const jsonRpcRequestPreview: JsonRpcRequest = useMemo(() => {
    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(argsJson) as Record<string, unknown>;
    } catch {
      parsedArgs = {};
    }
    return {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: selectedTool.name,
        arguments: parsedArgs,
      },
    };
  }, [selectedTool.name, argsJson]);

  const handleRunTool = async () => {
    setIsExecuting(true);
    try {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(argsJson) as Record<string, unknown>;
      } catch (e) {
        setRpcResponse({
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: -32700,
            message: `参数 JSON 语法错误: ${
              e instanceof Error ? e.message : '无法解析'
            }`,
          },
        });
        setIsExecuting(false);
        return;
      }

      const rpcPayload: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: selectedTool.name,
          arguments: parsedArgs,
        },
      };

      if (executionTarget === 'http-endpoint') {
        const res = await fetch('/api/mcp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rpcPayload),
        });
        const data = (await res.json()) as JsonRpcResponse;
        setRpcResponse(data);
      } else {
        const data = await handleMcpJsonRpc(rpcPayload, {
          testSuites,
          runs,
          fetchImpl: window.fetch.bind(window),
        });
        setRpcResponse(data);
      }
    } catch (err) {
      setRpcResponse({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : '调用失败',
        },
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const mcpClientConfigJson = useMemo(
    () =>
      JSON.stringify(
        {
          mcpServers: {
            tokenlab: {
              type: 'streamable-http',
              url: mcpEndpointUrl,
            },
          },
        },
        null,
        2
      ),
    [mcpEndpointUrl]
  );

  const curlSnippet = useMemo(
    () =>
      `curl -X POST "${mcpEndpointUrl}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(jsonRpcRequestPreview)}'`,
    [mcpEndpointUrl, jsonRpcRequestPreview]
  );

  const stdioBridgeCode = useMemo(
    () => `#!/usr/bin/env node
/**
 * TokenLab MCP Stdio Bridge (零依赖 Node.js 脚本)
 * 用法: node tokenlab-mcp-stdio.mjs
 * 将本地 Stdio JSON-RPC 2.0 消息转发至 TokenLab /api/mcp 服务端点
 */
import readline from 'node:readline';

const ENDPOINT = process.env.TOKENLAB_MCP_URL || '${mcpEndpointUrl}';

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const data = await res.json();
    process.stdout.write(JSON.stringify(data) + '\\n');
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: err.message },
      }) + '\\n'
    );
  }
});
`,
    [mcpEndpointUrl]
  );

  const copyText = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1800);
  };

  const downloadStdioScript = () => {
    const blob = new Blob([stdioBridgeCode], {
      type: 'text/javascript;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tokenlab-mcp-stdio.mjs';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            MCP 对外服务与工具调试台
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            已将 TokenLab 核心能力封装为标准 Model Context Protocol (JSON-RPC 2.0 ·{' '}
            <code className="font-mono text-xs">{MCP_SERVER_INFO.protocolVersion}</code>
            ) 工具，支持 Cursor、Claude Desktop、Windsurf 或任意 HTTP/Stdio 客户端直接调用。
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={downloadStdioScript}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>下载 Stdio 桥接脚本 (.mjs)</span>
          </button>
        </div>
      </div>

      {/* Top Endpoint Info & Client Config */}
      <section
        aria-label="MCP 服务端点与客户端接入配置"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Streamable HTTP / JSON-RPC 2.0 端点地址
            </div>
            <div className="flex items-center gap-3">
              <code className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                POST {mcpEndpointUrl}
              </code>
              <button
                type="button"
                onClick={() => copyText('endpoint', mcpEndpointUrl)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#2563EB] dark:text-blue-400 hover:underline cursor-pointer"
              >
                {copiedId === 'endpoint' ? (
                  <>
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>复制地址</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
            {(
              [
                { id: 'mcp-json', label: 'Cursor / Claude 配置 (mcp.json)' },
                { id: 'curl', label: 'cURL JSON-RPC 调用' },
                { id: 'stdio', label: 'Node.js Stdio 桥接脚本' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setConfigTab(tab.id)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                  configTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="relative">
          <pre className="p-4 bg-slate-900 dark:bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-xs font-mono overflow-x-auto leading-relaxed">
            {configTab === 'mcp-json' && mcpClientConfigJson}
            {configTab === 'curl' && curlSnippet}
            {configTab === 'stdio' && stdioBridgeCode}
          </pre>
          <button
            type="button"
            onClick={() =>
              copyText(
                'snippet',
                configTab === 'mcp-json'
                  ? mcpClientConfigJson
                  : configTab === 'curl'
                    ? curlSnippet
                    : stdioBridgeCode
              )
            }
            className="absolute top-3 right-3 inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 cursor-pointer"
          >
            {copiedId === 'snippet' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                <span>已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>复制代码</span>
              </>
            )}
          </button>
        </div>
      </section>

      {/* Main Tool Catalog & Live Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: 5 MCP Tools */}
        <aside className="lg:col-span-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              对外暴露的 MCP Tools ({MCP_TOOLS.length})
            </span>
            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
              tools/list
            </span>
          </div>

          {MCP_TOOLS.map((tool) => {
            const active = tool.name === selectedTool.name;
            const reqCount = tool.inputSchema.required?.length ?? 0;
            return (
              <button
                key={tool.name}
                type="button"
                onClick={() => setSelectedToolName(tool.name)}
                className={`w-full p-4 text-left transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-50/70 dark:bg-blue-950/30'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="font-mono text-xs font-semibold text-[#2563EB] dark:text-blue-400 truncate">
                  {tool.name}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                  {tool.description}
                </p>
                <div className="text-[11px] font-mono text-slate-400 dark:text-slate-500 mt-1.5">
                  {Object.keys(tool.inputSchema.properties).length} 个参数 ·{' '}
                  {reqCount} 个必填
                </div>
              </button>
            );
          })}
        </aside>

        {/* Right: Schema & Interactive JSON-RPC Tester */}
        <div className="lg:col-span-8 space-y-6">
          <section
            aria-label="MCP 工具在线调试器"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 space-y-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <h2 className="font-mono text-base font-semibold text-slate-900 dark:text-slate-100">
                  {selectedTool.name}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {selectedTool.description}
                </p>
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => setExecutionTarget('http-endpoint')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                    executionTarget === 'http-endpoint'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  服务端 POST /api/mcp
                </button>
                <button
                  type="button"
                  onClick={() => setExecutionTarget('browser-direct')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                    executionTarget === 'browser-direct'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  浏览器直连执行
                </button>
              </div>
            </div>

            {/* Input Schema Reference */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                参数 Schema 定义 (inputSchema)
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      <th className="py-2 px-3">参数名</th>
                      <th className="py-2 px-3">类型</th>
                      <th className="py-2 px-3">必填</th>
                      <th className="py-2 px-3">说明</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {Object.entries(selectedTool.inputSchema.properties).map(
                      ([propName, rawSpec]) => {
                        const spec = rawSpec as {
                          type?: string;
                          description?: string;
                          enum?: string[];
                        };
                        const isReq =
                          selectedTool.inputSchema.required?.includes(propName) ??
                          false;
                        return (
                          <tr key={propName}>
                            <td className="py-2 px-3 font-mono font-medium text-slate-900 dark:text-slate-100">
                              {propName}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-500 dark:text-slate-400">
                              {spec.type}
                              {spec.enum ? ` (${spec.enum.join(' | ')})` : ''}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                              {isReq ? '是' : '否'}
                            </td>
                            <td className="py-2 px-3 text-slate-600 dark:text-slate-400">
                              {spec.description}
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Arguments Editor */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="mcp-args-editor"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  调用参数 (params.arguments JSON)
                </label>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  method: &quot;tools/call&quot;
                </span>
              </div>
              <textarea
                id="mcp-args-editor"
                rows={7}
                value={argsJson}
                onChange={(e) => setArgsJson(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#2563EB]"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {executionTarget === 'http-endpoint'
                    ? '将向 POST /api/mcp 发送标准 JSON-RPC 2.0 请求'
                    : '在当前浏览器上下文直接执行 MCP 工具逻辑'}
                </span>
              </span>

              <button
                type="button"
                disabled={isExecuting}
                onClick={handleRunTool}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 rounded-md transition-colors cursor-pointer"
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>执行中...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                    <span>发送 tools/call 测试</span>
                  </>
                )}
              </button>
            </div>

            {/* JSON-RPC Response Output */}
            {rpcResponse && (
              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    JSON-RPC 2.0 响应结果
                  </span>
                  <span
                    className={`font-mono text-xs font-medium ${
                      rpcResponse.error
                        ? 'text-[#DC2626] dark:text-rose-400'
                        : 'text-[#16A34A] dark:text-emerald-400'
                    }`}
                  >
                    {rpcResponse.error ? 'ERROR' : '200 OK'}
                  </span>
                </div>
                <pre
                  aria-label="MCP JSON-RPC 响应内容"
                  className="p-4 bg-slate-900 dark:bg-slate-950 text-slate-100 border border-slate-800 rounded-md text-xs font-mono overflow-x-auto max-h-[380px] whitespace-pre-wrap break-words"
                >
                  {JSON.stringify(rpcResponse, null, 2)}
                </pre>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
