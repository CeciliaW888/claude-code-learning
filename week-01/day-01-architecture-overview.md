# Day 01: 架构总览 — 从 `claude` 命令到完整系统

[课程首页](../README.md) | [下一天: 入口与启动 →](./day-02-entry-and-bootstrap.md)

---

## 🎯 学习目标

1. 理解 Claude Code 的**整体架构**和核心模块分布
2. 掌握 AI Agent CLI 工具的**三层架构**模式
3. 了解源码的**目录结构**和各模块职责
4. 建立对 516K 行代码的**宏观认知**

**难度:** 🟢 入门 | **预计时间:** 1 小时（30 分钟阅读 + 30 分钟动手）

---

## 📚 核心概念

### 什么是 AI Agent CLI 工具？

当你在终端输入 `claude "帮我重构这个函数"` 时，发生了什么？这不是一个简单的 API 调用——而是一个完整的**自主循环系统**：

1. **感知（Perceive）**：解析你的输入，收集项目上下文（git 状态、文件结构、CLAUDE.md 配置）
2. **思考（Decide）**：将上下文发送给 Claude API，获取下一步行动
3. **行动（Act）**：执行工具调用（读文件、运行命令、编辑代码）
4. **再感知**：观察工具执行结果，决定是否需要继续

这个循环会一直运行，直到任务完成、用户中断、或达到上限。

#### Agent 与传统 CLI 的本质区别

传统 CLI 工具（如 `git`、`npm`）是**确定性的**——输入相同的命令，永远得到相同的结果。而 AI Agent CLI 是**非确定性的**——同一个任务，Agent 可能选择不同的执行路径。

```
传统 CLI：
  命令 ──→ 固定逻辑 ──→ 结果
  
AI Agent CLI：
  任务描述 ──→ LLM 推理 ──→ 工具调用 ──→ 观察结果 ──→ 再推理 ──→ ...
```

这意味着 Agent CLI 的架构必须处理很多传统 CLI 不需要考虑的问题：

- **不确定性**：Agent 的行为取决于模型的推理，不可预测
- **安全性**：Agent 可以执行 Shell 命令、编辑文件，必须有权限控制
- **状态管理**：多轮交互需要维护对话历史和上下文
- **成本控制**：每次 API 调用都有 Token 成本，需要追踪和优化
- **可中断性**：用户需要随时中断 Agent 的执行

Claude Code 的架构正是围绕这些挑战而设计的。

### 三层架构

Claude Code 的架构可以分为三层：

```
┌─────────────────────────────────────┐
│  表现层 (Presentation Layer)         │
│  Ink (React for CLI) + 终端交互       │
│  screens/REPL.tsx, components/       │
├─────────────────────────────────────┤
│  核心层 (Core Layer)                 │
│  Agent 循环 + Tool 系统 + 上下文管理   │
│  QueryEngine.ts, query.ts, tools.ts  │
├─────────────────────────────────────┤
│  服务层 (Service Layer)              │
│  API 调用 + MCP + 安全 + 持久化       │
│  services/, utils/                   │
└─────────────────────────────────────┘
```

**表现层**负责用户交互——终端 UI、输入处理、消息渲染。Claude Code 选择了 Ink（React for CLI），用 React 组件的方式写终端界面，这是一个极具前瞻性的技术选择。

**核心层**是"大脑"——Agent 主循环、Tool 注册与执行、System Prompt 组装。这里决定了 Agent 怎么"想"和"做"。

**服务层**是"基础设施"——与 Anthropic API 通信、MCP 协议、权限控制、成本追踪。

#### 为什么三层而不是两层？

你可能会问：为什么不把核心层和服务层合在一起？答案是**关注点分离（Separation of Concerns）**。

想象一下，如果 Agent 循环的代码直接调用 HTTP 请求、直接读写数据库——当你要换一个 API provider 时，需要在 Agent 逻辑中到处修改。三层架构让每一层可以独立演化：

- 换 UI 框架？只改表现层，核心逻辑不变
- 换 API provider？只改服务层，Agent 循环不变
- 加新工具？只在核心层注册，其他层不需要改

这种分层在大型系统中非常常见——Web 应用的 MVC、移动端的 MVVM 都是类似思想。

#### 数据流方向

三层之间的数据流是**单向的**：

```
用户输入 → 表现层 → 核心层 → 服务层 → API
                                      ↓
用户看到 ← 表现层 ← 核心层 ← 服务层 ← 响应
```

表现层不会直接调用 API，核心层不会直接渲染 UI。这种单向数据流让系统的行为可预测，调试更容易。

### 源码目录结构

