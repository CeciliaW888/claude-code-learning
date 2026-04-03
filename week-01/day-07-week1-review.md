# Day 07: 第一周回顾 + 迷你项目

[← 上一天: 消息类型](./day-06-message-types.md) | [课程首页](../README.md) | [下一天: BashTool 深度解析 →](../week-02/day-08-bash-tool.md)

---

## 🎯 学习目标

1. 巩固第一周的**核心概念**
2. 完成**迷你项目**：一个简单的 CLI Agent 框架
3. 识别**知识薄弱点**并补充

**难度:** 🟡 中级 | **预计时间:** 1 小时（15 分钟复习 + 45 分钟项目）

---

## 📚 核心概念

### 第一周知识图谱

```
Day 01: 架构总览
  └─ 三层架构：表现层 / 核心层 / 服务层
  └─ 30+ 工具统一接口
  
Day 02: 入口与启动
  └─ 并行预加载优化
  └─ Commander.js CLI 解析
  └─ Bootstrap State 设计
  
Day 03: 终端 UI (Ink)
  └─ React for CLI
  └─ Provider 嵌套模式
  └─ Box/Text 布局
  
Day 04: REPL 与输入
  └─ 交互循环
  └─ 斜杠命令系统
  └─ Early Input 缓冲
  
Day 05: Tool 系统
  └─ ToolDef 接口
  └─ buildTool() 工厂
  └─ 生命周期：校验→权限→执行→结果
  
Day 06: 消息类型
  └─ 5 种消息类型
  └─ tool_use / tool_result 配对
  └─ 消息规范化
```

### 核心概念之间的关系

第一周学习了六个核心主题，它们之间存在紧密的关系。理解这些关系比单独记忆每个概念更重要：

```
架构总览 (Day 01)
    │
    ├── 表现层 ──→ 终端 UI / Ink (Day 03) ──→ REPL 交互 (Day 04)
    │
    ├── 核心层 ──→ Tool 系统 (Day 05) ──→ 消息类型 (Day 06)
    │               ↑
    │               │ 工具注册
    │               │
    └── 入口启动 (Day 02) ─── 初始化所有模块
```

**一条命令贯穿所有模块：**

当用户输入 `claude "帮我看看 package.json"` 时：
1. **入口启动** (Day 02)：解析 CLI 参数，初始化状态
2. **终端 UI** (Day 03)：渲染 Ink 界面，显示输入框
3. **REPL** (Day 04)：捕获用户输入，提交给 QueryEngine
4. **消息类型** (Day 06)：创建 UserMessage，发送给 API
5. **Tool 系统** (Day 05)：Claude 返回 tool_use，执行 FileReadTool
6. **消息类型** (Day 06)：创建 tool_result，返回给 Claude
7. **终端 UI** (Day 03)：渲染 Claude 的最终回复

每个模块都是这条链路上的一个环节。

### 常见误解澄清

在学习过程中，以下几点容易产生混淆：

1. **Tool 的 description 是给 Claude 看的，不是给用户看的。** 用户在终端中看到的工具信息来自 `renderToolUseMessage`，而 Claude 选择工具的依据是 `description`。

2. **消息的 `role: 'user'` 不总是用户说的话。** 工具执行结果也放在 `user` 角色的消息中，这是 API 的格式要求。

3. **REPL.tsx 是"页面"不是"组件"。** 虽然它是 React 组件，但它更像一个完整的"页面"——协调所有子组件的编排器。

4. **三层架构不是严格的三个目录。** 一个 `.tsx` 文件可能同时包含 UI 渲染（表现层）和业务逻辑（核心层），分层是概念上的，不一定是物理上的。

---

## 🔑 关键术语

| 术语 | 定义 | 出现在 |
|------|------|--------|
| **Agent Loop** | 感知-思考-行动的自主循环 | Day 01 |
| **三层架构** | 表现层 / 核心层 / 服务层 | Day 01 |
| **Bootstrap** | 启动初始化过程 | Day 02 |
| **Prefetch** | 并行预加载策略 | Day 02 |
| **Ink** | React for CLI 框架 | Day 03 |
| **Provider** | React 上下文提供者模式 | Day 03 |
| **REPL** | Read-Eval-Print Loop 交互循环 | Day 04 |
| **ToolDef** | 工具定义接口 | Day 05 |
| **buildTool** | 工具工厂函数 | Day 05 |
| **tool_use / tool_result** | 工具调用与结果的配对消息 | Day 06 |

