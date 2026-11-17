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
