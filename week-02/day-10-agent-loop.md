# Day 10: Agent 循环 — QueryEngine 与 query()

[← 上一天: 文件工具](./day-09-file-tools.md) | [课程首页](../README.md) | [下一天: 上下文管理 →](./day-11-context-management.md)

---

## 🎯 学习目标

1. 深入理解 **QueryEngine** 的对话管理
2. 掌握 **query()** 核心循环的执行流程
3. 了解**流式响应**处理和工具执行
4. 学习**中断与恢复**机制
5. 能够实现一个完整的 Agent 循环

**难度:** 🔴 高级 | **预计时间:** 1 小时

---

## 📚 核心概念

### QueryEngine — 对话控制器

`QueryEngine.ts`（约 1300 行）是每轮对话的控制器。当用户按下 Enter 提交消息时，QueryEngine 负责：

1. 组装完整的消息列表（包括 System Prompt、历史对话、工具定义）
2. 调用 Claude API
3. 处理流式响应
4. 协调工具执行
5. 管理上下文窗口

QueryEngine 的角色可以类比为**交响乐指挥**——它不自己演奏乐器（不直接执行工具），而是协调各个模块的合作，确保整个对话过程流畅进行。

```typescript
// src/QueryEngine.ts — submitMessage 方法（简化）
class QueryEngine {
  async submitMessage(userText: string, options: QueryOptions) {
    // 1. 创建用户消息
    const userMessage = createUserMessage(userText)
    this.messages.push(userMessage)
    
    // 2. 组装 System Prompt
    const systemPrompt = await buildEffectiveSystemPrompt({
      tools: this.tools,
      context: await getSystemContext(),
      claudeMd: await getClaudeMds(),
    })
    
    // 3. 进入核心循环
    await this.query({
      systemPrompt,
      messages: this.messages,
      tools: this.tools,
    })
  }
}
```

### query() — 无限循环的心脏

`query.ts`（约 1700 行）是整个 Agent 的心脏。这是一个**条件终止的无限循环**——它不断地调用 Claude API、执行工具、再调用 API，直到 Claude 决定任务完成（不再调用工具）。

这个循环是 Agent 和普通 Chatbot 的本质区别：
- **Chatbot**：用户说一句 → AI 回一句（一轮交互）
- **Agent**：用户说一句 → AI 可能执行多轮工具调用 → 最终回复（多轮自主行动）

```typescript
// src/query.ts — 核心循环（简化）
export async function query(params: QueryParams) {
  while (true) {  // 无限循环
    // 1. 调用 Claude API（流式）
    const stream = await callClaudeAPI({
      model: params.model,
      system: params.systemPrompt,
      messages: normalizeMessages(params.messages),
      tools: formatToolsForAPI(params.tools),
    })
    
    // 2. 处理流式响应
    const assistantMessage = await processStream(stream)
    params.messages.push(assistantMessage)
    
    // 3. 提取工具调用
    const toolUses = assistantMessage.content
      .filter(block => block.type === 'tool_use')
    
    // 4. 没有工具调用 → 结束循环
    if (toolUses.length === 0) {
      break  // Agent 决定任务完成了
    }
    
    // 5. 执行所有工具调用
    const toolResults = await executeTools(toolUses, params.tools)
    
    // 6. 将结果添加到消息列表
    params.messages.push({
      role: 'user',
      content: toolResults
    })
    
    // 7. 检查是否需要上下文压缩
    if (shouldCompact(params.messages)) {
      await compactMessages(params.messages)
    }
    
    // 8. 回到循环顶部 → 再次调用 Claude
  }
}
```

### 消息格式与 API 协议

理解 Agent 循环需要先理解 Claude API 的消息格式。每次 API 调用需要传递完整的对话历史：

```typescript
// Claude API 的消息格式
const messages = [
  // 第 1 轮：用户请求
  { role: 'user', content: '请帮我创建一个 hello.txt 文件' },
  
  // 第 1 轮：Claude 决定调用工具
  { role: 'assistant', content: [
    { type: 'text', text: '好的，我来创建文件。' },
    { type: 'tool_use', id: 'call_001', name: 'Write', 
      input: { file_path: 'hello.txt', content: 'Hello World' } }
  ]},
  
  // 第 1 轮：工具执行结果
  { role: 'user', content: [
    { type: 'tool_result', tool_use_id: 'call_001', 
      content: '文件已创建' }
  ]},
  
  // 第 2 轮：Claude 看到结果后回复
  { role: 'assistant', content: [
    { type: 'text', text: '文件 hello.txt 已创建成功。' }
  ]}
  // 没有 tool_use → 循环结束
]
```

注意一个关键点：工具执行结果以 `role: 'user'` 的形式发送。这是因为 Claude API 的消息格式要求 `assistant` 和 `user` 交替出现。工具结果虽然不是用户发送的，但在 API 层面用 `user` 角色传递。

