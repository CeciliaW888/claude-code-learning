# Day 12: 上下文压缩与紧凑化

[← 上一天: 上下文管理](./day-11-context-management.md) | [课程首页](../README.md) | [下一天: 子 Agent →](./day-13-agent-tool.md)

---

## 🎯 学习目标

1. 理解**上下文窗口溢出**的问题
2. 掌握 Claude Code 的**压缩策略**：Compact、MicroCompact、Snip
3. 了解**压缩边界**和消息保留机制
4. 学习如何设计自己的上下文压缩系统
5. 理解压缩的**信息损失**与**成本权衡**

**难度:** 🔴 高级 | **预计时间:** 1 小时

---

## 📚 核心概念

### 为什么需要压缩？

Claude 的上下文窗口有限（200K tokens）。在长时间的编程会话中，对话可能包含大量代码输出、文件内容、工具结果。不压缩的话，很快就会超出限制。

```
一次典型会话的 token 增长：
  System Prompt: ~5K tokens
  + 10 轮对话: ~30K tokens
  + 工具结果（代码、文件内容）: ~100K tokens
  ───────────────
  总计: ~135K tokens → 接近限制！
```

更重要的是，token 使用量直接影响**费用**和**响应速度**。发送 150K tokens 的上下文比发送 50K tokens 要慢得多，费用也高得多。压缩不仅是为了避免溢出，也是为了优化性能和成本。

### 压缩时机：什么时候触发？

Claude Code 使用**阈值触发**策略——当对话的 token 总量超过上下文窗口的一定比例时，自动触发压缩：

```typescript
// autoCompact.ts — 自动检测并触发压缩
function shouldCompact(messages: Message[]): boolean {
  const totalTokens = estimateTokenCount(messages)
  const threshold = MAX_CONTEXT_TOKENS * 0.8  // 80% 阈值
  return totalTokens > threshold
}
```

为什么是 80% 而不是 100%？因为需要留出空间给：
- Claude 的输出（可能包含长代码块）
- 新的工具调用和结果
- 安全裕量，避免 API 报错

### 压缩服务架构

Claude Code 的压缩系统不是一个简单的函数，而是一个完整的服务模块：

```
src/services/compact/
├── compact.ts             # 主压缩逻辑（Full Compact）
├── autoCompact.ts         # 自动触发压缩
├── microCompact.ts        # 微压缩（单条消息级）
├── snipCompact.ts         # 截断压缩（工具输出）
├── cachedMicrocompact.ts  # 缓存的微压缩
├── grouping.ts            # 消息分组（识别相关消息）
├── prompt.ts              # 压缩用的 prompt 模板
├── postCompactCleanup.ts  # 压缩后清理
└── sessionMemoryCompact.ts # 会话记忆压缩
```

### 三种压缩策略详解

Claude Code 采用**渐进式压缩**——先尝试轻量级压缩，如果不够再使用重量级压缩。这就像整理房间：先扔掉明显的垃圾（Snip），再整理不常用的物品（MicroCompact），最后彻底重新整理（Full Compact）。

**1. Snip Compact（截断压缩）** — 最简单、最快、无 API 调用

工具输出太长时直接截断。这是纯本地操作，不需要调用 Claude API：

```typescript
// snipCompact.ts — 截断大型工具输出
function snipLargeToolResults(messages: Message[]) {
  for (const msg of messages) {
    for (const block of msg.content) {
      if (block.type === 'tool_result' && block.content.length > MAX_SIZE) {
        block.content = block.content.slice(0, PREVIEW_SIZE) +
          `\n[... 截断 ${block.content.length - PREVIEW_SIZE} 字符 ...]`
      }
    }
  }
}
```

典型的被截断内容：
- `cat` 大文件的输出（几万行日志）
- `grep` 搜索结果（匹配太多）
- `npm install` 的详细日志
- 编译错误的完整堆栈跟踪

**2. MicroCompact（微压缩）** — 单条消息级，需要 API 调用

