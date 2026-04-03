# Day 18: 状态管理与 AppState

[← 上一天: 任务系统](./day-17-task-system.md) | [课程首页](../README.md) | [下一天: 成本与性能 →](./day-19-cost-and-performance.md)

---

## 🎯 学习目标

1. 理解 Claude Code 的 **AppState** 设计
2. 掌握 **React Context** 在终端应用中的状态管理
3. 了解**会话恢复**机制
4. 学习**不可变状态更新**模式
5. 能够为自己的 Agent 实现**状态持久化和恢复**

**难度:** 🟡 中级 | **预计时间:** 1 小时

---

## 📚 核心概念

### 为什么 AI Agent 需要状态管理？

一个 AI Agent 在运行过程中需要追踪大量信息：对话历史、当前使用的模型、已花费的 Token 数量、权限配置、UI 主题……这些信息散落在各处会导致代码混乱、难以维护、状态不一致。

状态管理的核心思想是：**把所有需要共享的状态集中到一个地方管理**，让状态的读取和更新都有明确的路径。

```
没有状态管理:
  组件 A ──── 自己维护 messages[] ────→ 不同步！
  组件 B ──── 自己维护 messages[] ────→ 不同步！
  组件 C ──── 自己维护 cost ──────────→ 不一致！

有状态管理:
  ┌─ AppState（唯一数据源）─────────┐
  │  messages: Message[]           │
  │  cost: number                  │
  │  model: string                 │
  └───────────────────────────────┘
      ↑↓          ↑↓          ↑↓
  组件 A      组件 B      组件 C
  （都从同一个地方读取和更新）
```

这个设计模式在前端框架中非常常见（Redux、Zustand、MobX），Claude Code 使用 React 原生的 Context API 来实现——因为 Ink 就是 React，所以可以直接复用 React 的状态管理方案。

### AppState — 全局状态中心

AppState 定义了 Agent 运行时的所有共享状态：

```typescript
// src/state/AppState.ts — 核心状态类型（简化）
export type AppState = {
  // 会话状态
  messages: Message[]
  isLoading: boolean
  
  // 配置
  model: string
  permissionMode: PermissionMode
  tools: Tool[]
  
  // UI 状态
  inputMode: 'normal' | 'vim'
  theme: 'dark' | 'light'
  
  // 运行时
  sessionId: string
  cwd: string
  cost: number
  tokenCount: number
}
```

注意状态的分类方式：
- **会话状态**（messages、isLoading）：随对话进展变化，每次用户交互都会更新
- **配置**（model、permissionMode）：启动时设置，运行中很少变化
- **UI 状态**（inputMode、theme）：用户界面相关，只影响显示
- **运行时数据**（sessionId、cost）：程序运行过程中计算产生

这种分类有助于理解哪些状态需要持久化（会话状态、配置），哪些是临时的（UI 状态、运行时数据的一部分）。

### Provider 模式

AppState 通过 React Context 提供给整个组件树。Provider 模式是 React 中数据共享的标准方式：

```tsx
// src/state/AppState.ts — Provider
export function AppStateProvider({ initialState, onChangeAppState, children }) {
  const [state, setState] = useState(initialState)
  
  // 状态变化时的回调（用于持久化等）
  useEffect(() => {
    onChangeAppState(state)
  }, [state])
  
  return (
    <AppStateContext.Provider value={{ state, setState }}>
      {children}
    </AppStateContext.Provider>
  )
}

// 任何子组件都可以访问和更新状态
function useAppState() {
  return useContext(AppStateContext)
}
```

Provider 包裹在组件树的最顶层：

```tsx
// 组件树结构
<AppStateProvider initialState={...} onChangeAppState={...}>
  <App>
    <Header />           {/* 可以读取 state.model, state.cost */}
    <MessageList />      {/* 可以读取 state.messages */}
    <InputBox />         {/* 可以读取和更新 state */}
    <StatusBar />        {/* 可以读取 state.tokenCount */}
  </App>
</AppStateProvider>
```

任何被 Provider 包裹的子组件都可以通过 `useAppState()` 访问和更新状态——不需要通过 props 一层层传递。