### 流式响应处理

Claude API 返回的是**流式数据**——一个字符一个字符地到达。Claude Code 实时处理这些数据，让用户能看到 Claude "打字" 的效果：

```typescript
// 流式处理：一边接收一边渲染
async function processStream(stream) {
  const message: AssistantMessage = { role: 'assistant', content: [] }
  
  for await (const event of stream) {
    switch (event.type) {
      case 'content_block_start':
        // 新的内容块开始（文字或工具调用）
        message.content.push(createBlock(event))
        break
        
      case 'content_block_delta':
        // 增量文本更新 → 实时渲染到终端
        appendDelta(message, event)
        renderPartialResponse(message)  // 实时显示
        break
        
      case 'content_block_stop':
        // 内容块结束
        break
        
      case 'message_stop':
        // 整个消息结束
        return message
    }
  }
}
```

流式处理的事件顺序是一个嵌套结构：

```
message_start
  ├─ content_block_start (type: text)
  │    ├─ content_block_delta (text: "好")
  │    ├─ content_block_delta (text: "的")
  │    ├─ content_block_delta (text: "，")
  │    └─ content_block_delta (text: "我来...")
  │    └─ content_block_stop
  ├─ content_block_start (type: tool_use)
  │    ├─ content_block_delta (partial_json: '{"file')
  │    ├─ content_block_delta (partial_json: '_path":')
  │    └─ content_block_delta (partial_json: '"hello.txt"}')
  │    └─ content_block_stop
message_stop
```

### 工具执行策略

当 Claude 在一次响应中调用多个工具时，Claude Code 需要决定执行策略：

```typescript
// 多工具执行策略
async function executeTools(
  toolUses: ToolUse[], 
  tools: Tool[]
): Promise<ToolResult[]> {
  // Claude Code 的策略：串行执行
  // 原因：工具之间可能有依赖关系
  // 例：先 Read 文件 → 再 Edit 文件
  const results: ToolResult[] = []
  
  for (const toolUse of toolUses) {
    const tool = tools.find(t => t.name === toolUse.name)
    if (!tool) {
      results.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: `工具 ${toolUse.name} 未找到`
      })
      continue
    }
    
    // 权限检查
    const permission = await tool.needsPermission(toolUse.input)
    if (!permission.allowed) {
      // 请求用户确认
      const approved = await requestUserApproval(toolUse)
      if (!approved) {
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: '用户拒绝了此操作'
        })
        continue
      }
    }
    
    // 执行工具
    const result = await tool.call(toolUse.input)
    results.push({
      type: 'tool_result',
      tool_use_id: toolUse.id,
      content: result.content
    })
  }
  
  return results
}
```

### 循环终止条件

Agent 循环不是无限执行的。终止条件包括：

```
1. Claude 不调用任何工具 → 任务完成（最常见的退出方式）
2. 达到最大循环次数 → 防止无限循环（通常 ~200 次）
3. 用户按 Ctrl+C → 中断
4. Token 预算耗尽 → 强制停止
5. API 错误 → 异常退出（如网络超时、速率限制）
```

### 中断与恢复

用户随时可以按 Ctrl+C 中断 Agent 循环。Claude Code 使用 `AbortController` 实现优雅的中断——不是直接杀死进程，而是等待当前操作完成后停止循环：

```typescript
// 中断处理
const controller = new AbortController()

process.on('SIGINT', () => {
  controller.abort()
})

// 在循环中检查中断信号
while (true) {
  if (controller.signal.aborted) {
    // 保存当前状态，优雅退出
    break
  }
  // ... 正常循环逻辑
}
```

中断后，对话历史会保留在内存中，用户可以继续发送新消息，Agent 会从中断点继续工作。

### 错误处理与重试

API 调用可能因为各种原因失败（网络波动、速率限制、服务器过载）。Claude Code 实现了智能重试机制：

```typescript
// 指数退避重试
async function callWithRetry(fn: () => Promise<any>, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      if (attempt === maxRetries) throw error
      
      // 根据错误类型决定是否重试
      if (error.status === 429) {
        // 速率限制：等待更长时间
        const delay = Math.pow(2, attempt) * 1000
        await sleep(delay)
      } else if (error.status >= 500) {
        // 服务器错误：短暂等待后重试
        await sleep(1000)
      } else {
        // 客户端错误（4xx）：不重试
        throw error
      }
    }
  }
}
```

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **QueryEngine** | 对话级控制器 | 管理一轮完整对话 |
| **query()** | 核心循环函数 | while(true) 循环直到完成 |
| **Stream** | 流式 API 响应 | 一个字符一个字符接收 |
| **Delta** | 流式增量更新 | 新到达的文字片段 |
| **Turn** | 一次交互回合 | 用户消息 → Agent 响应（可能多轮工具调用） |
| **Compact** | 上下文压缩 | 对话太长时自动摘要 |
| **AbortController** | 中断控制器 | 实现优雅的 Ctrl+C 中断 |
| **Exponential Backoff** | 指数退避重试 | 失败后等待时间翻倍 |

