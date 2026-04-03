# Day 03: 终端 UI — 用 React 写命令行界面

[← 上一天: 入口与启动](./day-02-entry-and-bootstrap.md) | [课程首页](../README.md) | [下一天: REPL 与输入 →](./day-04-repl-and-input.md)

---

## 🎯 学习目标

1. 理解 **Ink 框架**的核心概念（React for CLI）
2. 掌握 Claude Code 中 `<Box>` 和 `<Text>` 的**终端布局**
3. 了解 **Provider 模式**在终端 UI 中的应用
4. 学习如何用 **React 组件**渲染终端界面

**难度:** 🟢 入门 | **预计时间:** 1 小时（30 分钟阅读 + 30 分钟动手）

---

## 📚 核心概念

### 为什么用 React 写终端？

传统的 CLI 工具直接 `console.log` 输出文本。但 Claude Code 需要复杂得多的界面：实时更新的 Spinner、可滚动的消息列表、权限对话框、进度条——这些用 `console.log` 根本无法实现。

Ink 让你用 React 的方式写终端 UI。`<Box>` 相当于 `<div>`，`<Text>` 相当于 `<span>`。React 的状态管理、生命周期、组件组合在终端中全部可用。

#### 传统方式 vs Ink 方式

让我们对比一下同一个界面用两种方式实现的差异：

```typescript
// 传统方式：手动管理光标和输出
process.stdout.write('\x1b[2J')       // 清屏
process.stdout.write('\x1b[1;1H')     // 移动光标
process.stdout.write('\x1b[32m✓\x1b[0m 完成\n')  // 彩色输出
// 如果要更新某一行？需要手动追踪行号、光标位置...
// 如果要响应窗口大小变化？需要监听 resize 事件手动重排...

// Ink 方式：声明式 UI
function Status({ done }) {
  return (
    <Box flexDirection="column">
      <Text color={done ? "green" : "yellow"}>
        {done ? "✓ 完成" : "⠋ 执行中..."}
      </Text>
    </Box>
  )
}
// 状态变了？React 自动重新渲染，不需要手动管理光标
```

Ink 的优势在于**声明式**——你描述"界面应该长什么样"，而不是"怎么一步步画出来"。这和 React 在 Web 开发中取代 jQuery 的逻辑完全一样。

```tsx
// Ink 基础示例
import { Box, Text } from 'ink'

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="green">✓ 任务完成</Text>
      <Text dimColor>耗时 2.3 秒</Text>
    </Box>
  )
}
```

### Claude Code 的组件树

Claude Code 的 UI 层次结构：

```
<App>                               # 顶层容器
  <FpsMetricsProvider>              # FPS 性能监控
    <StatsProvider>                 # 统计数据
      <AppStateProvider>            # 全局状态
        <REPL>                      # 主交互界面
          <VirtualMessageList>      # 虚拟滚动消息列表
            <MessageRow>            # 单条消息
              <Message>             # 消息内容
              <ToolUseLoader>       # 工具执行动画
          <StatusLine>              # 底部状态栏
          <PromptInput>             # 输入框
```

看 `App.tsx` 的实际代码：

```tsx
// src/components/App.tsx
export function App({ getFpsMetrics, stats, initialState, children }) {
  return (
    <FpsMetricsProvider getFpsMetrics={getFpsMetrics}>
      <StatsProvider store={stats}>
        <AppStateProvider
          initialState={initialState}
          onChangeAppState={onChangeAppState}
        >
          {children}
        </AppStateProvider>
      </StatsProvider>
    </FpsMetricsProvider>
  )
}
```

这是经典的 **Provider 嵌套**模式——每一层 Provider 为子组件提供不同的上下文数据。

#### Provider 模式详解

如果你不熟悉 React 的 Provider 模式，可以这样理解：Provider 就像"全局变量仓库"，但比全局变量更安全。

```tsx
// 没有 Provider 的情况：需要层层传递 props
<App stats={stats}>
  <REPL stats={stats}>
    <MessageList stats={stats}>
      <MessageRow stats={stats} />    // 四层传递！
    </MessageList>
  </REPL>
</App>

// 有 Provider 的情况：任何子组件都能直接访问
<StatsProvider store={stats}>
  <App>
    <REPL>
      <MessageList>
        <MessageRow />    // 直接用 useStats() Hook 获取数据
      </MessageList>
    </REPL>
  </App>
</StatsProvider>
```

