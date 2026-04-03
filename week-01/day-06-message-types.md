# Day 06: 消息类型与对话流

[← 上一天: Tool 系统](./day-05-tool-system-basics.md) | [课程首页](../README.md) | [下一天: 第一周回顾 →](./day-07-week1-review.md)

---

## 🎯 学习目标

1. 理解 Claude Code 中的 **5 种核心消息类型**
2. 掌握**对话流**的数据结构设计
3. 了解**消息规范化**和 API 适配
4. 学习消息的**创建、转换和序列化**

**难度:** 🟡 中级 | **预计时间:** 1 小时（30 分钟阅读 + 30 分钟动手）

---

## 📚 核心概念

### 消息不只是文字

在 Claude Code 中，一条"消息"可能包含文字、图片、工具调用、工具结果、进度更新、系统通知。理解消息系统是理解整个 Agent 架构的关键——因为消息是所有组件之间通信的"通用语言"。

`types/message.ts` 定义了这个丰富的消息系统：

```typescript
// src/types/message.ts — 消息类型联合
export type Message =
  | SystemMessage          // 系统消息（规则、上下文）
  | UserMessage            // 用户输入
  | AssistantMessage       // Claude 的回复
  | AttachmentMessage      // 附件（文件、图片）
  | ProgressMessage        // 进度更新
  | SystemCompactBoundaryMessage  // 压缩边界标记
```

### 用户消息 (UserMessage)

```typescript
// 用户消息结构
type UserMessage = {
  role: 'user'
  content: Array<TextBlock | ImageBlock | ToolResultBlock>
  // 注意：content 是数组！可以包含多种内容块
}

// 创建用户消息
const msg = createUserMessage('帮我看看 package.json')
// 结果：{ role: 'user', content: [{ type: 'text', text: '帮我看看 package.json' }] }
```

### 助手消息 (AssistantMessage)

```typescript
// 助手消息：Claude 的回复
type AssistantMessage = {
  role: 'assistant'
  content: Array<TextBlock | ToolUseBlock | ThinkingBlock>
  // ToolUseBlock 是关键：Claude 通过它调用工具
}

// 一个典型的助手消息可能包含：
// 1. 思考块（thinking）—— Claude 的推理过程
// 2. 文字块 —— 给用户的回复
// 3. 工具调用块 —— 要执行的工具
```

### 工具调用与结果的配对

这是 Agent 循环的核心数据流：

```
Claude 返回 AssistantMessage:
  ┌─────────────────────────────────┐
  │ content: [                       │
  │   { type: 'text',               │
  │     text: '让我先看看文件...' },  │
  │   { type: 'tool_use',           │
  │     id: 'toolu_123',            │
  │     name: 'Read',               │
  │     input: { file_path: 'pkg.json' } }  │
  │ ]                               │
  └─────────────────────────────────┘
          │
          ▼  执行工具
  ┌─────────────────────────────────┐
  │ 下一条 UserMessage:              │
  │ content: [                       │
  │   { type: 'tool_result',        │
  │     tool_use_id: 'toolu_123',   │ ← 必须匹配！
  │     content: '{ "name": "claude-code" ... }' }  │
  │ ]                               │
  └─────────────────────────────────┘
```

**关键规则：** `tool_result` 的 `tool_use_id` 必须和 `tool_use` 的 `id` 一一对应。这是 Anthropic API 的硬性要求。

#### 为什么工具结果是 UserMessage？

你可能觉得奇怪：工具的执行结果明明是系统产生的，为什么要放在 `user` 角色的消息里？

这是 Anthropic API 的设计约束。API 要求消息必须严格**交替出现**：user → assistant → user → assistant。工具结果虽然不是用户说的，但在对话流中占据了 user 的位置，确保消息交替的规则不被打破。

```
对话流的角色交替：
  user:      "帮我看看 package.json"
  assistant: [文字 + tool_use(Read)]
  user:      [tool_result: 文件内容]      ← 系统填充，不是用户输入
  assistant: "这个项目使用了 React..."
  user:      "谢谢！那 tsconfig 呢？"
  assistant: [文字 + tool_use(Read)]
  user:      [tool_result: 文件内容]
  assistant: "TypeScript 配置..."
```