用 Claude 自己来摘要单条消息。适用于内容虽然不超大但不再需要完整保留的情况：

```typescript
// microCompact.ts — 压缩单条消息
async function microCompact(message: Message) {
  const summary = await callClaude({
    system: '用 2-3 句话摘要以下内容，保留关键信息（文件名、函数名、错误信息、修改内容）',
    messages: [{ role: 'user', content: message.content }]
  })
  return { ...message, content: summary }
}
```

MicroCompact 的特点是**选择性压缩**——不是所有消息都压缩，只压缩"旧的"且"内容量大"的消息。最近的几条消息始终保持完整，因为它们可能正在被引用。

为了避免重复压缩，Claude Code 还实现了 **cachedMicroCompact**——已经压缩过的消息会被标记，不会再次压缩：

```typescript
// cachedMicrocompact.ts
const compactedSet = new WeakSet<Message>()

async function cachedMicroCompact(message: Message) {
  if (compactedSet.has(message)) return message
  
  const result = await microCompact(message)
  compactedSet.add(result)
  return result
}
```

**3. Full Compact（完整压缩）** — 对话级，最彻底

压缩整段对话历史，插入 CompactBoundary。这是最激进的压缩方式，会丢失最多细节：

```typescript
// compact.ts — 主压缩流程（简化）
async function compactMessages(messages: Message[]) {
  // 1. 保留最近的消息（不压缩）
  const recentMessages = messages.slice(-KEEP_RECENT)
  const oldMessages = messages.slice(0, -KEEP_RECENT)
  
  // 2. 用 Claude 摘要旧消息
  const summary = await callClaude({
    system: COMPACT_PROMPT,  // 专门的压缩 prompt
    messages: [{ 
      role: 'user', 
      content: `摘要以下对话历史:\n${formatMessages(oldMessages)}` 
    }]
  })
  
  // 3. 替换消息列表
  return [
    createCompactBoundaryMessage(),  // 标记压缩边界
    { role: 'user', content: summary },
    ...recentMessages
  ]
}
```

### 压缩 Prompt 的设计

Full Compact 的质量取决于压缩 Prompt 的质量。Claude Code 的压缩 Prompt 会指导 Claude 保留关键信息：

```typescript
const COMPACT_PROMPT = `
你是一个对话摘要助手。请将以下对话历史压缩为一个简洁的摘要。

必须保留的信息：
1. 用户的原始需求和目标
2. 已完成的操作（修改了哪些文件、运行了哪些命令）
3. 当前的工作状态（是否完成、还有什么未做）
4. 关键的错误信息和解决方案
5. 重要的文件路径和函数名

可以省略的信息：
1. 文件的完整内容（只保留文件名和修改摘要）
2. 命令的完整输出（只保留关键结果）
3. 中间尝试的失败方案（只保留最终方案）
4. 重复的确认对话
`
```

### 压缩边界（CompactBoundary）

CompactBoundary 是一个特殊标记，告诉 Claude "这之前的内容已经被压缩过了"。这个标记很重要，因为它：

1. 让 Claude 知道自己的记忆是不完整的
2. 防止 Claude 引用已经被压缩掉的具体代码
3. 允许多次压缩（压缩可以叠加）

```
对话历史（压缩前）：
  [消息 1] [消息 2] ... [消息 50] [消息 51] ... [消息 100]

对话历史（压缩后）：
  [CompactBoundary] [摘要] [消息 91] ... [消息 100]
                            └── 保留最近 10 条

再次压缩后：
  [CompactBoundary] [摘要的摘要] [消息 191] ... [消息 200]
```

### 消息分组

压缩不是对每条消息独立操作的。`grouping.ts` 会将相关消息分组——一次工具调用和它的结果应该作为一个整体来压缩或保留，不能拆开：