```
src/
├── main.tsx              # 入口：CLI 参数解析与启动
├── QueryEngine.ts        # 每轮对话的控制器
├── query.ts              # Agent 核心循环（无限循环）
├── Tool.ts               # Tool 接口定义
├── tools.ts              # Tool 注册表
├── context.ts            # 上下文收集（git、项目信息）
│
├── screens/              # 页面级组件
│   └── REPL.tsx          # 主交互界面（~2000 行）
├── components/           # UI 组件（100+ 文件）
│   ├── App.tsx           # 顶层组件
│   ├── PromptInput/      # 输入框
│   └── permissions/      # 权限对话框
│
├── tools/                # 所有 Tool 实现
│   ├── BashTool/         # Shell 命令执行
│   ├── FileReadTool/     # 文件读取
│   ├── FileEditTool/     # 文件编辑
│   ├── AgentTool/        # 子 Agent（多 Agent）
│   └── ...               # 30+ 种工具
│
├── services/             # 服务层
│   ├── compact/          # 上下文压缩
│   ├── mcp/              # MCP 协议
│   └── api/              # API 调用
│
├── state/                # 状态管理
├── tasks/                # 任务系统
├── utils/                # 工具函数
└── types/                # TypeScript 类型定义
```

> **关键洞察：** Claude Code 有 30+ 种工具（BashTool、FileReadTool、FileEditTool、AgentTool、WebSearchTool 等），但它们都遵循同一个 `Tool` 接口。这种统一的设计让系统极其可扩展。

### 关键设计决策

Claude Code 的架构中有几个值得注意的设计决策：

**选择 TypeScript 而非 Python**：虽然 AI 生态系统中 Python 占主导，但 CLI 工具需要快速启动、高效 I/O、和优秀的终端交互。Node.js 的事件驱动模型非常适合这些场景。更重要的是，Ink（React for CLI）生态只存在于 JavaScript 世界。

**选择 Ink 而非传统终端库**：像 `blessed` 或 `ncurses` 这些传统终端 UI 库功能强大，但开发体验差。Ink 让开发者用 React 的声明式范式写终端界面，组件可复用，状态管理清晰——这对一个 100+ 组件的复杂 UI 来说至关重要。

**统一的 Tool 接口**：所有 30+ 工具都遵循同一个接口（`ToolDef`），这意味着添加新工具的成本极低——只要实现接口就行。这种设计支撑了 Claude Code 快速迭代新功能的能力。

**并行预加载策略**：启动时立即并行预加载配置和凭证，不等待 CLI 参数解析完成。这种"贪婪式"加载策略体现了团队对用户体验的极致追求。

### 一条命令的完整旅程

让我们追踪 `claude "读取 package.json 并总结"` 的完整执行路径：

```
终端输入 "claude '读取 package.json 并总结'"
  │
  ▼
main.tsx → 解析 CLI 参数
  │
  ▼
bootstrap/state.ts → 初始化会话状态
  │
  ▼
context.ts → 收集上下文（git 状态、CLAUDE.md）
  │
  ▼
screens/REPL.tsx → 渲染终端 UI
  │
  ▼
QueryEngine.ts → submitMessage() 开始对话
  │
  ▼
query.ts → query() 循环开始
  │  ┌──────────────────────────────┐
  │  │ 1. 调用 Claude API            │
  │  │ 2. Claude 返回: 调用 FileRead  │
  │  │ 3. 执行 FileReadTool          │
  │  │ 4. 将结果返回给 Claude         │
  │  │ 5. Claude 返回: 文字总结       │
  │  │ 6. 没有更多工具调用 → 结束循环  │
  │  └──────────────────────────────┘
  │
  ▼
REPL.tsx → 渲染最终回复
```

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **Agent Loop** | 感知-思考-行动的循环，直到任务完成 | `query.ts` 中的无限 `while` 循环 |
| **Tool** | Agent 可以调用的能力（函数） | BashTool 执行 Shell 命令 |
| **QueryEngine** | 管理单轮对话的控制器 | 负责消息组装、API 调用、工具执行 |
| **System Prompt** | 告诉 Claude "你是谁、能做什么"的指令 | 包含工具列表、行为规则 |
| **REPL** | Read-Eval-Print Loop，交互式循环 | 终端中的输入→执行→输出 |
| **Ink** | 用 React 写终端 UI 的框架 | `<Box>`, `<Text>` 渲染终端界面 |
| **MCP** | Model Context Protocol，模型上下文协议 | 第三方工具集成标准 |

---

## 💻 代码示例

### 示例 1: Tool 接口定义

Claude Code 中所有工具都遵循同一个接口。这是整个 Tool 系统的基石：

```typescript
// src/Tool.ts — Tool 接口的核心结构
export type ToolInputJSONSchema = {
  type: 'object'
  properties?: { [x: string]: unknown }
}

// 每个 Tool 需要实现的核心字段
export type ToolDef = {
  name: string                    // 工具名称，如 "Bash"
  description: string             // 给 Claude 的描述
  inputSchema: ToolInputJSONSchema // 参数 JSON Schema
  
  // 执行函数：接收参数，返回结果
  call: (input: unknown, context: ToolUseContext) => Promise<ToolResultBlockParam>
  
  // 权限检查：决定是否需要用户确认
  isReadOnly: () => boolean
  needsPermission?: (input: unknown) => Promise<PermissionResult>
}
```

