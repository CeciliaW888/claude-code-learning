# Day 04: REPL 循环与用户输入处理

[← 上一天: 终端 UI](./day-03-ink-terminal-ui.md) | [课程首页](../README.md) | [下一天: Tool 系统基础 →](./day-05-tool-system-basics.md)

---

## 🎯 学习目标

1. 理解 `REPL.tsx` 的**核心架构**和状态管理
2. 掌握**用户输入**的处理流程（从按键到提交）
3. 了解 **Early Input** 捕获和快捷键系统
4. 学习**对话管理**模式：提交、中断、恢复

**难度:** 🟡 中级 | **预计时间:** 1 小时（30 分钟阅读 + 30 分钟动手）

---

## 📚 核心概念

### REPL.tsx — 核心交互引擎

`screens/REPL.tsx` 是 Claude Code 中最大的单个组件（约 2000 行），它管理整个交互循环。这个组件像一个指挥中心，协调输入、消息渲染、工具执行、权限请求等一切交互。

#### 为什么一个组件这么大？

2000 行的 React 组件在 Web 开发中通常被认为是"代码异味"。但 REPL.tsx 有它的道理——它是整个应用的**编排器（Orchestrator）**，需要协调的状态和事件太多了：

- 用户输入和提交
- 消息列表的渲染和滚动
- Agent 循环的启动和中断
- 权限对话框的弹出和用户响应
- 斜杠命令的解析和执行
- 会话恢复和历史管理
- 键盘快捷键处理

把这些逻辑分散到十几个小组件中，会导致它们之间的通信变得复杂。有时候，一个大而全的组件比十个相互耦合的小组件更容易维护。

REPL 的核心状态：

```typescript
// REPL.tsx 中的关键状态（简化）
const [messages, setMessages] = useState<Message[]>([])
const [isLoading, setIsLoading] = useState(false)
const [inputMode, setInputMode] = useState<'normal' | 'vim'>('normal')
const [permissionRequest, setPermissionRequest] = useState(null)
const queryGuard = useRef(new QueryGuard())
```

### 输入处理流程

当用户按下 Enter 键：

```
用户按 Enter
     │
     ▼
PromptInput 组件捕获
     │
     ▼
REPL.handleSubmit(text)
     │
     ├─ 是否是命令？(以 / 开头)
     │    ├─ 是 → 执行命令（/help, /clear, /model）
     │    └─ 否 → 继续
     │
     ▼
创建 UserMessage
     │
     ▼
messages.push(userMessage)
     │
     ▼
QueryEngine.submitMessage(text)
     │
     ▼
进入 Agent 循环 → query()
```

### Early Input — 预捕获

Claude Code 有一个聪明的优化：在系统还没完全准备好时，就开始捕获用户输入：

```typescript
// src/utils/earlyInput.ts
// 启动阶段就开始监听键盘，存储在缓冲区
seedEarlyInput()

// REPL 准备好后，消费之前缓存的输入
const earlyInput = consumeEarlyInput()
if (earlyInput) {
  setInitialInput(earlyInput)
}
```

用户不需要等待 "Loading..." 完成才开始打字——输入会被缓存，加载完成后自动填入输入框。

这个优化看起来很小，但对用户体验影响很大。想象一下：你打开 Claude Code，脑子里已经有了要问的问题，立刻开始打字——如果系统强迫你等 1-2 秒才能输入，你的思路可能就中断了。Early Input 消除了这个等待。

### 对话的生命周期

一次完整的对话交互涉及多个阶段的状态变化：

```
1. 空闲态 (Idle)
   ├── 输入框可编辑
   ├── 等待用户输入
   └── 状态栏显示模型信息
   
2. 提交态 (Submitting)
   ├── 输入框禁用
   ├── 用户消息添加到列表
   └── 触发 QueryEngine.submitMessage()
   
3. 处理态 (Processing)
   ├── Spinner 动画显示
   ├── 流式接收 Claude 的回复
   ├── 可能触发权限请求
   └── 用户可以按 Ctrl+C 中断
   
4. 工具执行态 (Tool Executing)
   ├── 显示工具执行进度
   ├── 等待工具返回结果
   └── 结果返回后回到处理态
   
5. 完成态 → 回到空闲态
```

这个状态机清晰地定义了 REPL 在每个时刻应该做什么、显示什么、允许什么操作。

### 斜杠命令系统

Claude Code 支持丰富的斜杠命令：

```typescript
// src/commands.ts — 命令定义
const commands: Command[] = [
  { name: 'help',   description: '显示帮助' },
  { name: 'clear',  description: '清除对话历史' },
  { name: 'model',  description: '切换模型' },
  { name: 'resume', description: '恢复历史会话' },
  { name: 'config', description: '配置设置' },
  // ... 更多命令
]
```

### 中断与取消

用户按 `Ctrl+C` 或 `Escape` 时的处理：

```typescript
// 中断处理逻辑
useCancelRequest({
  onCancel: () => {
    if (isLoading) {
      // Agent 正在执行 → 中断当前查询
      queryGuard.current.abort()
      setIsLoading(false)
    }
    // 添加 "用户中断" 标记
    addInterruptedMessage()
  }
})
```

中断处理看起来简单，但实际上涉及很多细节：

- **API 请求中断**：如果正在等待 Claude API 的响应，需要取消 HTTP 请求（使用 `AbortController`）
- **工具执行中断**：如果正在执行 Shell 命令，需要杀死子进程
- **状态回滚**：UI 需要正确回到可输入状态，不能"卡住"
- **消息记录**：在对话历史中标记"这里被用户中断了"，这样 Claude 在继续对话时知道上下文

`QueryGuard` 是一个守卫模式的实现——它确保同一时间只有一个 Agent 循环在运行。如果用户快速提交两次，第二次会等待第一次完成（或中断后再开始）。

