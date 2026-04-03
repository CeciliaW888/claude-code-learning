# Day 21: 终极项目 — 构建你的 AI Agent CLI 工具

[← 上一天: 多 Agent 系统](./day-20-multi-agent.md) | [课程首页](../README.md)

---

## 🎯 学习目标

1. 将 21 天所学**整合**为一个完整项目
2. 构建一个**可工作的 AI Agent CLI**原型
3. 回顾和巩固**核心架构**知识
4. 规划**下一步学习**方向
5. 建立**持续学习**的框架和资源

**难度:** 🔴 高级 | **预计时间:** 1 小时（计划 15 分钟 + 编码 45 分钟）

---

## 📚 核心概念

### 21 天知识总结

回顾我们学过的所有内容。每一天都是在前一天的基础上构建的，最终形成了一个完整的 AI Agent 系统的知识体系：

```
第一周 🟢 基础
  Day 01: 架构三层（表现层 / 核心层 / 服务层）
  Day 02: 启动优化（并行初始化、延迟加载）
  Day 03: Ink UI（React 在终端中的应用）
  Day 04: REPL（交互式命令循环）
  Day 05: Tool 系统（统一接口 + 动态注册）
  Day 06: 消息类型（tool_use / tool_result 配对）
  Day 07: 第一周回顾与整合

第二周 🟡 实战
  Day 08: BashTool 安全（命令验证和沙盒）
  Day 09: 文件操作（读取、编辑、搜索工具）
  Day 10: Agent 循环（感知 → 思考 → 行动）
  Day 11: 上下文管理（System Prompt 动态组装）
  Day 12: 压缩技术（上下文窗口优化）
  Day 13: 子 Agent（任务委派和结果收集）
  Day 14: 第二周回顾与整合

第三周 🔴 进阶
  Day 15: 权限系统（多层安全防御）
  Day 16: MCP 协议（标准化工具集成）
  Day 17: 任务系统（并行执行和后台管理）
  Day 18: 状态管理（AppState 和会话恢复）
  Day 19: 成本优化（Token 预算和 Prompt Cache）
  Day 20: 多 Agent（Team/Swarm 协作模式）
  Day 21: 终极项目（就是今天！）
```

### 架构回顾：从整体到细节

整个 Agent CLI 的架构可以用这张图概括：

```
┌──────────────────────────────────────────────────────┐
│                    表现层 (Ink/React)                  │
│  ┌──────┐  ┌──────────┐  ┌────────┐  ┌──────────┐  │
│  │输入框│  │消息列表   │  │状态栏  │  │权限对话框│  │
│  └──────┘  └──────────┘  └────────┘  └──────────┘  │
├──────────────────────────────────────────────────────┤
│                    核心层 (Agent Loop)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │消息管理   │  │工具系统   │  │上下文 & 压缩     │  │
│  │          │  │          │  │                  │  │
│  │ messages │  │ tools[]  │  │ system prompt    │  │
│  │ history  │  │ execute  │  │ compaction       │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
├──────────────────────────────────────────────────────┤
│                    服务层 (External)                   │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌─────┐ │
│  │Claude│  │文件   │  │Shell │  │MCP   │  │状态 │ │
│  │ API  │  │系统   │  │命令  │  │Server│  │持久化│ │
│  └──────┘  └──────┘  └──────┘  └──────┘  └─────┘ │
└──────────────────────────────────────────────────────┘
```

这三层分离的好处：
- **表现层**可以替换（从 Ink 换成 Web UI 或 VS Code 插件）
- **核心层**是可复用的业务逻辑
- **服务层**可以独立测试和替换

### 从源码到产品的关键洞察

学完 21 天后，你应该对以下设计决策有深入理解：

**1. 为什么用 TypeScript + Ink？**
TypeScript 提供类型安全，减少运行时错误。Ink 让终端 UI 可以用 React 的声明式模式编写——这意味着 Web 前端工程师可以快速上手，也意味着可以复用 React 生态的状态管理方案。