### 不可变状态更新

Claude Code 使用**不可变更新**（Immutable Update）模式管理状态。这意味着每次状态变化都创建一个新对象，而不是修改原对象：

```typescript
// ❌ 可变更新（直接修改）
state.messages.push(newMessage)     // 危险！
state.cost = newCost                // 危险！

// ✅ 不可变更新（创建新对象）
setState(prev => ({
  ...prev,
  messages: [...prev.messages, newMessage],  // 新数组
  cost: newCost                               // 新值
}))
```

为什么要这样做？三个关键原因：

1. **变化检测**：React 通过比较引用（`prevState !== newState`）来判断是否需要重新渲染。如果直接修改对象，引用不变，React 不知道状态变了
2. **时间旅行**：不可变数据让你可以保留历史状态快照，实现撤销/重做
3. **可预测性**：状态只能通过 setState 更新，更容易追踪状态变化的来源

### 状态变化监听

状态变化不仅仅是 UI 重新渲染——很多副作用需要在状态变化时执行：

```typescript
// src/state/onChangeAppState.ts
// 状态变化时触发的副作用
export function onChangeAppState(newState: AppState, prevState: AppState) {
  // 消息列表变化 → 持久化到磁盘
  if (newState.messages !== prevState.messages) {
    saveSessionTranscript(newState.messages)
  }
  
  // 成本变化 → 更新成本追踪
  if (newState.cost !== prevState.cost) {
    updateCostTracker(newState.cost)
  }
  
  // 权限模式变化 → 记录日志
  if (newState.permissionMode !== prevState.permissionMode) {
    logPermissionModeChange(prevState.permissionMode, newState.permissionMode)
  }
}
```

注意这里用引用比较（`!==`）来判断状态是否变化——这正是不可变更新模式的好处。因为我们每次都创建新对象，所以可以用简单的引用比较代替深度比较。

### 会话持久化

Claude Code 将对话历史持久化到磁盘，存储路径在用户的主目录下：

```
~/.claude/
├── sessions/
│   ├── abc123/
│   │   ├── transcript.json    # 对话历史
│   │   ├── metadata.json      # 会话元数据
│   │   └── tasks/             # 任务输出
│   ├── def456/
│   │   └── ...
│   └── ...
└── settings.json
```

每个会话的 transcript 包含完整的消息列表，包括用户消息、助手消息、工具调用和工具结果。

### 会话恢复

Claude Code 支持恢复之前的会话——这对长时间运行的项目非常有价值：

```typescript
// claude --resume <sessionId>
// 从磁盘加载之前的消息历史，恢复对话状态
async function resumeSession(sessionId: string): Promise<AppState> {
  const transcript = await loadSessionTranscript(sessionId)
  return {
    ...defaultState,
    sessionId,
    messages: transcript.messages,
    // 恢复其他状态...
  }
}
```

会话恢复有一些微妙之处需要注意：

1. **工具调用不会重新执行**：恢复的是消息历史，不是重新运行所有工具
2. **文件系统可能已变化**：恢复会话后，之前工具读取的文件可能已被修改
3. **API 状态可能已过期**：之前获取的 API 响应可能不再有效
4. **成本从 0 开始**：恢复的会话开始新的成本计算

因此，Claude Code 在恢复会话后会告诉模型：这是一个恢复的会话，之前的工具结果可能已过时，需要重新验证关键信息。

### 状态快照与回滚

对于关键操作（如文件编辑），保存状态快照可以在出错时回滚：

```typescript
class StateSnapshots {
  private snapshots: Array<{
    timestamp: number
    state: AppState
    label: string
  }> = []
  
  save(state: AppState, label: string) {
    this.snapshots.push({
      timestamp: Date.now(),
      state: structuredClone(state),  // 深拷贝
      label
    })
    
    // 只保留最近 10 个快照
    if (this.snapshots.length > 10) {
      this.snapshots.shift()
    }
  }
  
  rollback(): AppState | null {
    const snapshot = this.snapshots.pop()
    return snapshot?.state ?? null
  }
  
  list() {
    return this.snapshots.map(s => ({
      timestamp: s.timestamp,
      label: s.label
    }))
  }
}
```

