# Day 13: 子 Agent 工具 — 多 Agent 协作

[← 上一天: 上下文压缩](./day-12-context-compression.md) | [课程首页](../README.md) | [下一天: 第二周回顾 →](./day-14-week2-review.md)

---

## 🎯 学习目标

1. 理解 **AgentTool** 的设计——Agent 调用 Agent
2. 掌握**子 Agent 生命周期**管理
3. 了解**前台/后台 Agent** 的区别
4. 学习 Agent 间的**消息传递**和**结果汇总**
5. 能够实现一个简单的子 Agent 系统

**难度:** 🔴 高级 | **预计时间:** 1 小时

---

## 📚 核心概念

### 为什么需要子 Agent？

在复杂任务中，主 Agent 可能需要同时处理多个方面。例如"重构整个项目的错误处理"这个任务，需要：分析多个目录、理解现有模式、设计新方案、逐个文件修改。如果主 Agent 自己做所有事情，上下文窗口很快会被各种文件内容和分析结果填满。

子 Agent 解决了这个问题——每个子 Agent 有**独立的上下文窗口**，不会互相干扰。

### Agent 调用 Agent

AgentTool 是 Claude Code 最强大的工具之一——它让主 Agent 可以**派生子 Agent** 来处理子任务：

```
主 Agent 接收: "重构整个项目的错误处理"
     │
     ├─ 子 Agent 1: "分析 src/tools/ 中的错误处理模式"
     ├─ 子 Agent 2: "分析 src/services/ 中的错误处理模式"
     └─ 子 Agent 3: "建议统一的错误处理方案"
     │
     ▼
主 Agent: 汇总结果，制定计划，执行修改
```

这种模式类似于**团队协作**：项目经理（主 Agent）不自己写所有代码，而是分配任务给团队成员（子 Agent），然后汇总结果做决策。

### AgentTool 的定义

AgentTool 本身就是一个普通的工具——它的特殊之处在于 `call()` 方法中会启动一个新的 Agent 循环：

```typescript
// src/tools/AgentTool/AgentTool.tsx — 核心结构（简化）
const AgentTool = buildTool({
  name: 'Agent',
  description: `启动一个子 Agent 来处理特定任务。
子 Agent 有自己的上下文和工具访问权限。
适用于：并行处理、隔离任务、长时间运行的操作。`,
  
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '给子 Agent 的指令' },
      agent_type: { type: 'string', description: '使用哪个 Agent 定义' },
    },
    required: ['prompt']
  }
})
```

从主 Agent 的角度看，AgentTool 和其他工具没有区别——调用它，等待结果，继续工作。但从实现角度看，AgentTool 内部运行了一个完整的 Agent 循环（Day 10 学过的 query() 循环）。

### 子 Agent 执行流程

子 Agent 本质上是一个**独立的 Agent 循环**。它有自己的消息列表、System Prompt 和工具集。关键是子 Agent 和父 Agent 的**隔离性**：

```typescript
// src/tools/AgentTool/runAgent.ts — 子 Agent 执行（简化）
export async function runAgent(params: {
  prompt: string
  tools: Tool[]
  parentContext: Context
}) {
  // 1. 创建独立的消息列表（不共享父 Agent 的历史）
  const messages: Message[] = [
    createUserMessage(params.prompt)
  ]
  
  // 2. 构建子 Agent 的 System Prompt
  const systemPrompt = buildAgentSystemPrompt({
    role: params.agentDefinition?.role,
    parentContext: params.parentContext,
  })
  
  // 3. 运行独立的 Agent 循环
  const result = await query({
    systemPrompt,
    messages,
    tools: params.tools,
    // 子 Agent 有自己的 token 预算（比主 Agent 小）
    maxTokens: AGENT_TOKEN_BUDGET,
  })
  
  // 4. 返回结果给父 Agent（摘要形式）
  return summarizeAgentResult(result)
}
```

