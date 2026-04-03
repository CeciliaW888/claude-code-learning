# Day 19: 成本追踪与性能优化

[← 上一天: 状态管理](./day-18-state-management.md) | [课程首页](../README.md) | [下一天: 多 Agent 系统 →](./day-20-multi-agent.md)

---

## 🎯 学习目标

1. 理解 Claude Code 的**成本追踪系统**
2. 掌握**启动性能优化**策略
3. 了解 **Token 预算管理**和上下文窗口利用
4. 学习**终端渲染性能**优化
5. 能够为自己的 Agent 实现**成本监控和预算控制**

**难度:** 🟡 中级 | **预计时间:** 1 小时

---

## 📚 核心概念

### 为什么成本追踪如此重要？

AI Agent 和传统软件最大的区别之一是**运行成本不可预测**。传统软件的 API 调用成本是固定的（或接近免费的），但 LLM API 按 Token 计费，一次复杂的 Agent 操作可能产生数十万 Token 的消耗。

一个没有成本追踪的 Agent 就像一辆没有油表的汽车——你不知道什么时候会"没油"（超出预算），也无法优化你的"驾驶方式"（使用模式）。

```
成本的组成:
┌──────────────────────────────────────┐
│  输入 Token 成本                      │
│  ├─ System Prompt (每次都发送)        │ ← 固定开销
│  ├─ 对话历史 (越来越长)               │ ← 随对话增长
│  ├─ 工具定义 (所有工具的 schema)      │ ← 固定开销
│  └─ 缓存命中部分 (折扣价)             │ ← 可优化！
│                                      │
│  输出 Token 成本                      │
│  ├─ 助手文字回复                      │
│  └─ 工具调用参数                      │
└──────────────────────────────────────┘
```

### 成本追踪

每次 API 调用都有成本。Claude Code 实时追踪每一分钱：

```typescript
// src/cost-tracker.ts — 成本追踪
export function getTotalCost(): number {
  return state.totalInputCost + state.totalOutputCost
}

// 每次 API 调用后更新成本
function updateCost(usage: {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
}) {
  // Sonnet 4: $3/M input, $15/M output
  state.totalInputCost += usage.input_tokens * 0.000003
  state.totalOutputCost += usage.output_tokens * 0.000015
  
  // 缓存的 token 更便宜（缓存读取只需 10% 的价格）
  if (usage.cache_read_input_tokens) {
    state.totalInputCost -= usage.cache_read_input_tokens * 0.0000027
    // 扣除普通价格后加回缓存价格
  }
}
```

成本追踪需要考虑不同模型的不同定价：

```typescript
// 不同模型的定价差异很大
const MODEL_PRICING = {
  'claude-sonnet-4-20250514': {
    input: 3.00,        // $3 per million input tokens
    output: 15.00,      // $15 per million output tokens
    cacheRead: 0.30,    // $0.30 per million cached tokens
    cacheWrite: 3.75,   // $3.75 per million cache creation tokens
  },
  'claude-haiku-3-5-20241022': {
    input: 0.25,
    output: 1.25,
    cacheRead: 0.03,
    cacheWrite: 0.30,
  },
}
// Haiku 的成本是 Sonnet 的 ~1/12 —— 对于简单任务，
// 用 Haiku 可以大幅降低成本
```

### 成本阈值警告

Claude Code 在成本达到一定阈值时会提醒用户，防止意外的高额账单：

```tsx
// src/components/CostThresholdDialog.tsx
// 当成本超过阈值时弹出确认
//
// ┌─ 成本提醒 ─────────────────────────────┐
// │                                        │
// │  当前会话已花费 $2.50                    │
// │  （输入: $1.80 / 输出: $0.70）          │
// │                                        │
// │  Token 使用: 450K input / 12K output   │
// │                                        │
// │  [继续] [查看详情] [结束会话]            │
// └────────────────────────────────────────┘
```

阈值通常设置为 $2、$5、$10 等递增的级别。这让用户在小额使用时不受打扰，但在成本明显上升时得到提醒。

### Prompt Cache — 最重要的成本优化

Prompt Cache（提示缓存）是降低 API 成本最有效的手段。它的原理是：如果连续请求的前缀部分相同，API 服务器可以复用之前的计算结果。

```
第一次请求:
  [System Prompt | 工具定义 | 对话历史前100条 | 新消息]
  ↑ 全价计算 ──────────────────────────────────↑

第二次请求（对话继续）:
  [System Prompt | 工具定义 | 对话历史前100条 | 工具结果 | 新消息]
  ↑ 缓存命中（10% 价格）──────────────────↑  ↑ 全价 ──↑
```