---

## 💻 代码示例

### 关键代码模式回顾

以下是第一周出现的最重要的代码模式：

```typescript
// 模式 1: Promise.all 并行执行（Day 02）
const [branch, status, log] = await Promise.all([
  getBranch(),
  gitStatus(),
  gitLog(),
])

// 模式 2: 统一接口 + 工厂函数（Day 05）
const MyTool = buildTool({
  name: 'MyTool',
  description: '工具描述',
  inputSchema: { type: 'object', properties: { /* ... */ } },
  isReadOnly: () => true,
  async call(input, context) { /* 执行逻辑 */ }
})

// 模式 3: 消息配对（Day 06）
// tool_use.id === tool_result.tool_use_id

// 模式 4: Provider 嵌套（Day 03）
<ProviderA>
  <ProviderB>
    <App />    {/* 可以访问 A 和 B 的数据 */}
  </ProviderB>
</ProviderA>
```

---

## 🏗️ 迷你项目：Mini Agent CLI

**目标：** 构建一个能执行简单命令的 CLI Agent 框架。

### 项目结构

```
mini-agent/
├── package.json
├── src/
│   ├── index.ts        # 入口 + CLI 解析
│   ├── tools.ts        # Tool 定义
│   ├── agent.ts        # Agent 循环（模拟）
│   └── types.ts        # 消息类型
└── tsconfig.json
```

### 步骤 1: 定义类型 (types.ts)

```typescript
// src/types.ts
export type Message = {
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
}

export type ToolCall = {
  id: string
  name: string
  input: Record<string, unknown>
}

export type ToolResult = {
  toolCallId: string
  content: string
}

export type ToolDef = {
  name: string
  description: string
  execute: (input: Record<string, unknown>) => Promise<string>
}
```

### 步骤 2: 实现工具 (tools.ts)

```typescript
// src/tools.ts
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import type { ToolDef } from './types'

export const tools: ToolDef[] = [
  {
    name: 'bash',
    description: '执行 Shell 命令',
    async execute(input) {
      const { command } = input as { command: string }
      try {
        return execSync(command, { encoding: 'utf8', timeout: 5000 })
      } catch (e) {
        return `错误: ${(e as Error).message}`
      }
    }
  },
  {
    name: 'read_file',
    description: '读取文件内容',
    async execute(input) {
      const { path } = input as { path: string }
      try {
        return readFileSync(path, 'utf8')
      } catch (e) {
        return `无法读取文件: ${(e as Error).message}`
      }
    }
  },
  {
    name: 'list_files',
    description: '列出目录中的文件',
    async execute(input) {
      const { directory } = input as { directory: string }
      return execSync(`ls -la ${directory || '.'}`, { encoding: 'utf8' })
    }
  }
]
```

### 步骤 3: Agent 循环 (agent.ts)

```typescript
// src/agent.ts — 简化的 Agent 循环
import type { Message, ToolDef } from './types'

export async function runAgent(
  prompt: string,
  tools: ToolDef[],
  callLLM: (messages: Message[]) => Promise<Message>
) {
  const messages: Message[] = [
    { role: 'system', content: buildSystemPrompt(tools) },
    { role: 'user', content: prompt }
  ]
  
  // Agent 循环：最多 10 轮
  for (let turn = 0; turn < 10; turn++) {
    const response = await callLLM(messages)
    messages.push(response)
    
    // 没有工具调用 → 完成
    if (!response.toolCalls?.length) {
      return response.content
    }
    
    // 执行工具调用
    const results = await Promise.all(
      response.toolCalls.map(async (tc) => {
        const tool = tools.find(t => t.name === tc.name)
        if (!tool) return { toolCallId: tc.id, content: '未找到工具' }
        const result = await tool.execute(tc.input)
        return { toolCallId: tc.id, content: result }
      })
    )
    
    messages.push({
      role: 'user',
      content: '',
      toolResults: results
    })
  }
  
  return '达到最大循环次数'
}

function buildSystemPrompt(tools: ToolDef[]): string {
  const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n')
  return `你是一个编程助手。可用工具：\n${toolList}`
}
```

### 步骤 4: 入口 (index.ts)