**要点：** 统一的 Tool 接口让 Claude Code 可以轻松添加新工具——只要实现这个接口即可。

### 示例 2: 工具注册表

```typescript
// src/tools.ts — 所有工具的注册
import { BashTool } from './tools/BashTool/BashTool.js'
import { FileReadTool } from './tools/FileReadTool/FileReadTool.js'
import { FileEditTool } from './tools/FileEditTool/FileEditTool.js'
import { FileWriteTool } from './tools/FileWriteTool/FileWriteTool.js'
import { AgentTool } from './tools/AgentTool/AgentTool.js'
import { WebSearchTool } from './tools/WebSearchTool/WebSearchTool.js'
// ... 30+ 工具导入

// 组装工具池：根据条件动态决定哪些工具可用
export function assembleToolPool(/* 参数 */): Tool[] {
  const tools = [
    BashTool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    GlobTool,
    GrepTool,
    // ... 根据权限和功能开关动态添加
  ]
  
  // 条件加载：内部工具、实验性工具
  if (feature('AGENT_TRIGGERS')) {
    tools.push(...cronTools)
  }
  
  return tools
}
```

> **💡 试一试：** 想想你自己的 Agent 工具需要哪些 Tool？列出 5 个你最想实现的，然后对比 Claude Code 的 30+ 工具列表。

---

## ✏️ 动手练习

### 练习 1: 探索目录结构 (⏱️ ~15 分钟)

**目标：** 熟悉 Claude Code 源码的组织方式

1. 克隆或打开源码目录：`~/Repos/cloud-code/claude-code-source/`
2. 统计各目录的文件数量：
   ```bash
   find src/ -type f -name "*.ts" -o -name "*.tsx" | wc -l
   find src/tools -type d -maxdepth 1 | wc -l
   find src/components -type f | wc -l
   ```
3. 看看哪个目录最大（哪个模块最复杂）

### 练习 2: 追踪一个 Tool (⏱️ ~15 分钟)

**目标：** 理解 Tool 从定义到注册的链路

1. 打开 `src/tools/GrepTool/` 目录
2. 找到工具的 `name`、`description` 和 `inputSchema`
3. 找到 `tools.ts` 中 GrepTool 是如何被注册的
4. 画一个简单的流程图：定义 → 注册 → 被 Claude 调用

### 练习 3: 设计你的 Agent (⏱️ ~20 分钟)

**目标：** 开始构思你自己的 Agent CLI 工具

在纸上或 Markdown 中回答：
- 你的 Agent 叫什么名字？
- 它解决什么问题？
- 它需要哪 5 个核心 Tool？
- 用户交互方式是什么？（REPL？单次命令？）

---

## 📖 扩展阅读

1. **Ink — React for CLI** — Vadim Demedes
   - 🔗 https://github.com/vadimdemedes/ink
   - 推荐：理解 Claude Code 为什么选择 Ink 做终端 UI

2. **Anthropic Tool Use 文档** — Anthropic
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：理解 Tool Use 的官方设计理念

3. **Anthropic TypeScript SDK** — Anthropic
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：了解 Claude Code 底层使用的 SDK

4. **TypeScript 官方文档**
   - 🔗 https://www.typescriptlang.org/docs/
   - 推荐：TypeScript 基础知识参考

---

## 🤔 思考题

1. **理解：** Claude Code 为什么要分三层架构？如果把 UI 和 Agent 逻辑混在一起会怎样？

2. **应用：** 如果你要给 Claude Code 新增一个 "数据库查询" 工具，你需要修改哪些文件？

3. **对比：** Claude Code 的 Tool 系统和 OpenAI 的 Function Calling 有什么异同？

4. **思辨：** 为什么 Claude Code 选择 TypeScript 而不是 Python？考虑到 AI 生态系统中 Python 的主导地位。

---

## ➡️ 下一步

**明天：** [Day 02 — 入口与启动](./day-02-entry-and-bootstrap.md) — 我们将深入 `main.tsx` 和 `bootstrap/state.ts`，看看 Claude Code 启动时做了什么"预热"操作。

**继续前请确认：**
- [ ] 我能说出 Claude Code 的三层架构
- [ ] 我知道 `Tool.ts` 定义了什么
- [ ] 我理解 Agent Loop 的感知-思考-行动循环
- [ ] 我开始构思自己的 Agent 工具了

[课程首页](../README.md) | [下一天: 入口与启动 →](./day-02-entry-and-bootstrap.md)