为了最大化缓存命中率，Claude Code 的消息组装顺序经过精心设计：

```typescript
// 缓存优化的消息组装策略
function assembleMessages() {
  return [
    // 1. System Prompt（几乎不变 → 总是命中缓存）
    { role: 'system', content: systemPrompt },
    
    // 2. 工具定义（同一会话内不变 → 命中缓存）
    // （通过 tools 参数传递）
    
    // 3. 对话历史（只追加不修改 → 前缀命中缓存）
    ...messages,
    
    // 4. 最新消息（新内容，不会命中缓存）
    { role: 'user', content: newInput }
  ]
}
```

关键设计：**把不变的内容放在前面，变化的内容放在后面**。这样不变的前缀部分可以持续命中缓存，只有新增的尾部内容需要全价计算。

### 启动性能优化

Claude Code 对启动速度极其执着（recall Day 02）。一个 CLI 工具如果启动要等 3 秒，用户体验会非常差。

```typescript
// 优化策略汇总
1. profileCheckpoint — 精确计时每个启动阶段
2. startMdmRawRead — 并行预读 MDM 配置
3. startKeychainPrefetch — 并行预读凭证
4. prefetchFastModeStatus — 并行检查快速模式
5. memoize(getSystemContext) — 缓存上下文计算
6. Dead Code Elimination — Bun 编译时移除未用代码
7. feature() gates — 条件导入，减少加载量
```

核心原则是**并行化**和**延迟加载**：

```
串行启动（慢）:
  加载配置 → 读取凭证 → 初始化 MCP → 渲染 UI
  [100ms]     [200ms]    [300ms]    [50ms]
  总计: 650ms

并行启动（快）:
  ┌ 加载配置 [100ms] ──┐
  ├ 读取凭证 [200ms] ──┤
  ├ 初始化 MCP [300ms] ┤→ 渲染 UI [50ms]
  └ 预检状态 [50ms] ───┘
  总计: 350ms（最慢任务 + UI 渲染）
```

`profileCheckpoint` 是一个轻量级的性能计时工具，在代码中标记检查点，启动完成后输出每个阶段的耗时：

```typescript
// 使用 profileCheckpoint 追踪启动性能
profileCheckpoint('start')
const config = await loadConfig()
profileCheckpoint('config_loaded')
const keys = await prefetchKeys()
profileCheckpoint('keys_loaded')
renderUI()
profileCheckpoint('ui_rendered')

// 输出:
// start → config_loaded: 98ms
// config_loaded → keys_loaded: 45ms  (并行，不阻塞)
// keys_loaded → ui_rendered: 32ms
// Total: 175ms
```

### Token 预算管理

上下文窗口有限制（如 200K Token），需要精打细算：

```typescript
// src/utils/tokenBudget.ts
// 控制每轮对话的 token 使用

// 输出 token 预算
const turnOutputBudget = parseTokenBudget(config.maxOutputTokens)

// 上下文预算管理
const contextBudget = MAX_CONTEXT_TOKENS - reservedForOutput

// 当接近预算时自动触发压缩
if (currentTokens > contextBudget * 0.8) {
  triggerCompaction()
}
```

Token 预算管理的核心挑战是在**保留重要上下文**和**不超出限制**之间取得平衡：

```
上下文窗口 (200K tokens)
┌──────────────────────────────────────────┐
│ System Prompt          [~5K]             │ ← 必须保留
│ 工具定义               [~10K]            │ ← 必须保留
│ ──────────────────────────────────────── │
│ 对话历史（早期）        [~50K]            │ ← 可以压缩
│ 对话历史（中期）        [~60K]            │ ← 可以压缩
│ 对话历史（近期）        [~30K]            │ ← 尽量保留
│ ──────────────────────────────────────── │
│ 预留给输出              [~16K]            │ ← 必须预留
│ 安全余量                [~29K]            │ ← 缓冲区
└──────────────────────────────────────────┘
```

当上下文接近 80% 容量时，触发 Day 12 学到的压缩（Compaction）：把早期对话总结为精简版本，释放空间。

### 终端渲染性能

CLI 应用的渲染性能虽然不如 Web 应用那么受关注，但对用户体验的影响同样显著：