Claude Code 使用了多层 Provider，每层负责不同的关注点：
- `FpsMetricsProvider`：性能监控数据
- `StatsProvider`：统计数据（Token 数量、成本等）
- `AppStateProvider`：全局应用状态（消息、工具、配置等）

这种分层让每个 Provider 保持简单，不会出现一个巨大的"上帝 Provider"。

### 虚拟滚动 — 性能的关键

当对话很长时（可能有数百条消息），渲染所有消息会导致终端卡顿。Claude Code 使用 `VirtualMessageList` 组件实现**虚拟滚动**——只渲染屏幕可见区域的消息：

```
完整消息列表（100 条）：
  ┌──────────────────┐
  │ Message 1        │  ← 不渲染
  │ Message 2        │  ← 不渲染
  │ ...              │
  │ Message 45       │  ← 不渲染
  ├──────────────────┤
  │ Message 46       │  ← 渲染（可见）
  │ Message 47       │  ← 渲染（可见）
  │ Message 48       │  ← 渲染（可见）
  │ Message 49       │  ← 渲染（可见）
  │ Message 50       │  ← 渲染（可见）
  ├──────────────────┤
  │ Message 51       │  ← 不渲染
  │ ...              │
  └──────────────────┘
```

这和 Web 开发中的虚拟列表（如 `react-virtualized`）是同一个概念，只是应用在终端场景中。

### Ink 的布局系统

Ink 使用 Flexbox 布局，和 CSS Flexbox 几乎一样：

```tsx
// 水平布局
<Box flexDirection="row">
  <Text>左边</Text>
  <Box flexGrow={1} />  {/* 弹性空间 */}
  <Text>右边</Text>
</Box>

// 垂直布局 + 边距
<Box flexDirection="column" marginLeft={2} paddingY={1}>
  <Text>第一行</Text>
  <Text>第二行</Text>
</Box>

// 边框
<Box borderStyle="round" borderColor="cyan" padding={1}>
  <Text>带边框的内容</Text>
</Box>
```

### Claude Code 中的 Spinner

看看 Claude Code 如何实现加载动画：

```tsx
// src/components/Spinner.tsx — 简化版
export function SpinnerWithVerb({ verb, mode }) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  const [frameIndex, setFrameIndex] = useState(0)
  
  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex(i => (i + 1) % frames.length)
    }, 80)
    return () => clearInterval(timer)
  }, [])
  
  return (
    <Text color="yellow">
      {frames[frameIndex]} {verb}...
    </Text>
  )
}
```

这个 Spinner 用 `setInterval` 每 80ms 切换一帧，就像 Web 中的 CSS 动画——但它是在终端里跑的！

### Ink 的 Hooks

Ink 提供了几个终端特有的 React Hooks：

```tsx
import { useInput, useApp, useStdout } from 'ink'

function MyComponent() {
  const { exit } = useApp()           // 退出应用
  const { stdout } = useStdout()      // 获取终端尺寸等信息
  
  // 监听键盘输入
  useInput((input, key) => {
    if (key.escape) exit()             // 按 Escape 退出
    if (key.ctrl && input === 'c') exit()  // Ctrl+C 退出
    if (key.return) handleSubmit()     // Enter 提交
    if (key.upArrow) scrollUp()        // 上箭头滚动
  })
  
  // 终端宽度可以用来做响应式布局
  const width = stdout.columns
  
  return (
    <Box width={Math.min(width, 80)}>
      <Text>自适应宽度的内容</Text>
    </Box>
  )
}
```

这些 Hooks 是 Ink 的核心 API，Claude Code 大量使用它们处理用户交互。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **Ink** | React for CLI 框架 | 用 JSX 写终端界面 |
| **Box** | Ink 的布局容器（类似 div） | `<Box flexDirection="column">` |
| **Text** | Ink 的文本组件（类似 span） | `<Text bold color="red">` |
| **Provider** | React 上下文提供者 | `<AppStateProvider>` |
| **useInput** | Ink 的键盘输入 Hook | 监听按键事件 |
| **VirtualList** | 虚拟滚动列表 | 只渲染可见区域的消息 |