注意第 4 步的**结果摘要**——子 Agent 可能经过了 10 轮工具调用，产生了大量消息。但返回给父 Agent 的只是一个摘要。这保护了父 Agent 的上下文窗口不被子 Agent 的详细过程填满。

### 前台 vs 后台 Agent

子 Agent 有两种执行模式，影响用户体验：

```typescript
// 前台 Agent: 用户能看到实时执行过程
registerForeground(agentId)  
// → UI 显示子 Agent 的实时输出（文字、工具调用、进度）
// → 用户可以随时看到子 Agent 在做什么

// 后台 Agent: 静默执行，不干扰用户
// → 长时间运行（>2分钟）自动转为后台
const AUTO_BACKGROUND_MS = 120_000

// 后台 Agent 完成后通知用户
enqueueAgentNotification(agentId, result)
```

前台/后台的切换逻辑：

```
子 Agent 启动
  │
  ├─ 如果预计执行时间短 → 前台执行
  │    └─ 用户看到实时输出
  │
  └─ 如果执行超过 2 分钟 → 自动转后台
       └─ 用户看到 "子 Agent 在后台运行..."
       └─ 完成后弹出通知
```

### 子 Agent 的工具限制

子 Agent 不一定拥有与主 Agent 相同的工具集。Claude Code 允许为子 Agent 配置不同的工具集：

```typescript
// 子 Agent 可用的工具通常是主 Agent 的子集
const AGENT_ALLOWED_TOOLS = [
  'Bash',   // 可以执行命令
  'Read',   // 可以读取文件
  'Edit',   // 可以编辑文件
  'Write',  // 可以写入文件
  'Glob',   // 可以搜索文件
  'Grep',   // 可以搜索内容
]

// 子 Agent 通常不能：
// - 调用 AgentTool（防止无限递归：Agent 调 Agent 调 Agent...）
// - 使用某些高权限工具
```

注意 AgentTool 自身**不在子 Agent 的工具列表中**。这是为了防止无限递归——如果子 Agent 可以再派生子 Agent，理论上可以无限套娃，耗尽所有资源。

### 内置 Agent 类型

Claude Code 有预定义的 Agent 类型，适用于不同场景：

```typescript
// src/tools/AgentTool/built-in/generalPurposeAgent.ts
export const GENERAL_PURPOSE_AGENT: AgentDefinition = {
  name: 'general',
  role: '通用编程助手',
  tools: ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'],
}

// 用户也可以自定义 Agent（通过 .claude/agents/ 目录）
// .claude/agents/security-reviewer.md
// .claude/agents/performance-analyzer.md
```

自定义 Agent 让用户可以创建专门化的角色。例如，一个"安全审查 Agent"可以有专门的 System Prompt，指导它只关注安全问题。

### 并行 vs 串行执行

当主 Agent 需要多个子 Agent 时，执行策略很关键：

```
串行执行：
  子 Agent 1 完成 → 子 Agent 2 开始 → 子 Agent 3 开始
  优点：结果可以传递（Agent 2 可以用 Agent 1 的结果）
  缺点：总时间 = 所有 Agent 时间之和

并行执行：
  子 Agent 1 ──────►
  子 Agent 2 ──────►  同时进行
  子 Agent 3 ──────►
  优点：总时间 = 最慢 Agent 的时间
  缺点：Agent 之间不能共享中间结果
```

Claude Code 支持并行执行——当主 Agent 在一次响应中调用多个 AgentTool 时，这些子 Agent 会并发运行。但这也带来了**冲突问题**：如果两个子 Agent 同时修改同一个文件怎么办？

### 结果汇总

子 Agent 完成后，其完整的对话历史会被摘要为一个简短的结果，返回给主 Agent：

```typescript
function summarizeAgentResult(messages: Message[]): string {
  // 提取最后一条 assistant 消息中的文字
  const lastAssistant = messages
    .filter(m => m.role === 'assistant')
    .pop()
  
  const textBlocks = lastAssistant?.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
  
  return textBlocks || '子 Agent 未返回文字结果'
}
```

