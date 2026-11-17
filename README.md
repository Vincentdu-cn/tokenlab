# TokenLab — 大模型 API 速度、推理强度与质量基准测试平台

TokenLab 是一个面向开发者与架构师的**客户端直连**大模型 API 性能评测工作台。所有基准请求均直接由访问平台的浏览器通过 `window.fetch` + SSE 流式微秒级计时发起，避免中转代理引入的额外 RTT 偏差，在同一网络环境下客观测量各模型的真实首字延迟、思考耗时、吞吐量、抖动与响应质量。

同时，平台内置标准 **MCP (Model Context Protocol)** Streamable HTTP 服务端点，可将测试集读取、请求构造、质量评估、流式测速与推理梯度分析能力直接暴露给 Cursor、Claude Desktop 或其他 Agent 客户端调用。

---

## 核心特性

- **客户端浏览器直连测速**：API Key 与测试记录仅保存在本地浏览器 `localStorage`，直连目标网关，消除服务端中转误差。
- **双层级「提供商与模型」管理**：先配置提供商（Base URL、API Key、接口协议格式与全局/提供商级 Headers），再在其下挂载多个模型及各自独立的推理映射与 Body 参数。
- **多协议原生适配**：支持 `openai-chat`（含 OpenRouter `delta.reasoning_details`）、`openai-responses`、`anthropic`、`gemini` 四种主流流式协议。
- **7 档 Reasoning Effort 矩阵扫描**：支持 `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` 多选组合扫频，并提供 `reasoning.effort`、`reasoning_effort`、`thinking_budget`、`thinking_level` 以及 **Custom 自定义点分路径映射**（如 `extra_body.thinking.budget`）。
- **自定义测试集管理**：支持新建、编辑、复制与删除多用例测试集，可配置 System/User Prompt、JSON 契约校验、期望关键词 Rubric 与最小字符阈值，并内置脱敏版 12K 上下文真实回放测试集。
- **多维可视化对比报告**：自动生成质量-速度帕累托前沿图、Reasoning Effort 推理强度梯度曲线、端到端耗时阶段拆解图（TTFT + Thinking + Generation）、P50/P95 分位统计、可用率与推理 Token 占比对比。
- **标准 MCP 服务对外开放**：内置 `POST /api/mcp`（JSON-RPC 2.0）与 `GET /api/mcp/tools` 端点，附带交互式「MCP 服务」调试台与配置复制工具。
- **浅色 / 深色主题切换**：内置简约主题切换与响应式布局。

---

## 核心监控指标

| 指标 | 说明 |
| --- | --- |
| **TTFT (Time to First Token)** | 从发起请求到收到首个非空推理或正文增量块的时间（ms），支持均值、P50 与 P95 统计。 |
| **Thinking Duration** | 收到首个推理 Token 到收到首个正文内容 Token 之间的纯思考耗时（ms / s）。 |
| **TPOT (Time Per Output Token)** | 生成阶段平均每 Token 耗时（ms/tok）。 |
| **Output TPS / Total TPS** | 纯正文生成吞吐量与含推理 Token 在内的总输出吞吐量（tok/s），实时绘制瞬时速率波形。 |
| **Jitter (抖动标准差)** | 流式 chunk 到达间隔的标准差（ms），衡量输出平滑度。 |
| **可用率与推理占比** | 模型请求成功率（%）以及推理 Token 占总生成 Token 的比例（%）。 |
| **质量自动评分 (0-100)** | 基于期望关键词命中率（45%）、结构充实度（45%）与 JSON 契约合法性（10%）自动计算，支持人工 1-5 星复核打分与备注。 |

---

## 快速开始

### 环境要求

- Node.js >= 20
- npm

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境（端口 `3000`）

```bash
npm run dev
```

服务由 `tsx server.ts` 启动，同时挂载 Vite 开发中间件与 `/api/mcp` 后端路由，访问 `http://localhost:3000` 即可使用。

### 3. 类型检查与单元测试

```bash
# TypeScript 类型检查
npm run lint

# 运行核心指标、请求构造、脱敏回归与 MCP JSON-RPC 单元测试
npx --yes tsx --test src/utils/metrics.test.ts
```

### 4. 生产构建与运行

```bash
npm run build
NODE_ENV=production npm start
```

---

## 功能模块说明