### 派生状态

有些状态可以从其他状态计算得到，不需要独立存储。这类状态叫做**派生状态**（Derived State）：

```typescript
// 派生状态示例
function useDerivedState(state: AppState) {
  // 消息数量 = messages.length（不需要单独存储）
  const messageCount = state.messages.length
  
  // 最后一条消息 = messages 的最后一个元素
  const lastMessage = state.messages.at(-1)
  
  // 是否有未完成的工具调用
  const hasPendingToolCalls = state.messages.some(m => 
    m.role === 'assistant' && 
    m.content.some(b => b.type === 'tool_use') &&
    !state.messages.some(r => 
      r.role === 'user' && 
      r.content.some(b => b.type === 'tool_result' && b.tool_use_id === /* ... */)
    )
  )
  
  return { messageCount, lastMessage, hasPendingToolCalls }
}
```

派生状态的规则：**如果能从已有状态计算得到，就不要存储它**。这避免了状态不一致的风险。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **AppState** | 全局应用状态，包含所有共享数据 | 消息、配置、运行时数据 |
| **Context** | React 上下文，用于跨组件共享状态 | `AppStateContext` |
| **Provider** | 状态提供者组件，包裹组件树提供状态 | `<AppStateProvider>` |
| **Immutable Update** | 不可变更新，创建新对象而非修改原对象 | `{ ...state, cost: newCost }` |
| **Session Resume** | 会话恢复，从磁盘加载之前的对话状态 | `claude --resume abc123` |
| **Derived State** | 派生状态，从已有状态计算得到的值 | `messageCount = messages.length` |
| **Side Effect** | 副作用，状态变化时触发的额外操作 | 状态变化 → 持久化到磁盘 |
| **Snapshot** | 状态快照，某一时刻的完整状态副本 | 关键操作前保存快照用于回滚 |

---

## 💻 代码示例

### 示例 1: Agent 状态管理器

```typescript
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

type Message = {
  role: 'user' | 'assistant'
  content: string | Array<{ type: string; [key: string]: unknown }>
}

type AgentState = {
  messages: Message[]
  isRunning: boolean
  model: string
  tokenCount: number
  cost: number
  sessionId: string
}

class StateManager {
  private state: AgentState
  private listeners: ((state: AgentState) => void)[] = []
  private prevState: AgentState
  
  constructor(initial: AgentState) {
    this.state = initial
    this.prevState = initial
  }
  
  update(partial: Partial<AgentState>) {
    this.prevState = this.state
    // 不可变更新
    this.state = { ...this.state, ...partial }
    // 通知监听者
    this.listeners.forEach(l => l(this.state))
  }
  
  // 添加消息的专用方法（确保不可变更新）
  addMessage(message: Message) {
    this.update({
      messages: [...this.state.messages, message]
    })
  }
  
  subscribe(listener: (state: AgentState) => void) {
    this.listeners.push(listener)
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener)
    }
  }
  
  getState() { return this.state }
  getPrevState() { return this.prevState }
  
  // 持久化到磁盘
  async save(sessionDir: string) {
    await mkdir(sessionDir, { recursive: true })
    
    const transcript = {
      sessionId: this.state.sessionId,
      messages: this.state.messages,
      model: this.state.model,
      savedAt: new Date().toISOString()
    }
    
    await writeFile(
      join(sessionDir, 'transcript.json'),
      JSON.stringify(transcript, null, 2)
    )
  }
  
  // 从磁盘恢复
  static async restore(sessionDir: string): Promise<AgentState> {
    const data = await readFile(
      join(sessionDir, 'transcript.json'), 'utf8'
    )
    const transcript = JSON.parse(data)
    
    return {
      messages: transcript.messages,
      isRunning: false,
      model: transcript.model,
      tokenCount: 0,  // 恢复后重新计算
      cost: 0,        // 恢复后重新计算
      sessionId: transcript.sessionId
    }
  }
}
```

### 示例 2: 使用 React Context 的 Ink 状态管理