---

## 💻 代码示例

### 示例 1: 你自己的 Agent 循环

```typescript
// 完整的 Agent 循环实现
import Anthropic from '@anthropic-ai/sdk'

async function agentLoop(
  prompt: string,
  tools: ToolDef[],
  apiKey: string
) {
  const client = new Anthropic({ apiKey })
  
  const messages: Message[] = [
    { role: 'user', content: prompt }
  ]
  
  const MAX_TURNS = 20
  
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // 调用 API
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema
      })),
      messages
    })
    
    messages.push({ role: 'assistant', content: response.content })
    
    // 检查是否有工具调用
    const toolUses = response.content.filter(b => b.type === 'tool_use')
    if (toolUses.length === 0) {
      // 没有工具调用 → 结束
      return response.content.find(b => b.type === 'text')?.text
    }
    
    // 执行工具
    const toolResults = []
    for (const tu of toolUses) {
      const tool = tools.find(t => t.name === tu.name)
      const output = tool ? await tool.execute(tu.input) : '工具未找到'
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: output
      })
    }
    
    messages.push({ role: 'user', content: toolResults })
  }
  
  return '达到最大循环次数'
}
```

### 示例 2: 带流式输出的 Agent 循环

```typescript
// 流式版本：实时显示 Claude 的回复
async function agentLoopStreaming(
  prompt: string,
  tools: ToolDef[],
  client: Anthropic
) {
  const messages: Message[] = [
    { role: 'user', content: prompt }
  ]
  
  for (let turn = 0; turn < 20; turn++) {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema
      })),
      messages
    })
    
    // 实时显示文字
    stream.on('text', (text) => {
      process.stdout.write(text)
    })
    
    const response = await stream.finalMessage()
    messages.push({ role: 'assistant', content: response.content })
    
    const toolUses = response.content.filter(b => b.type === 'tool_use')
    if (toolUses.length === 0) break
    
    // 执行工具（同上）
    const toolResults = await executeAllTools(toolUses, tools)
    messages.push({ role: 'user', content: toolResults })
  }
}
```

---

## ✏️ 动手练习

### 练习 1: 实现流式渲染 (⏱️ ~25 分钟)

修改示例 1 的 Agent 循环，使用流式 API，在终端实时显示 Claude 的回复。

要求：
- 文字内容实时打印（每收到一个 delta 就输出）
- 工具调用显示工具名称和参数
- 完整消息结束后换行

### 练习 2: 添加中断支持 (⏱️ ~15 分钟)

使用 `AbortController` 让用户可以按 Ctrl+C 中断 Agent 循环。

要求：
- 中断后打印已完成的对话轮数
- 中断后返回最后一次 Claude 的文字回复

### 练习 3: 阅读 query.ts (⏱️ ~15 分钟)

打开 Claude Code 源码中的 `src/query.ts`，找到主循环的 `while` 语句，标记它的所有终止条件。记录你发现的退出路径，与上面列出的 5 种对比。

---

## 📖 扩展阅读

1. **Anthropic Streaming API**
   - 🔗 https://docs.anthropic.com/en/api/messages-streaming
   - 推荐：理解流式响应格式和事件类型

2. **Anthropic Tool Use 文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：理解工具调用的 API 协议

3. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：查看 `messages.stream()` 的使用方式

---

## 🤔 思考题

1. **理解：** 为什么 Agent 循环是 while(true) 而不是 for 循环？这体现了什么设计理念？（提示：Agent 的自主性）
2. **应用：** 如果一次循环中有 3 个工具调用，它们应该并行还是串行执行？各有什么利弊？
3. **思辨：** Agent 循环的最大次数应该设为多少？太小会限制能力，太大会浪费资源和金钱。
4. **设计：** 如果 API 返回的工具参数格式错误（JSON 不完整），Agent 应该怎么处理？

---

## ➡️ 下一步

**明天：** [Day 11 — 上下文管理](./day-11-context-management.md) — System Prompt 组装和 CLAUDE.md 配置。

### ✅ 自检清单

- [ ] 能画出 Agent 循环的完整流程图
- [ ] 理解为什么工具结果用 `role: 'user'` 发送
- [ ] 能实现一个基本的 Agent 循环（调用 API + 执行工具 + 循环）
- [ ] 理解流式响应的事件类型和处理方式
- [ ] 能列出 Agent 循环的所有终止条件

[← 上一天: 文件工具](./day-09-file-tools.md) | [课程首页](../README.md) | [下一天: 上下文管理 →](./day-11-context-management.md)