```typescript
// src/context/fpsMetrics.ts — FPS 监控
// 终端 UI 也需要关注渲染性能！

// 目标: 保持 30+ FPS
// 问题: 大量消息时渲染变慢
// 解决: 虚拟列表
```

**虚拟列表**是解决大量数据渲染性能问题的标准方案：

```typescript
// src/components/VirtualMessageList.tsx
// 类似 web 的虚拟滚动——1000 条消息也不卡

// 原理:
// 1000 条消息，终端窗口只能显示 50 条
// 只渲染这 50 条，其余不渲染
// 用户滚动时，动态替换可见区域的内容

// 不用虚拟列表: 渲染 1000 个 React 组件 → 卡顿
// 用虚拟列表:   渲染 50 个 React 组件   → 流畅
```

其他渲染优化手段包括：

```typescript
// 1. React.memo — 避免不必要的重渲染
const MessageItem = React.memo(({ message }) => {
  return <Text>{message.content}</Text>
})
// 只有 message 变化时才重新渲染

// 2. 批量更新 — 合并多次 setState
// 流式输出时不要每个字符都 setState
let buffer = ''
for await (const chunk of stream) {
  buffer += chunk.text
  // 每 50ms 批量更新一次，而不是每个 chunk 更新
}

// 3. 防抖 — 限制高频更新
function debounceRender(fn: () => void, ms: number) {
  let timer: NodeJS.Timeout
  return () => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}
```

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **Cost Tracker** | 成本追踪器，实时计算 API 调用费用 | `getTotalCost() → $0.42` |
| **Token Budget** | Token 预算，限制每轮对话的 token 使用量 | 200K 上下文中预留 16K 给输出 |
| **Prompt Cache** | 提示缓存，复用请求前缀的计算结果 | 缓存命中的 token 只需 10% 价格 |
| **Dead Code Elimination** | 死代码消除，编译时移除未使用的代码 | Bun 的 tree-shaking |
| **FPS Metrics** | 帧率监控，追踪终端 UI 的渲染性能 | 保持 30+ FPS |
| **Virtual List** | 虚拟列表，只渲染可见区域的元素 | 1000 条消息只渲染 50 条 |
| **Cost Threshold** | 成本阈值，达到后提醒用户 | `$2.50 → 弹出提醒` |
| **Profile Checkpoint** | 性能检查点，计时代码中各阶段耗时 | `start → config_loaded: 98ms` |

---

## 💻 代码示例

### 示例 1: 完整的成本追踪器

```typescript
type ModelPricing = {
  input: number    // per million tokens
  output: number   // per million tokens
  cacheRead: number
  cacheWrite: number
}

class CostTracker {
  private records: Array<{
    timestamp: number
    model: string
    inputTokens: number
    outputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
  }> = []
  
  private pricing: Record<string, ModelPricing> = {
    'claude-sonnet-4-20250514': {
      input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75
    },
    'claude-haiku-3-5-20241022': {
      input: 0.25, output: 1.25, cacheRead: 0.03, cacheWrite: 0.30
    },
  }
  
  record(model: string, usage: {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }) {
    this.records.push({
      timestamp: Date.now(),
      model,
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
      cacheReadTokens: usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
    })
  }
  
  getTotalCost(): number {
    let total = 0
    for (const r of this.records) {
      const price = this.pricing[r.model]
      if (!price) continue
      
      // 非缓存的输入 token
      const regularInput = r.inputTokens - r.cacheReadTokens - r.cacheWriteTokens
      total += (regularInput / 1_000_000) * price.input
      
      // 缓存读取（折扣价）
      total += (r.cacheReadTokens / 1_000_000) * price.cacheRead
      
      // 缓存创建（稍贵）
      total += (r.cacheWriteTokens / 1_000_000) * price.cacheWrite
      
      // 输出 token
      total += (r.outputTokens / 1_000_000) * price.output
    }
    return total
  }
  
  getSummary() {
    const totalInput = this.records.reduce((sum, r) => sum + r.inputTokens, 0)
    const totalOutput = this.records.reduce((sum, r) => sum + r.outputTokens, 0)
    const totalCacheHit = this.records.reduce((sum, r) => sum + r.cacheReadTokens, 0)
    const cacheHitRate = totalInput > 0
      ? (totalCacheHit / totalInput * 100).toFixed(1)
      : '0.0'
    
    return {
      cost: `$${this.getTotalCost().toFixed(4)}`,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheHitRate: `${cacheHitRate}%`,
      apiCalls: this.records.length,
    }
  }
  
  format(): string {
    const s = this.getSummary()
    return `${s.cost} | ${s.inputTokens} in / ${s.outputTokens} out | Cache: ${s.cacheHitRate} | Calls: ${s.apiCalls}`
  }
}
```