### 多工具并行调用

Claude 可以在一条 AssistantMessage 中包含**多个** tool_use 块，这些工具可以并行执行：

```typescript
// Claude 返回的一条消息中包含两个工具调用
{
  role: 'assistant',
  content: [
    { type: 'text', text: '让我同时查看两个文件...' },
    { type: 'tool_use', id: 'toolu_001', name: 'Read',
      input: { file_path: 'package.json' } },
    { type: 'tool_use', id: 'toolu_002', name: 'Read',
      input: { file_path: 'tsconfig.json' } }
  ]
}

// 对应的结果消息必须包含两个 tool_result
{
  role: 'user',
  content: [
    { type: 'tool_result', tool_use_id: 'toolu_001',
      content: '{ "name": "my-app" ... }' },
    { type: 'tool_result', tool_use_id: 'toolu_002',
      content: '{ "compilerOptions": ... }' }
  ]
}
```

Claude Code 会用 `Promise.all` 并行执行这些工具调用，大幅减少等待时间。

### 消息压缩（Compact）

当对话历史变得很长时，Token 数量会超出模型的上下文窗口限制。Claude Code 使用**消息压缩**来处理这个问题：

```
原始对话（50 条消息，10 万 Token）：
  msg1 → msg2 → ... → msg50

压缩后：
  [CompactBoundary 标记]
  [压缩摘要：前 45 条消息的关键信息]
  msg46 → msg47 → msg48 → msg49 → msg50
```

`SystemCompactBoundaryMessage` 就是这个压缩边界的标记。压缩后的摘要保留了关键上下文（文件修改记录、重要决策等），但大幅减少了 Token 数量。

### 消息工具函数

`utils/messages.ts` 提供了一系列消息操作函数：

```typescript
// src/utils/messages.ts — 核心工具函数
export function createUserMessage(text: string): UserMessage
export function createSystemMessage(text: string): SystemMessage
export function extractTextContent(msg: Message): string
export function normalizeMessagesForAPI(msgs: Message[]): APIMessage[]
export function getLastAssistantMessage(msgs: Message[]): AssistantMessage | null
export function getMessagesAfterCompactBoundary(msgs: Message[]): Message[]
```

`normalizeMessagesForAPI` 尤其重要——它将内部消息格式转换为 Anthropic API 要求的格式，处理各种边界情况（连续的同角色消息、空消息等）。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **TextBlock** | 纯文本内容块 | `{ type: 'text', text: '...' }` |
| **ToolUseBlock** | 工具调用块 | `{ type: 'tool_use', name: 'Bash', input: {...} }` |
| **ToolResultBlock** | 工具结果块 | `{ type: 'tool_result', tool_use_id: '...' }` |
| **ThinkingBlock** | 思考过程块 | Claude 的推理过程（extended thinking） |
| **CompactBoundary** | 压缩边界 | 标记对话历史被压缩的位置 |
| **Normalize** | 消息规范化 | 将内部格式转为 API 格式 |

---

## 💻 代码示例

### 示例 1: 完整的对话流

```typescript
// 一轮完整的 Agent 交互
const conversation: Message[] = [
  // 1. 系统消息（System Prompt）
  {
    role: 'system',
    content: '你是一个编程助手，可以使用以下工具...'
  },
  
  // 2. 用户消息
  {
    role: 'user',
    content: [{ type: 'text', text: '这个项目用了什么框架？' }]
  },
  
  // 3. 助手消息（包含工具调用）
  {
    role: 'assistant',
    content: [
      { type: 'text', text: '让我查看 package.json...' },
      {
        type: 'tool_use',
        id: 'toolu_001',
        name: 'Read',
        input: { file_path: 'package.json' }
      }
    ]
  },
  
  // 4. 工具结果
  {
    role: 'user',
    content: [{
      type: 'tool_result',
      tool_use_id: 'toolu_001',
      content: '{ "dependencies": { "react": "^18", "ink": "^4" } }'
    }]
  },
  
  // 5. 最终回复
  {
    role: 'assistant',
    content: [{
      type: 'text',
      text: '这个项目使用了 React 18 和 Ink 4 框架。'
    }]
  }
]
```