```typescript
// grouping.ts — 消息分组
function groupMessages(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = []
  
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    
    if (msg.role === 'assistant' && hasToolUse(msg)) {
      // 工具调用 + 工具结果 = 一个组
      groups.push({
        type: 'tool_interaction',
        messages: [msg, messages[i + 1]],  // assistant + user(tool_result)
      })
      i++  // 跳过下一条（工具结果）
    } else {
      groups.push({
        type: 'standalone',
        messages: [msg],
      })
    }
  }
  
  return groups
}
```

### Token 估算

压缩的前提是知道当前使用了多少 token。精确的 token 计数需要使用 tokenizer（分词器），但 Claude Code 使用了一个快速估算方法：

```typescript
// 粗略估算：平均每个 token 约 4 个字符（英文）
// 中文字符平均每个 token 约 1.5-2 个字符
function estimateTokenCount(messages: Message[]): number {
  let totalChars = 0
  for (const msg of messages) {
    totalChars += JSON.stringify(msg.content).length
  }
  // 混合内容取折中值
  return Math.ceil(totalChars / 3)
}
```

这个估算不精确，但**足够快**且**足够安全**（倾向于高估，不会意外超限）。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **Context Window** | 模型能处理的最大 token 数 | 200K tokens |
| **Compact** | 对话历史压缩 | 将旧对话摘要为几句话 |
| **MicroCompact** | 单条消息压缩 | 压缩单个工具输出 |
| **Snip** | 截断大型输出 | 保留头尾，中间省略 |
| **CompactBoundary** | 压缩边界标记 | 标记哪些消息已被压缩 |
| **Token Budget** | Token 预算 | 控制上下文使用量 |
| **渐进式压缩** | 从轻到重逐步压缩 | Snip → MicroCompact → Full |
| **消息分组** | 关联消息作为整体处理 | 工具调用 + 结果不拆分 |

---

## 💻 代码示例

### 示例 1: 实现简单的上下文压缩

```typescript
// 你自己的压缩系统
class ContextManager {
  private messages: Message[] = []
  private maxTokens = 100000
  
  addMessage(msg: Message) {
    this.messages.push(msg)
    if (this.shouldCompress()) {
      this.compress()
    }
  }
  
  private shouldCompress(): boolean {
    return this.estimateTokens() > this.maxTokens * 0.8
  }
  
  private async compress() {
    const keepRecent = 6  // 保留最近 6 条消息
    const old = this.messages.slice(0, -keepRecent)
    const recent = this.messages.slice(-keepRecent)
    
    // 先尝试 Snip（截断大型输出）
    this.snipLargeOutputs(old)
    
    // 如果还是太大，做 Full Compact
    if (this.estimateTokens() > this.maxTokens * 0.8) {
      const summary = await this.summarize(old)
      this.messages = [
        { role: 'system', content: `[对话摘要]\n${summary}` },
        ...recent
      ]
    }
  }
  
  private snipLargeOutputs(messages: Message[]) {
    for (const msg of messages) {
      if (typeof msg.content === 'string' && msg.content.length > 5000) {
        msg.content = msg.content.slice(0, 2000) + 
          '\n[... 已截断 ...]\n' + 
          msg.content.slice(-2000)
      }
    }
  }
  
  private estimateTokens(): number {
    return this.messages.reduce((sum, m) => 
      sum + JSON.stringify(m.content).length / 3, 0
    )
  }
  
  private async summarize(messages: Message[]): Promise<string> {
    // 调用 Claude API 生成摘要
    const response = await callClaude({
      system: '将以下对话压缩为简洁摘要，保留关键操作和结果',
      messages: [{ 
        role: 'user', 
        content: messages.map(m => 
          `[${m.role}]: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`
        ).join('\n\n')
      }]
    })
    return response
  }
}
```

### 示例 2: 智能截断函数