这个摘要是父子 Agent 之间的唯一通信通道——父 Agent 看不到子 Agent 的完整对话过程、工具调用细节或中间状态。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **AgentTool** | 子 Agent 工具 | 主 Agent 调用子 Agent |
| **子 Agent** | 派生的独立 Agent | 有自己的消息列表和上下文 |
| **AgentDefinition** | Agent 角色定义 | 名称、角色描述、可用工具列表 |
| **前台/后台** | 执行模式 | 前台实时显示，后台静默执行 |
| **Token Budget** | 子 Agent 的 token 预算 | 比主 Agent 小，防止过度消耗 |
| **结果摘要** | 子 Agent 返回的精简结果 | 只返回最终结论，不返回中间过程 |
| **递归防护** | 防止 Agent 无限套娃 | 子 Agent 不能再调 AgentTool |
| **并发冲突** | 多个 Agent 同时修改 | 两个子 Agent 改同一个文件 |

---

## 💻 代码示例

### 示例 1: 你自己的子 Agent 系统

```typescript
// 简化的子 Agent 实现
class AgentManager {
  private agents = new Map<string, AgentState>()
  
  async spawnAgent(prompt: string, tools: ToolDef[]): Promise<string> {
    const agentId = crypto.randomUUID()
    
    // 在独立上下文中运行 Agent 循环
    const resultPromise = agentLoop(prompt, tools)
    
    this.agents.set(agentId, {
      id: agentId,
      status: 'running',
      prompt,
      resultPromise
    })
    
    // 等待完成
    const result = await resultPromise
    this.agents.get(agentId)!.status = 'completed'
    
    return result
  }
  
  async spawnParallel(tasks: Array<{ prompt: string; tools: ToolDef[] }>) {
    // 并行执行多个子 Agent
    return Promise.all(tasks.map(t => this.spawnAgent(t.prompt, t.tools)))
  }
  
  getStatus(agentId: string): string {
    return this.agents.get(agentId)?.status ?? 'unknown'
  }
}
```

### 示例 2: AgentTool 的完整实现

```typescript
// 将子 Agent 包装为一个标准工具
import Anthropic from '@anthropic-ai/sdk'

const AgentTool = {
  name: 'Agent',
  description: '启动一个子 Agent 来处理特定的子任务。子 Agent 有独立的上下文。',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '给子 Agent 的任务描述' }
    },
    required: ['prompt']
  },
  
  async execute(input: { prompt: string }): Promise<string> {
    const client = new Anthropic()
    
    // 子 Agent 的工具集（不包含 AgentTool 自身）
    const childTools = [
      { name: 'bash', description: '执行命令', input_schema: { 
        type: 'object', properties: { command: { type: 'string' } }, required: ['command'] 
      }},
      { name: 'read_file', description: '读取文件', input_schema: {
        type: 'object', properties: { path: { type: 'string' } }, required: ['path']
      }}
    ]
    
    const messages: any[] = [{ role: 'user', content: input.prompt }]
    const MAX_CHILD_TURNS = 10  // 子 Agent 的循环次数更少
    
    for (let turn = 0; turn < MAX_CHILD_TURNS; turn++) {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,  // 子 Agent 的输出限制也更小
        system: '你是一个专注的子 Agent。完成指定任务后立即返回结果。',
        tools: childTools,
        messages
      })
      
      messages.push({ role: 'assistant', content: response.content })
      
      const toolUses = response.content.filter(b => b.type === 'tool_use')
      if (toolUses.length === 0) {
        // 提取最终文字结果
        return response.content
          .filter(b => b.type === 'text')
          .map(b => b.text)
          .join('\n')
      }
      
      // 执行工具（简化）
      const results = await executeChildTools(toolUses)
      messages.push({ role: 'user', content: results })
    }
    
    return '子 Agent 达到最大循环次数'
  }
}
```