**2. 为什么 Agent 循环是生成器（Generator）？**
生成器允许在 Agent 循环的每一步 yield 中间结果（流式文本、工具调用），让 UI 可以实时更新。传统的 async/await 只能在完全完成后返回结果。

**3. 为什么权限系统是多层的？**
单一层面的安全容易被绕过。多层防御确保即使一层失效，其他层仍然提供保护。这是"纵深防御"原则在 AI Agent 中的应用。

**4. 为什么需要上下文压缩？**
LLM 的上下文窗口有限。长时间运行的 Agent 会话会产生大量消息和工具输出，不进行压缩就会超出限制或产生高昂成本。

---

## 🔑 关键术语

| 术语 | 定义 | 对应课程 |
|------|------|---------|
| **三层架构** | 表现层 / 核心层 / 服务层的分离设计 | Day 01 |
| **Agent Loop** | 感知→思考→行动的循环模式 | Day 10 |
| **Tool System** | 统一接口、动态注册的工具系统 | Day 05 |
| **Prompt Cache** | 复用请求前缀的计算，降低成本 | Day 19 |
| **Compaction** | 压缩对话历史，优化上下文窗口使用 | Day 12 |
| **MCP** | Model Context Protocol，AI 工具集成标准 | Day 16 |
| **Team/Swarm** | 多 Agent 协作模式 | Day 20 |

---

## 💻 代码示例

### 终极项目：My Agent CLI

### 目标

构建一个具备以下核心能力的 Agent CLI：

1. CLI 入口（Commander.js）
2. 终端 UI（Ink）
3. Agent 循环（Claude API + Tool 执行）
4. 至少 3 个工具（Bash、FileRead、FileEdit）
5. 权限控制（危险命令需确认）
6. 流式输出
7. 成本追踪
8. 加分项：上下文压缩、会话恢复

### 项目结构

```
my-agent-cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.tsx          # CLI 入口
│   ├── App.tsx            # Ink 顶层组件
│   ├── REPL.tsx           # REPL 交互组件
│   ├── agent/
│   │   ├── loop.ts        # Agent 循环
│   │   ├── stream.ts      # 流式处理
│   │   └── context.ts     # 上下文管理
│   ├── tools/
│   │   ├── index.ts       # 工具注册
│   │   ├── bash.ts        # BashTool
│   │   ├── fileRead.ts    # FileReadTool
│   │   └── fileEdit.ts    # FileEditTool
│   ├── permissions/
│   │   └── check.ts       # 权限检查
│   ├── state/
│   │   └── AppState.ts    # 状态管理
│   └── utils/
│       ├── cost.ts        # 成本追踪
│       ├── messages.ts    # 消息工具
│       └── tokens.ts      # Token 估算
└── README.md
```

### 核心代码

#### 1. 入口 (index.tsx)

```tsx
#!/usr/bin/env node
import { Command } from 'commander'
import { render } from 'ink'
import React from 'react'
import { App } from './App.js'

const program = new Command()
  .name('my-agent')
  .version('1.0.0')
  .argument('[prompt...]')
  .option('-m, --model <model>', '模型', 'claude-sonnet-4-20250514')
  .option('-p, --print', '非交互模式')
  .option('--resume <sessionId>', '恢复之前的会话')
  .parse()

const opts = program.opts()
const prompt = program.args.join(' ')

render(<App model={opts.model} initialPrompt={prompt} printMode={opts.print} />)
```

#### 2. Agent 循环 (agent/loop.ts)

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { tools } from '../tools/index.js'
import { checkPermission } from '../permissions/check.js'
import { CostTracker } from '../utils/cost.js'

const client = new Anthropic()
const costTracker = new CostTracker()

