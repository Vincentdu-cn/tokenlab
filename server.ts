import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { SEED_BENCHMARK_RUNS, DEFAULT_TEST_SUITES } from './src/data/seedData';
import {
  handleMcpJsonRpc,
  MCP_SERVER_INFO,
  MCP_TOOLS,
  type JsonRpcRequest,
} from './src/mcp/mcpCore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '4mb' }));

  // CORS headers for external MCP clients (Cursor, Claude Desktop, Inspector, HTTP clients)
  app.use('/api/mcp', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Mcp-Session-Id, Accept'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Convenience REST endpoint to inspect available MCP tools
  app.get('/api/mcp/tools', (_req, res) => {
    res.json({
      server: MCP_SERVER_INFO,
      tools: MCP_TOOLS,
    });
  });

  // GET /api/mcp — supports SSE handshake or server discovery metadata
  app.get('/api/mcp', (req, res) => {
    const accept = String(req.headers.accept ?? '');
    if (accept.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`event: endpoint\ndata: /api/mcp\n\n`);
      req.on('close', () => {
        res.end();
      });
      return;
    }
    res.json({
      name: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      protocolVersion: MCP_SERVER_INFO.protocolVersion,
      transport: 'streamable-http',
      endpoint: '/api/mcp',
      toolsCount: MCP_TOOLS.length,
      tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
    });
  });

  // POST /api/mcp — Standard MCP JSON-RPC 2.0 Streamable HTTP endpoint
  app.post('/api/mcp', async (req, res) => {
    try {
      const body = req.body;
      if (Array.isArray(body)) {
        const responses = await Promise.all(
          body.map((item: JsonRpcRequest) =>
            handleMcpJsonRpc(item, {
              testSuites: DEFAULT_TEST_SUITES,
              runs: SEED_BENCHMARK_RUNS,
            })
          )
        );
        res.json(responses);
        return;
      }

      const response = await handleMcpJsonRpc(body as JsonRpcRequest, {
        testSuites: DEFAULT_TEST_SUITES,
        runs: SEED_BENCHMARK_RUNS,
      });
      res.json(response);
    } catch (err) {
      res.status(500).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : 'Internal MCP server error',
        },
      });
    }
  });

  // Optional on-demand GET /models relay when a user's browser encounters CORS on gateways like NVIDIA NIM.
  // Never persists or logs request headers / API keys.
  app.post('/api/proxy/models', async (req, res) => {
    try {
      const body = (req.body ?? {}) as {
        urls?: unknown;
        headers?: unknown;
      };
      const urls = Array.isArray(body.urls)
        ? body.urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
        : [];
      if (urls.length === 0 || urls.length > 3) {
        res.status(400).json({ ok: false, error: '无效的探测 URL 列表' });
        return;
      }

      const forwardHeaders: Record<string, string> = {};
      if (body.headers && typeof body.headers === 'object' && !Array.isArray(body.headers)) {
        for (const [k, v] of Object.entries(body.headers as Record<string, unknown>)) {
          if (typeof v === 'string' && k.trim()) {
            const lower = k.toLowerCase();
            if (lower !== 'host' && lower !== 'content-length') {
              forwardHeaders[k.trim()] = v;
            }
          }
        }
      }

      let lastStatus = 502;
      let lastStatusText = 'Bad Gateway';
      let lastError = '未能从目标网关拉取模型列表';

      for (let i = 0; i < urls.length; i += 1) {
        const rawUrl = urls[i].trim();
        let parsed: URL;
        try {
          parsed = new URL(rawUrl);
        } catch {
          res.status(400).json({ ok: false, error: `无效的 URL: ${rawUrl}` });
          return;
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          res.status(400).json({ ok: false, error: '仅支持 http/https 协议' });
          return;
        }
        const hostname = parsed.hostname.toLowerCase();
        if (
          hostname === '169.254.169.254' ||
          hostname === 'metadata.google.internal'
        ) {
          res.status(403).json({ ok: false, error: '禁止访问内部元数据地址' });
          return;
        }

        const upstream = await fetch(parsed.toString(), {
          method: 'GET',
          headers: forwardHeaders,
          signal: AbortSignal.timeout(15000),
        });

        if (!upstream.ok) {
          lastStatus = upstream.status;
          lastStatusText = upstream.statusText;
          if (upstream.status === 404 && i < urls.length - 1) {
            continue;
          }
          const errSnippet = (await upstream.text().catch(() => '')).slice(0, 220).trim();
          lastError = `HTTP ${upstream.status} ${upstream.statusText}${errSnippet ? ` — ${errSnippet}` : ''}`;
          break;
        }

        const payload = (await upstream.json().catch(() => null)) as unknown;
        if (!payload) {
          lastStatus = 502;
          lastError = '目标网关返回了非 JSON 响应';
          break;
        }

        res.json({
          ok: true,
          status: upstream.status,
          url: parsed.toString(),
          payload,
        });
        return;
      }

      res.status(200).json({
        ok: false,
        status: lastStatus,
        statusText: lastStatusText,
        error: lastError,
      });
    } catch (err) {
      res.status(502).json({
        ok: false,
        error: err instanceof Error ? err.message : '代理请求失败',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TokenLab Server & MCP Endpoint listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