### 示例 3: 代码审查多 Agent 协作

```typescript
// 并行代码审查示例
async function parallelCodeReview(filePaths: string[]) {
  const manager = new AgentManager()
  
  const reviewTasks = [
    {
      prompt: `安全审查以下文件，检查 SQL 注入、XSS、认证绕过等安全问题:\n${filePaths.join('\n')}`,
      tools: [readFileTool, grepTool]
    },
    {
      prompt: `性能审查以下文件，检查 N+1 查询、内存泄漏、不必要的重渲染:\n${filePaths.join('\n')}`,
      tools: [readFileTool, grepTool]
    },
    {
      prompt: `代码风格审查以下文件，检查命名规范、函数长度、注释质量:\n${filePaths.join('\n')}`,
      tools: [readFileTool, grepTool]
    }
  ]
  
  // 3 个子 Agent 并行执行
  const [securityReport, perfReport, styleReport] = await manager.spawnParallel(reviewTasks)
  
  // 汇总结果
  return `
## 代码审查报告

### 安全审查
${securityReport}

### 性能审查
${perfReport}

### 风格审查
${styleReport}
  `.trim()
}
```

---

## ✏️ 动手练习

### 练习 1: 设计 Agent 协作 (⏱️ ~15 分钟)

设计一个 "代码审查" 场景，主 Agent 派生 3 个子 Agent：安全审查、性能审查、风格审查。

要求：
- 画出主 Agent 和 3 个子 Agent 的交互图
- 定义每个子 Agent 的 System Prompt
- 定义每个子 Agent 可用的工具集
- 说明结果如何汇总

### 练习 2: 实现简单的子 Agent (⏱️ ~25 分钟)

基于示例 2，实现一个可以工作的 AgentTool：
- 子 Agent 可以使用 Bash 和 Read 工具
- 限制子 Agent 最多 5 轮循环
- 返回子 Agent 的最终文字输出

### 练习 3: 阅读 AgentTool 源码 (⏱️ ~15 分钟)

阅读 Claude Code 源码中 `src/tools/AgentTool/` 目录，回答以下问题：
- `runAgent.ts` 如何创建子 Agent 的 System Prompt？
- 子 Agent 的 token 预算是多少？
- 前台/后台切换的具体条件是什么？

---

## 📖 扩展阅读

1. **Anthropic 工具使用文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：理解工具嵌套调用的模式

2. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：查看 SDK 中的 streaming 和工具调用示例

3. **MCP 协议**
   - 🔗 https://modelcontextprotocol.io/
   - 推荐：了解 MCP 如何扩展 Agent 的工具集

---

## 🤔 思考题

1. **理解：** 子 Agent 的上下文应该从父 Agent 继承多少？全部继承 vs 最小上下文各有什么优缺点？
2. **应用：** 并行子 Agent 之间如果修改了同一个文件，如何处理冲突？设计一个冲突解决机制。
3. **思辨：** 子 Agent 的 token 预算应该如何分配？如果一个子 Agent 用完了预算但还没完成任务怎么办？
4. **设计：** 如果允许子 Agent 再派生子 Agent（深度递归），你会设置什么样的限制来防止资源耗尽？

---

## ➡️ 下一步

**明天：** [Day 14 — 第二周回顾](./day-14-week2-review.md) — 巩固本周知识，完成中级项目。

### ✅ 自检清单

- [ ] 能解释子 Agent 和主 Agent 的关系
- [ ] 理解为什么子 Agent 不能调用 AgentTool（递归防护）
- [ ] 能画出多 Agent 协作的交互图
- [ ] 理解前台/后台 Agent 的区别和切换逻辑
- [ ] 了解子 Agent 结果摘要的必要性

[← 上一天: 上下文压缩](./day-12-context-compression.md) | [课程首页](../README.md) | [下一天: 第二周回顾 →](./day-14-week2-review.md)