export async function* agentLoop(prompt: string, model: string) {
  const messages = [{ role: 'user' as const, content: prompt }]
  
  for (let turn = 0; turn < 20; turn++) {
    // 流式调用 API
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema
      })),
      messages
    })
    
    // 收集完整响应，同时 yield 增量文本
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && 
          event.delta.type === 'text_delta') {
        yield { type: 'text', text: event.delta.text }
      }
    }
    
    const response = await stream.finalMessage()
    messages.push({ role: 'assistant', content: response.content })
    
    // 追踪成本
    costTracker.record(model, response.usage)
    yield { type: 'cost', cost: costTracker.getTotalCost() }
    
    // 检查工具调用
    const toolUses = response.content.filter(b => b.type === 'tool_use')
    if (toolUses.length === 0) {
      yield { type: 'done' }
      return
    }
    
    // 执行工具（带权限检查）
    const toolResults = []
    for (const tu of toolUses) {
      yield { type: 'tool_start', name: tu.name, input: tu.input }
      
      // 权限检查
      const allowed = await checkPermission(tu.name, tu.input)
      if (!allowed) {
        toolResults.push({
          type: 'tool_result', tool_use_id: tu.id,
          content: '用户拒绝了此操作'
        })
        yield { type: 'tool_denied', name: tu.name }
        continue
      }
      
      const tool = tools.find(t => t.name === tu.name)
      const result = tool ? await tool.execute(tu.input) : '工具未找到'
      toolResults.push({
        type: 'tool_result', tool_use_id: tu.id, content: result
      })
      yield { type: 'tool_result', name: tu.name, result }
    }
    
    messages.push({ role: 'user', content: toolResults })
  }
}
```

#### 3. REPL 组件 (REPL.tsx)

```tsx
import React, { useState, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import { agentLoop } from './agent/loop.js'

export function REPL({ model }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [cost, setCost] = useState(0)
  
  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isRunning) return
    
    setMessages(prev => [...prev, { role: 'user', text: input }])
    setIsRunning(true)
    
    let responseText = ''
    for await (const event of agentLoop(input, model)) {
      if (event.type === 'text') {
        responseText += event.text
      } else if (event.type === 'tool_start') {
        setMessages(prev => [...prev, 
          { role: 'tool', text: `[Tool] ${event.name}: ${JSON.stringify(event.input)}` }
        ])
      } else if (event.type === 'cost') {
        setCost(event.cost)
      }
    }
    
    setMessages(prev => [...prev, { role: 'assistant', text: responseText }])
    setInput('')
    setIsRunning(false)
  }, [input, model])
  
  return (
    <Box flexDirection="column">
      {messages.map((m, i) => (
        <Box key={i}>
          <Text color={m.role === 'user' ? 'green' : m.role === 'tool' ? 'yellow' : 'blue'}>
            {m.text}
          </Text>
        </Box>
      ))}
      <Box>
        <Text color="cyan">{'> '}</Text>
        <Text>{input}</Text>
      </Box>
      <Box borderStyle="single" paddingX={1}>
        <Text dimColor>Model: {model} | Cost: ${cost.toFixed(4)}</Text>
      </Box>
    </Box>
  )
}
```

---

## ✏️ 动手练习

### 练习 1: 初始化项目 (⏱️ ~15 分钟)

创建项目目录，安装依赖，验证基本框架可以运行。

**步骤：**
1. `mkdir my-agent-cli && cd my-agent-cli`
2. `npm init -y`
3. `npm install ink react commander @anthropic-ai/sdk`
4. `npm install -D typescript @types/react`
5. 创建 `tsconfig.json`（target: ES2022, jsx: react-jsx）
6. 创建 `src/index.tsx`，验证可以编译运行

### 练习 2: 实现核心 Agent 循环 (⏱️ ~20 分钟)

实现 Agent 循环，支持至少一个工具（BashTool）。

**要求：**
- 调用 Claude API 并处理流式响应
- 实现 BashTool（需要权限检查）
- Agent 循环最多运行 10 轮
- 在没有工具调用时自动结束

### 练习 3: 组装完整 CLI (⏱️ ~10 分钟)

将入口、Agent 循环和 REPL 组装成完整的可运行 CLI。

**验证清单：**
- [ ] `my-agent "list files"` 能执行并返回结果
- [ ] 工具调用需要用户确认
- [ ] 流式输出可以逐字显示
- [ ] 成本显示在状态栏

---

## 📖 扩展阅读

1. **Commander.js — CLI 框架**
   - 🔗 https://github.com/tj/commander.js
   - 推荐：理解 CLI 参数解析最佳实践

2. **Ink — 终端 React**
   - 🔗 https://github.com/vadimdemedes/ink
   - 推荐：Ink 组件库和高级用法

3. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：流式 API 和工具调用的完整示例

4. **Anthropic Streaming API**
   - 🔗 https://docs.anthropic.com/en/api/messages-streaming
   - 推荐：理解流式事件的完整生命周期

5. **MCP 官方文档**
   - 🔗 https://modelcontextprotocol.io/
   - 推荐：为你的 Agent 添加 MCP 支持的下一步

---

## 🤔 思考题

1. 如果让你从零重新设计一个 AI Agent CLI，你会做出和 Claude Code 不同的设计决策吗？哪些方面？
2. 这 21 天中，哪个概念对你影响最大？它改变了你对 AI Agent 的哪些认知？
3. 你觉得 AI Agent CLI 的未来方向是什么？5 年后它会变成什么样？
4. 多 Agent 协作和人类团队协作有什么异同？AI Agent 的"团队协作"还缺少什么？
5. 如果你要把这个终极项目扩展为一个真正的产品，第一步会做什么？

---

## ✅ 课程完成清单

### 核心概念 ✓

- [ ] 三层架构（表现层 / 核心层 / 服务层）
- [ ] Agent 循环（感知 → 思考 → 行动）
- [ ] Tool 系统（统一接口 + 动态注册）
- [ ] 消息类型（tool_use / tool_result 配对）
- [ ] 权限模型（多层安全防御）
- [ ] 上下文管理（System Prompt + 压缩）
- [ ] 多 Agent 协作（子 Agent + Team + Swarm）

### 实践技能 ✓

- [ ] Commander.js CLI 解析
- [ ] Ink 终端 UI
- [ ] Anthropic API 调用（含流式）
- [ ] Tool 实现（Bash / FileRead / FileEdit）
- [ ] 权限控制实现
- [ ] 成本追踪
- [ ] 会话状态管理

---

## ➡️ 下一步

### 1. 深入源码

继续阅读 Claude Code 的源码：
- `src/services/mcp/` — MCP 完整实现
- `src/coordinator/` — Coordinator 模式
- `src/utils/bash/ast.ts` — 命令 AST 解析
- `src/services/compact/` — 高级压缩策略

### 2. 构建真实项目

- 给你的 Agent 添加 MCP 支持
- 实现完整的会话恢复系统
- 添加更多工具（Web 搜索、数据库查询）
- 构建自定义 Agent 定义系统

### 3. 社区参与

- 关注 Claude Code 的更新
- 学习 MCP 生态中的新工具
- 在 GitHub 上分享你的 Agent 项目
- 参与 AI Agent 相关社区讨论

### 自检清单

- [ ] 我能独立搭建一个 Agent CLI 项目
- [ ] 我理解 Claude Code 的整体架构和设计决策
- [ ] 我能实现基本的 Agent 循环、工具系统和权限控制
- [ ] 我知道如何优化成本和性能
- [ ] 我有信心继续深入学习和构建更复杂的 Agent 系统

---

## 🎓 结语

21 天前，Claude Code 的 516K 行代码对你来说是一个黑盒。现在，你理解了它的架构、工具系统、Agent 循环、安全模型、上下文管理——以及如何构建类似的工具。

**最重要的不是你记住了多少代码，而是你掌握了 AI Agent CLI 工具的设计思维。**

这些模式——统一的 Tool 接口、感知-思考-行动循环、多层安全防御、动态上下文组装——不仅适用于 Claude Code，它们是所有 AI Agent 系统的通用设计语言。

去构建你自己的 Agent 吧。

---

[← 上一天: 多 Agent 系统](./day-20-multi-agent.md) | [课程首页](../README.md)