### PromptInput 组件

输入框看似简单，但 Claude Code 的 `PromptInput` 组件处理了很多细节：

```tsx
// PromptInput 的核心功能
<PromptInput
  onSubmit={handleSubmit}         // Enter 提交
  disabled={isLoading}            // 加载时禁用
  placeholder="Message Claude..." // 占位文本
  multiline={true}                // 支持多行输入
  vimMode={inputMode === 'vim'}   // Vim 按键支持
  history={inputHistory}          // 输入历史（上箭头回溯）
  autoComplete={slashCommands}    // 斜杠命令自动补全
/>
```

支持 Vim 模式是一个有趣的功能——许多开发者习惯 Vim 的按键方式（`hjkl` 移动光标、`i` 进入编辑模式、`Esc` 退出编辑模式）。Claude Code 让这些用户在 CLI 中也能保持肌肉记忆。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **REPL** | Read-Eval-Print Loop | 读取输入 → 执行 → 打印结果 → 循环 |
| **QueryGuard** | 查询保护：防止并发请求 | 确保同时只有一个 Agent 循环在运行 |
| **Early Input** | 预捕获用户输入 | 启动时就缓存键盘输入 |
| **Slash Command** | 以 `/` 开头的内置命令 | `/help`, `/clear`, `/model` |
| **InputMode** | 输入模式 | normal（普通）或 vim（vim 按键） |
| **Abort** | 中断正在执行的操作 | `Ctrl+C` 取消 Agent 循环 |

---

## 💻 代码示例

### 示例 1: 简化的 REPL 组件

```tsx
// 你自己的 REPL 组件
import React, { useState, useCallback } from 'react'
import { Box, Text } from 'ink'

function MyREPL({ queryEngine }) {
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  
  const handleSubmit = useCallback(async (input: string) => {
    // 检查斜杠命令
    if (input.startsWith('/')) {
      handleCommand(input)
      return
    }
    
    // 添加用户消息
    setMessages(prev => [...prev, { role: 'user', content: input }])
    setIsLoading(true)
    
    try {
      // 提交给 Agent 循环
      const response = await queryEngine.submitMessage(input)
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } finally {
      setIsLoading(false)
    }
  }, [queryEngine])
  
  return (
    <Box flexDirection="column">
      {/* 消息列表 */}
      {messages.map((msg, i) => (
        <MessageRow key={i} message={msg} />
      ))}
      
      {/* 加载状态 */}
      {isLoading && <Text color="yellow">⠋ 思考中...</Text>}
      
      {/* 输入框 */}
      <PromptInput onSubmit={handleSubmit} disabled={isLoading} />
    </Box>
  )
}
```

### 示例 2: 命令处理器

```typescript
// 命令处理模式
function handleCommand(input: string) {
  const [cmd, ...args] = input.slice(1).split(' ')
  
  switch (cmd) {
    case 'help':
      showHelp()
      break
    case 'clear':
      setMessages([])
      break
    case 'model':
      switchModel(args[0])
      break
    default:
      showError(`未知命令: /${cmd}`)
  }
}
```

---

## ✏️ 动手练习

### 练习 1: 添加斜杠命令 (⏱️ ~20 分钟)

在昨天的 Ink 应用中添加斜杠命令支持：
- `/clear` — 清除消息
- `/help` — 显示可用命令列表
- `/exit` — 退出程序

### 练习 2: 实现中断功能 (⏱️ ~15 分钟)

添加 `Ctrl+C` 中断正在执行的操作的功能。提示：使用 `useInput` Hook 监听 `ctrl+c`。

### 练习 3: Early Input 缓冲 (⏱️ ~10 分钟)

实现一个简单的输入缓冲：在应用"加载"阶段（模拟 2 秒延迟），捕获用户输入，加载完成后自动填入。

---

## 📖 扩展阅读

1. **Ink 官方文档 — useInput Hook**
   - 🔗 https://github.com/vadimdemedes/ink
   - 推荐：键盘输入处理的详细用法，理解 REPL 输入的基础

2. **Commander.js — 命令模式参考**
   - 🔗 https://github.com/tj/commander.js
   - 推荐：理解斜杠命令的设计灵感来源

3. **Node.js API — readline 模块**
   - 🔗 https://nodejs.org/api/
   - 推荐：理解传统的 Node.js REPL 实现方式，对比 Ink 的做法

---

## 🤔 思考题

1. **理解：** 为什么 REPL.tsx 是 2000+ 行的大组件？它是否应该被拆分？拆分后会带来什么新问题？
2. **应用：** 如果你要添加 `/history` 命令来查看最近 10 条对话，需要什么状态？怎么持久化这些历史？
3. **对比：** Claude Code 的 vim 输入模式是怎么实现的？为什么要支持 vim？这说明了什么用户群体？
4. **设计：** 如果要支持"多标签页"（同时进行多个对话），REPL 的状态结构需要怎么改？
5. **思辨：** Early Input 是一个"乐观"的设计——假设用户在加载期间就开始输入。如果用户没有输入呢？这种优化有没有开销？

---

## ➡️ 下一步

**明天：** [Day 05 — Tool 系统基础](./day-05-tool-system-basics.md) — 进入 Claude Code 的核心：Tool 的定义、注册和执行。

**继续前请确认：**
- [ ] 我理解 REPL 的核心状态和交互循环
- [ ] 我知道斜杠命令的处理方式
- [ ] 我了解 Early Input 的优化策略
- [ ] 我能实现简单的输入处理和命令系统

[← 上一天: 终端 UI](./day-03-ink-terminal-ui.md) | [课程首页](../README.md) | [下一天: Tool 系统基础 →](./day-05-tool-system-basics.md)