1. **测试工作台 (`WorkbenchView`)**：勾选已配置 Key 的模型与多个 Reasoning Effort 档位，选择测试集或输入临时文本，实时监控流式瞬时吞吐波形、Reasoning Trace 与正文输出流。
2. **提供商与模型 (`ProvidersView`)**：以「提供商 → 模型」二层级结构管理网关地址、Key、协议格式、自定义 Headers 与额外 Body JSON；支持单模型独立设置 Reasoning 参数映射路径与各档位映射值。
3. **测试集 (`TestSuitesView`)**：管理多用例测试集、System/User 提示词、JSON 契约与 Rubric 关键词评分规则；支持随时一键恢复默认内置测试集。
4. **对比报告 (`ReportsView`)**：聚合分析各模型在不同推理强度下的 P50/P95 延迟、吞吐、质量分、可用率与推理占比，提供多维图表对比。
5. **运行历史 (`HistoryView`)**：按模型、状态或批次检索历史样本，支持并排查看完整请求快照（URL / 脱敏 Headers / Body）、推理过程与正文输出，并可导出 JSON 报告。
6. **MCP 服务 (`McpView`)**：展示 MCP Streamable HTTP 接入地址与客户端配置 JSON，支持在页面内直接调用调试各个 MCP 工具。

---

## 内置测试集

平台默认提供 5 个开箱即用的基准测试集（所有内置示例均已做脱敏处理）：

- `suite-openviking-memory`：**OpenViking 记忆抽取与超长 Profile 维护 (12K Context)**（默认置顶；包含 1 条 System Prompt + 5 条 User Messages 的长上下文多段结构，用于测试 12K+ 输入下的 TTFT 与受限 Python SDK DSL 生成能力）
- `suite-arch-json`：**分布式限流器架构与 JSON 契约输出**
- `suite-code-ts`：**TypeScript 并发调度器实现**
- `suite-reasoning-math`：**多阶段供应链成本最优推理**
- `suite-synthesis`：**高密度长文本技术摘要提炼**

---

## MCP 服务接入指南

应用启动后，会在同一端口提供标准 MCP (Streamable HTTP / JSON-RPC 2.0) 服务：

- **MCP JSON-RPC 端点**：`POST /api/mcp`（支持 `GET /api/mcp` 服务发现与 SSE 握手）
- **工具清单 REST 接口**：`GET /api/mcp/tools`

### 客户端配置示例（Cursor / Claude Desktop / MCP Inspector）

```json
{
  "mcpServers": {
    "tokenlab": {
      "url": "http://localhost:3000/api/mcp"
    }
  }
}
```

### 暴露的 MCP 工具

| 工具名称 | 功能描述 |
| --- | --- |
| `tokenlab_list_test_suites` | 列出内置测试集与 Rubric 评分规则，支持按分类筛选。 |
| `tokenlab_build_request_payload` | 根据协议格式、模型、Reasoning Effort 映射规则与额外 Body 参数构建标准请求 URL、脱敏 Headers 与 Body。 |
| `tokenlab_evaluate_response_quality` | 根据 JSON 校验要求、关键词列表与长度要求评估模型输出质量并返回 0-100 评分明细。 |
| `tokenlab_run_model_benchmark` | 对指定大模型 API 发起真实 SSE 流式基准请求，返回 TTFT、Thinking 耗时、TPOT、TPS、抖动及质量评分。 |
| `tokenlab_compare_effort_sweep` | 聚合对比多组测试结果或不同 Reasoning Effort 档位表现，给出帕累托最优档位建议。 |

---

## 技术栈与目录结构

- **前端**：React 19 + TypeScript + Tailwind CSS v4 + Lucide Icons + Motion
- **后端 / MCP**：Node.js + Express (`server.ts`) + Vite Middleware
- **测试**：Node.js 内置 `node:test` + `tsx`

```text
.
├── server.ts                  # Express 服务入口与 /api/mcp JSON-RPC 2.0 路由
├── metadata.json              # 应用元信息
├── public/assets/aistudio/    # 已脱敏的 12K 上下文长文本基准请求夹具
└── src/
    ├── App.tsx                # 顶层状态管理、本地持久化与视图路由
    ├── components/            # 各功能视图与纯 SVG 遥测图表组件
    ├── data/seedData.ts       # 默认提供商、模型、测试集与基线样本数据
    ├── mcp/mcpCore.ts         # MCP 协议处理与 5 个工具的核心实现
    ├── services/clientRunner.ts # 浏览器端 SSE 直连测速与微秒级计时器
    ├── types/benchmark.ts     # 核心 TypeScript 类型定义
    └── utils/
        ├── metrics.ts         # 请求构造、流解析、性能与质量计算纯函数
        └── metrics.test.ts    # 单元测试套件
```