### 示例 2: 启动性能分析器

```typescript
class StartupProfiler {
  private checkpoints: Array<{ label: string; time: number }> = []
  
  checkpoint(label: string) {
    this.checkpoints.push({ label, time: performance.now() })
  }
  
  report(): string {
    if (this.checkpoints.length < 2) return 'No checkpoints'
    
    const lines = []
    for (let i = 1; i < this.checkpoints.length; i++) {
      const prev = this.checkpoints[i - 1]
      const curr = this.checkpoints[i]
      const duration = (curr.time - prev.time).toFixed(1)
      lines.push(`  ${prev.label} → ${curr.label}: ${duration}ms`)
    }
    
    const total = (
      this.checkpoints.at(-1)!.time - this.checkpoints[0].time
    ).toFixed(1)
    lines.push(`  Total: ${total}ms`)
    
    return lines.join('\n')
  }
}

// 使用示例
const profiler = new StartupProfiler()
profiler.checkpoint('start')

const config = await loadConfig()
profiler.checkpoint('config_loaded')

const tools = await registerTools()
profiler.checkpoint('tools_registered')

renderUI()
profiler.checkpoint('ui_rendered')

console.log(profiler.report())
// start → config_loaded: 45.2ms
// config_loaded → tools_registered: 123.8ms
// tools_registered → ui_rendered: 31.5ms
// Total: 200.5ms
```

---

## ✏️ 动手练习

### 练习 1: 添加成本显示 (⏱️ ~15 分钟)

在你的 Agent CLI 的状态栏中添加实时成本显示。

**要求：**
- 每次 API 调用后更新成本
- 显示格式：`$0.0234 | 12K in / 2K out`
- 支持至少两种模型的定价
- 成本超过 $1 时颜色变黄，超过 $5 时变红

### 练习 2: 启动性能分析 (⏱️ ~20 分钟)

为你的 Agent 添加启动性能分析：记录每个阶段的耗时，找到瓶颈。

**要求：**
- 实现 `StartupProfiler` 类，支持 `checkpoint` 和 `report`
- 在启动流程中至少放置 5 个检查点
- 支持 `--profile` 命令行参数，启用时打印报告
- 找出最慢的启动阶段并尝试优化

### 练习 3: Token 估算器 (⏱️ ~15 分钟)

实现准确的 token 估算函数。

**要求：**
- 中文字符：1 个字 ≈ 2 tokens
- 英文单词：1 个词 ≈ 1.3 tokens
- 代码：1 行 ≈ 10 tokens（平均）
- 编写测试，将估算结果与实际 API 返回的 token 数比较

---

## 📖 扩展阅读

1. **Anthropic Prompt Caching 文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
   - 推荐：理解缓存机制和最佳实践

2. **Anthropic Streaming API**
   - 🔗 https://docs.anthropic.com/en/api/messages-streaming
   - 推荐：流式响应中的 usage 信息

3. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：SDK 中的 usage 追踪 API

---

## 🤔 思考题

1. 如何在不牺牲质量的情况下降低 API 成本？（提示：模型选择、缓存策略、上下文压缩）
2. 启动速度对用户体验的影响有多大？值得花多少工程精力优化？（提示：考虑 CLI 工具的使用频率）
3. Prompt Cache 如何设计才能最大化缓存命中率？（提示：消息排列顺序和稳定前缀）
4. 虚拟列表在终端 UI 中和 Web UI 中的实现有什么区别？
5. 如果 API 价格下降 10 倍，成本优化还重要吗？哪些优化仍然有价值？

---

## ➡️ 下一步

**明天：** [Day 20 — 多 Agent 系统](./day-20-multi-agent.md) — 学习 Agent 如何组成团队协作完成复杂任务。

### 自检清单

- [ ] 我理解 AI Agent 的成本结构（输入/输出/缓存）
- [ ] 我知道 Prompt Cache 的工作原理和优化策略
- [ ] 我能实现基本的成本追踪器
- [ ] 我理解启动性能优化的并行化和延迟加载策略
- [ ] 我知道虚拟列表解决了什么性能问题

[← 上一天: 状态管理](./day-18-state-management.md) | [课程首页](../README.md) | [下一天: 多 Agent 系统 →](./day-20-multi-agent.md)