```typescript
// src/index.ts
import { Command } from 'commander'
import { tools } from './tools'
import { runAgent } from './agent'

const program = new Command()
  .name('mini-agent')
  .argument('[prompt...]', '提示词')
  .parse()

const prompt = program.args.join(' ')
if (!prompt) {
  console.log('用法: mini-agent "你的指令"')
  process.exit(1)
}

// 模拟 LLM 调用（实际应用中替换为真实 API）
async function mockLLM(messages) {
  // 简单模式匹配，模拟 Claude 的工具调用决策
  const lastUser = messages[messages.length - 1]
  // ... 根据输入决定调用哪个工具
}

runAgent(prompt, tools, mockLLM).then(console.log)
```

---

## ✏️ 动手练习

### 练习 1: 扩展迷你项目 — 添加权限控制 (⏱️ ~20 分钟)

在上面的迷你项目基础上，给 `bash` 工具添加权限检查：
- 安全命令（`ls`、`cat`、`echo`）直接执行
- 危险命令（`rm`、`sudo`、`chmod`）需要用户确认
- 在执行前打印 `⚠️ 即将执行: [命令]，确认？(y/n)`

### 练习 2: 实现消息导出 (⏱️ ~15 分钟)

写一个函数，将迷你项目的对话历史导出为 JSON 文件，格式类似 Anthropic API 的消息格式。包含 `role`、`content`、`toolCalls`、`toolResults`。

### 练习 3: 画架构图 (⏱️ ~10 分钟)

在纸上或白板上画出你理解的 Claude Code 架构图，标注：
- 三层架构的边界
- 数据流方向
- 关键文件的位置
- Agent 循环的位置

---

## ✅ 自测清单

完成以下自测，确认你掌握了本周内容：

- [ ] 能说出 Claude Code 的三层架构和每层的职责
- [ ] 能解释 `profileCheckpoint` 和 `Promise.all` 的性能优化作用
- [ ] 能用 Ink 的 `<Box>` 和 `<Text>` 写简单的终端布局
- [ ] 能实现一个 ToolDef 定义
- [ ] 能解释 tool_use 和 tool_result 的配对规则
- [ ] 完成了迷你项目的至少 2 个步骤

---

## 📖 扩展阅读

1. **Anthropic Tool Use 文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：回顾 Tool Use 的完整文档，巩固对 Tool 系统的理解

2. **Ink 官方文档**
   - 🔗 https://github.com/vadimdemedes/ink
   - 推荐：尝试用 Ink 为你的迷你项目添加终端 UI

3. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：了解如何将迷你项目的 mockLLM 替换为真实的 Claude API 调用

4. **MCP 协议**
   - 🔗 https://modelcontextprotocol.io/
   - 推荐：预习第二周将涉及的 MCP 集成内容

---

## 🤔 思考题

1. 你的迷你项目和 Claude Code 最大的差距在哪里？列出至少 3 点。
2. 如果要添加权限控制，你会怎么设计？哪些操作需要确认？
3. 回顾这一周，哪个概念最难理解？为什么？
4. 如果要把迷你项目变成一个真正可用的 Agent，第一步应该做什么？
5. Claude Code 的哪个设计决策最让你印象深刻？你会在自己的项目中使用类似的设计吗？

---

## ➡️ 下一步

**下周预告：** 第二周将深入实战——BashTool 的安全设计、Agent 核心循环、上下文压缩、子 Agent 系统。

**第一周学习的知识将是第二周的基础：**
- 三层架构 → 理解每个深入话题在架构中的位置
- Tool 系统 → 深入 BashTool 的安全设计
- 消息类型 → 理解 Agent 循环中的完整消息流
- REPL 交互 → 理解权限对话框的触发机制

**继续前请确认：**
- [ ] 我能说出 Claude Code 的三层架构和每层的职责
- [ ] 我能解释 `profileCheckpoint` 和 `Promise.all` 的性能优化作用
- [ ] 我能用 Ink 的 `<Box>` 和 `<Text>` 写简单的终端布局
- [ ] 我能实现一个 ToolDef 定义
- [ ] 我能解释 tool_use 和 tool_result 的配对规则
- [ ] 完成了迷你项目的至少 2 个步骤

[← 上一天: 消息类型](./day-06-message-types.md) | [课程首页](../README.md) | [下一天: BashTool 深度解析 →](../week-02/day-08-bash-tool.md)