```tsx
import React, { createContext, useContext, useState, useCallback } from 'react'
import { Box, Text } from 'ink'

// 定义状态类型和 Context
type Theme = 'dark' | 'light'
type AppContext = {
  theme: Theme
  toggleTheme: () => void
  messageCount: number
  addMessage: (msg: string) => void
}

const AppCtx = createContext<AppContext>(null!)

// Provider 组件
function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')
  const [messages, setMessages] = useState<string[]>([])
  
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])
  
  const addMessage = useCallback((msg: string) => {
    setMessages(prev => [...prev, msg])
  }, [])
  
  return (
    <AppCtx.Provider value={{
      theme,
      toggleTheme,
      messageCount: messages.length,  // 派生状态
      addMessage,
    }}>
      {children}
    </AppCtx.Provider>
  )
}

// 子组件通过 Hook 访问状态
function StatusBar() {
  const { theme, messageCount } = useContext(AppCtx)
  return (
    <Box borderStyle="single" paddingX={1}>
      <Text dimColor>
        Theme: {theme} | Messages: {messageCount}
      </Text>
    </Box>
  )
}
```

---

## ✏️ 动手练习

### 练习 1: 实现状态持久化 (⏱️ ~20 分钟)

将 Agent 的对话历史保存到 `~/.my-agent/sessions/<id>.json`，支持恢复。

**要求：**
- 实现 `save(sessionId)` 和 `restore(sessionId)` 方法
- 保存消息列表、模型名称、保存时间
- 处理文件不存在的情况（首次使用时自动创建目录）
- 支持列出所有已保存的会话

### 练习 2: Ink + Context 全局主题 (⏱️ ~20 分钟)

用 Ink 的 React Context 实现一个全局主题切换（dark/light）。

**要求：**
- 创建 ThemeProvider 和 useTheme Hook
- 按 `t` 键切换主题
- 至少 3 个子组件使用主题（不同背景色和文字颜色）
- 主题切换时所有组件同步更新

### 练习 3: 状态快照与回滚 (⏱️ ~15 分钟)

实现状态快照功能：在关键操作前保存状态，出错时可以回滚。

**要求：**
- 实现 `snapshot(label)` 和 `rollback()` 方法
- 使用 `structuredClone` 进行深拷贝
- 限制最大快照数量（最近 10 个）
- 支持查看快照历史

---

## 📖 扩展阅读

1. **Ink 终端 UI 框架**
   - 🔗 https://github.com/vadimdemedes/ink
   - 推荐：Ink 的 React 状态管理与 Web React 的异同

2. **TypeScript 官方文档**
   - 🔗 https://www.typescriptlang.org/docs/
   - 推荐：理解类型系统对状态管理的帮助

3. **Node.js 文件系统 API**
   - 🔗 https://nodejs.org/api/
   - 推荐：fs/promises 模块，用于状态持久化

---

## 🤔 思考题

1. 为什么用不可变更新模式？直接修改状态有什么问题？（提示：考虑 React 的渲染机制和调试体验）
2. 状态持久化应该同步还是异步？各有什么优缺点？（提示：考虑性能和数据一致性的权衡）
3. 会话恢复后，之前的工具调用还能重新执行吗？有什么风险？（提示：考虑文件系统变化和幂等性）
4. 如果两个组件同时更新状态会怎样？React 的批量更新机制如何解决这个问题？
5. 派生状态和存储状态的界限在哪里？什么时候应该用 `useMemo` 而不是存到 state 中？

---

## ➡️ 下一步

**明天：** [Day 19 — 成本与性能](./day-19-cost-and-performance.md) — 学习 Agent 如何追踪 API 成本和优化运行性能。

### 自检清单

- [ ] 我理解为什么需要集中式状态管理
- [ ] 我能解释 React Context + Provider 模式的工作原理
- [ ] 我知道不可变更新的三个好处（变化检测、时间旅行、可预测性）
- [ ] 我能实现基本的状态持久化和恢复功能
- [ ] 我理解派生状态的概念和使用场景

[← 上一天: 任务系统](./day-17-task-system.md) | [课程首页](../README.md) | [下一天: 成本与性能 →](./day-19-cost-and-performance.md)