---

## 💻 代码示例

### 示例 1: 最小的 Ink 应用

```tsx
// mini-cli.tsx
import React, { useState, useEffect } from 'react'
import { render, Box, Text, useInput } from 'ink'

function MiniCLI() {
  const [messages, setMessages] = useState<string[]>([])
  const [input, setInput] = useState('')
  
  useInput((inputChar, key) => {
    if (key.return) {
      setMessages(prev => [...prev, `> ${input}`])
      setInput('')
    } else if (key.backspace) {
      setInput(prev => prev.slice(0, -1))
    } else {
      setInput(prev => prev + inputChar)
    }
  })
  
  return (
    <Box flexDirection="column">
      {messages.map((msg, i) => (
        <Text key={i}>{msg}</Text>
      ))}
      <Box>
        <Text color="cyan">❯ </Text>
        <Text>{input}</Text>
        <Text color="gray">│</Text>
      </Box>
    </Box>
  )
}

render(<MiniCLI />)
```

### 示例 2: 带状态栏的完整界面

```tsx
// Claude Code 风格的状态栏
function StatusLine({ model, tokenCount, cost }) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1}>
      <Text dimColor>Model: </Text>
      <Text color="cyan">{model}</Text>
      <Box flexGrow={1} />
      <Text dimColor>Tokens: </Text>
      <Text>{tokenCount.toLocaleString()}</Text>
      <Text dimColor> | Cost: </Text>
      <Text color="yellow">${cost.toFixed(4)}</Text>
    </Box>
  )
}
```

> **💡 试一试：** 安装 Ink (`npm install ink react`)，然后运行示例 1 的代码。体验用 React 写终端的感觉。

---

## ✏️ 动手练习

### 练习 1: Hello Ink (⏱️ ~15 分钟)

```bash
mkdir ink-demo && cd ink-demo
npm init -y
npm install ink react
```

创建一个显示当前时间的 Ink 应用，每秒更新一次。

### 练习 2: 消息列表组件 (⏱️ ~20 分钟)

创建一个 `<MessageList>` 组件，支持：
- 显示用户消息（绿色 `>`）
- 显示 AI 消息（蓝色 `◆`）
- 最新消息自动高亮

### 练习 3: 分析 Claude Code 组件 (⏱️ ~10 分钟)

打开 `src/components/` 目录，数一数有多少组件。找到 3 个你觉得最有趣的组件名，猜猜它们的功能。

---

## 📖 扩展阅读

1. **Ink 官方文档**
   - 🔗 https://github.com/vadimdemedes/ink
   - 推荐：Components 和 Hooks 部分，特别是 `useInput` 和 `useApp`

2. **TypeScript 官方文档 — JSX**
   - 🔗 https://www.typescriptlang.org/docs/
   - 推荐：理解 TSX 文件中 JSX 语法的类型检查

3. **Node.js API — process.stdout**
   - 🔗 https://nodejs.org/api/
   - 推荐：理解终端输出的底层 API，Ink 在其上构建

---

## 🤔 思考题

1. **理解：** 为什么 Claude Code 需要 `VirtualMessageList` 而不是直接渲染所有消息？
2. **应用：** 如果你要添加一个"正在输入..."的动画，应该放在组件树的哪个位置？
3. **对比：** Ink 和 blessed（另一个终端 UI 库）相比，React 模式有什么优势？

---

## ➡️ 下一步

**明天：** [Day 04 — REPL 与输入](./day-04-repl-and-input.md) — 我们将深入 REPL.tsx，这个 2000+ 行的核心交互组件。

**继续前请确认：**
- [ ] 我理解 Ink 的 `<Box>` 和 `<Text>` 组件
- [ ] 我知道 Provider 模式在 UI 中的作用
- [ ] 我能写一个简单的 Ink 应用
- [ ] 我了解 Claude Code 的组件层次结构

[← 上一天: 入口与启动](./day-02-entry-and-bootstrap.md) | [课程首页](../README.md) | [下一天: REPL 与输入 →](./day-04-repl-and-input.md)