```typescript
// 保留头尾，中间显示省略信息
function smartTruncate(text: string, maxLength: number): {
  result: string
  stats: { originalLength: number; truncatedLength: number; linesRemoved: number }
} {
  if (text.length <= maxLength) {
    return { 
      result: text, 
      stats: { originalLength: text.length, truncatedLength: text.length, linesRemoved: 0 } 
    }
  }
  
  const lines = text.split('\n')
  const halfLines = Math.floor(lines.length / 2)
  
  // 二分查找：找到保留多少行能刚好在限制内
  let keepHead = halfLines
  let keepTail = halfLines
  
  while (keepHead + keepTail > 0) {
    const head = lines.slice(0, keepHead).join('\n')
    const tail = lines.slice(-keepTail).join('\n')
    const middle = `\n[... 已省略 ${lines.length - keepHead - keepTail} 行 ...]\n`
    
    if ((head + middle + tail).length <= maxLength) {
      return {
        result: head + middle + tail,
        stats: {
          originalLength: text.length,
          truncatedLength: (head + middle + tail).length,
          linesRemoved: lines.length - keepHead - keepTail
        }
      }
    }
    
    // 减少保留的行数
    if (keepHead > keepTail) keepHead--
    else keepTail--
  }
  
  return {
    result: `[内容过大，已完全省略 (${text.length} 字符)]`,
    stats: { originalLength: text.length, truncatedLength: 0, linesRemoved: lines.length }
  }
}
```

---

## ✏️ 动手练习

### 练习 1: Token 估算器 (⏱️ ~15 分钟)

实现一个 token 估算函数，支持中英文混合内容。

要求：
- 英文：约 4 字符 = 1 token
- 中文：约 1.5 字符 = 1 token
- 代码：约 3 字符 = 1 token（介于中英文之间）
- 测试：用几段不同类型的文本验证你的估算

### 练习 2: 截断策略 (⏱️ ~20 分钟)

实现 "智能截断"：保留前 N 行和后 M 行，中间显示 `[已省略 X 行]`。

扩展要求：
- 如果截断点在一个代码块中间（用 ``` 标记的区域），调整截断点到代码块边界
- 返回截断统计信息

### 练习 3: 分析 compact.ts (⏱️ ~15 分钟)

阅读 Claude Code 源码中的 `src/services/compact/compact.ts`，回答以下问题：
- 压缩时保留最近多少条消息？
- 压缩摘要的最大长度是多少？
- CompactBoundary 包含哪些信息？

---

## 📖 扩展阅读

1. **Anthropic Streaming API**
   - 🔗 https://docs.anthropic.com/en/api/messages-streaming
   - 推荐：理解流式响应中的 token 使用情况

2. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：查看 SDK 中的 token 计数相关功能

3. **Node.js Stream API**
   - 🔗 https://nodejs.org/api/
   - 推荐：理解 Node.js 流的概念，与上下文流式处理类比

---

## 🤔 思考题

1. **理解：** 压缩会丢失信息。如何决定哪些信息更重要，值得保留？列出优先级排序。
2. **应用：** 如果压缩后 Agent 忘了之前讨论过的内容，怎么办？有哪些补救措施？
3. **思辨：** 压缩本身需要调用 Claude API——这个额外成本值得吗？在什么情况下应该选择直接开启新会话而不是压缩？
4. **设计：** 如果要实现"选择性记忆"——用户可以标记某些消息"不要压缩"，你会怎么实现？

---

## ➡️ 下一步

**明天：** [Day 13 — 子 Agent 工具](./day-13-agent-tool.md) — Agent 调用 Agent 的多层架构。

### ✅ 自检清单

- [ ] 能解释三种压缩策略（Snip、MicroCompact、Full Compact）的区别和适用场景
- [ ] 理解 CompactBoundary 的作用
- [ ] 能实现一个基本的 token 估算函数
- [ ] 理解消息分组的概念——为什么工具调用和结果不能拆分
- [ ] 了解压缩的信息损失和成本权衡

[← 上一天: 上下文管理](./day-11-context-management.md) | [课程首页](../README.md) | [下一天: 子 Agent →](./day-13-agent-tool.md)