### 示例 2: 消息规范化函数

```typescript
// 消息规范化：处理 API 要求的角色交替
function normalizeMessages(messages: Message[]): Message[] {
  const normalized: Message[] = []
  
  for (const msg of messages) {
    const lastMsg = normalized[normalized.length - 1]
    
    // API 要求：不能有连续的同角色消息
    if (lastMsg && lastMsg.role === msg.role) {
      // 合并到上一条消息中
      if (Array.isArray(lastMsg.content) && Array.isArray(msg.content)) {
        lastMsg.content.push(...msg.content)
      }
    } else {
      normalized.push({ ...msg })
    }
  }
  
  return normalized
}
```

### 示例 3: 消息处理工具函数

```typescript
// 你自己的消息工具函数
function createToolResult(toolUseId: string, content: string) {
  return {
    role: 'user' as const,
    content: [{
      type: 'tool_result' as const,
      tool_use_id: toolUseId,
      content: content
    }]
  }
}

function hasToolUse(msg: AssistantMessage): boolean {
  return msg.content.some(block => block.type === 'tool_use')
}

function getToolUseBlocks(msg: AssistantMessage) {
  return msg.content.filter(block => block.type === 'tool_use')
}
```

---

## ✏️ 动手练习

### 练习 1: 消息序列化 (⏱️ ~15 分钟)

写一个函数，将对话历史导出为可读的 Markdown 格式：
- 用户消息显示为 `> User: ...`
- 助手消息显示为 `Claude: ...`
- 工具调用显示为 `🔧 [ToolName]: ...`

### 练习 2: 工具调用配对 (⏱️ ~15 分钟)

写一个函数 `validateToolPairing(messages)`，检查对话中每个 `tool_use` 都有对应的 `tool_result`，且 ID 匹配。

### 练习 3: 消息统计 (⏱️ ~15 分钟)

分析一段对话，统计：总消息数、工具调用次数、每种工具的使用频率。

---

## 📖 扩展阅读

1. **Anthropic Messages Streaming API**
   - 🔗 https://docs.anthropic.com/en/api/messages-streaming
   - 推荐：理解流式消息的格式和事件类型

2. **Anthropic Tool Use 文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：工具调用的详细格式规范，tool_use 和 tool_result 的配对要求

3. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：查看 SDK 中 Message 相关的类型定义，对比 Claude Code 的内部类型

---

## 🤔 思考题

1. **理解：** 为什么工具结果要放在 `user` 角色的消息中，而不是单独的 `tool` 角色？
2. **应用：** 如果一次助手消息中有 3 个工具调用，它们应该并行执行还是串行执行？为什么？
3. **思辨：** Claude Code 用内部消息格式再转换为 API 格式，为什么不直接用 API 格式？这种"适配层"的设计有什么好处？
4. **设计：** 如果你要实现"消息搜索"功能（在对话历史中搜索关键词），消息的数据结构需要怎么调整？
5. **扩展：** ThinkingBlock（思考块）对调试 Agent 行为有什么价值？如果把它暴露给用户看，会有什么好处和风险？

---

## ➡️ 下一步

**明天：** [Day 07 — 第一周回顾](./day-07-week1-review.md) — 复习本周所学，完成一个迷你项目。

**继续前请确认：**
- [ ] 我理解 5 种核心消息类型
- [ ] 我知道 tool_use 和 tool_result 的配对规则
- [ ] 我能创建正确格式的对话消息
- [ ] 我理解消息规范化的必要性

[← 上一天: Tool 系统](./day-05-tool-system-basics.md) | [课程首页](../README.md) | [下一天: 第一周回顾 →](./day-07-week1-review.md)
