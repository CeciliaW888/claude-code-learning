# Day 17: 任务系统与后台执行

[← 上一天: MCP 集成](./day-16-mcp-integration.md) | [课程首页](../README.md) | [下一天: 状态管理 →](./day-18-state-management.md)

---

## 🎯 学习目标

1. 理解 Claude Code 的**任务（Task）系统**设计
2. 掌握**前台/后台任务**的管理和切换
3. 了解 **Task 生命周期**和进度通知
4. 学习**长时间运行任务**的处理策略
5. 能够实现一个**基本的任务管理器**

**难度:** 🔴 高级 | **预计时间:** 1 小时

---

## 📚 核心概念

### 为什么需要任务系统？

Agent 执行的操作不都是瞬间完成的。`npm install` 可能要几分钟，`git clone` 可能要更长。如果 Agent 在等待一个操作完成时什么都做不了，效率就会很低。

任务系统让 Agent 能**管理长时间运行的操作**，包括：
- 将操作放到后台运行，同时处理其他事情
- 追踪每个操作的进度和状态
- 在操作完成或失败时收到通知
- 并行执行多个独立操作

这就像操作系统的进程管理器——把单线程的 Agent 变成了能并行处理的多任务系统。

```
没有任务系统（串行）:
  Agent → npm install（等 2 分钟）→ npm test（等 1 分钟）→ 回复用户
  总时间: 3 分钟 + 思考时间

有任务系统（并行）:
  Agent → 创建任务: npm install
        → 创建任务: npm test（另一个项目）
        → 思考下一步...
        → 任务 1 完成！任务 2 完成！
        → 汇总结果，回复用户
  总时间: 2 分钟（取决于最慢的任务）
```

### Claude Code 的任务类型

```
src/tasks/
├── LocalShellTask/     # 本地 Shell 任务（前台/后台命令）
├── LocalAgentTask/     # 本地 Agent 任务（子 Agent）
├── RemoteAgentTask/    # 远程 Agent 任务
└── InProcessTeammateTask/  # 进程内队友任务
```

**LocalShellTask**：最常见的任务类型。执行 Shell 命令（如 `npm install`、`git push`），支持前台/后台切换。

**LocalAgentTask**：启动一个子 Agent（参见 Day 13）作为独立任务运行。子 Agent 有自己的消息历史和工具集。

**RemoteAgentTask**：连接到远程运行的 Agent 实例。用于分布式协作场景。

**InProcessTeammateTask**：在同一进程内运行的 Teammate Agent（参见 Day 20 的 Team 模式）。共享进程资源但有独立的执行上下文。

### Task.ts — 任务核心接口

```typescript
// src/Task.ts — 任务核心定义
export type Task = {
  id: string
  type: 'shell' | 'agent' | 'remote'
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  
  // 进度追踪
  progress?: {
    current: number
    total: number
    message: string
  }
  
  // 输出管理
  output: string
  
  // 生命周期
  startTime: number
  endTime?: number
}
```

任务的状态流转遵循严格的生命周期：

```
          ┌──────────┐
          │ pending  │  任务已创建，等待执行
          └────┬─────┘
               │ start()
          ┌────▼─────┐
          │ running  │  任务正在执行
          └──┬───┬───┘
             │   │
    成功完成 │   │ 发生错误
    ┌────────▼┐ ┌▼────────┐
    │completed│ │ failed  │
    └─────────┘ └─────────┘
    
          或者在任何阶段:
          ┌──────────┐
          │cancelled │  用户或系统取消
          └──────────┘
```

### 前台与后台任务

前台和后台的概念是任务系统的关键设计。它解决了一个核心矛盾：用户想看到操作进度（前台），但不想被长时间操作阻塞（后台）。

```typescript
// 前台任务：用户可以看到输出、可以中断
registerForeground(taskId)
// UI 显示实时输出和进度

// 后台任务：静默运行
// 长命令（>2秒）显示 "按 b 转入后台" 提示
// 或自动后台化（>2分钟）
backgroundExistingForegroundTask(taskId)

// 后台任务完成后通知
markTaskNotified(taskId)
```

Claude Code 的自动后台化策略非常聪明：

```
命令开始执行
    │
    ├─ 0~2 秒: 前台显示输出
    │
    ├─ 2 秒后: 显示提示 "按 b 转入后台"
    │          用户可以选择继续看输出或转到后台
    │
    ├─ 2 分钟后: 自动转入后台
    │            （避免长命令阻塞整个会话）
    │
    └─ 完成时: 通知用户
              "后台任务 'npm install' 已完成 (12 秒)"
```

这个设计体现了一个重要原则：**默认不打扰用户，但始终可控**。用户可以随时查看后台任务的状态和输出。

### 任务输出管理

任务的输出可能很大（比如编译日志），需要妥善管理：

```typescript
// 输出管理策略
type OutputStrategy = {
  // 内存中保留最近的输出（用于 UI 显示）
  inMemoryBuffer: string     // 保留最后 1000 行
  
  // 完整输出持久化到磁盘（用于后续查看）
  diskPath: string           // ~/.claude/tasks/{taskId}/output.log
  
  // 流式输出（前台显示用）
  stream: ReadableStream     // 实时推送新输出
}
```

内存中只保留最近的输出片段，完整输出写入磁盘。这个设计在长时间运行的任务中尤其重要——你不希望一个持续输出日志的 `npm run dev` 把内存撑爆。

### 任务工具

Claude Code 提供了一组任务管理工具，让 Agent 可以通过工具调用来管理任务：

```typescript
// src/tools/ — 任务相关工具
TaskCreateTool  // 创建新任务
TaskListTool    // 列出所有任务
TaskGetTool     // 获取任务详情
TaskUpdateTool  // 更新任务状态
TaskStopTool    // 停止任务
TaskOutputTool  // 获取任务输出
```

Agent 可以用这些工具来管理并行工作流：

```
Claude: "我来并行处理这三个文件"
  ├─ TaskCreate: "格式化 file1.ts"
  ├─ TaskCreate: "格式化 file2.ts"  
  └─ TaskCreate: "格式化 file3.ts"
  │
  ▼ 等待完成
  TaskList → 检查所有任务状态
  TaskOutput → 获取每个任务的结果
```

### 任务取消与超时

长时间运行的任务需要可取消和超时机制。Claude Code 使用 `AbortController` 来实现这两个功能：

```typescript
// 使用 AbortController 实现可取消任务
async function runCancellableTask(command: string, timeout: number) {
  const controller = new AbortController()
  
  // 设置超时
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`任务超时 (${timeout}ms)`))
  }, timeout)
  
  try {
    const result = await exec(command, { signal: controller.signal })
    return result
  } finally {
    clearTimeout(timeoutId)
  }
}
```

`AbortController` 是 Web 标准 API，Node.js 也原生支持。它提供了一种统一的方式来取消异步操作，比手动管理进程 PID 更优雅可靠。

### 并发控制

无限制地创建并行任务会导致系统资源耗尽。Claude Code 使用信号量（Semaphore）模式限制并发数：

```typescript
class TaskSemaphore {
  private running = 0
  private queue: (() => void)[] = []
  
  constructor(private maxConcurrency: number) {}
  
  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrency) {
      this.running++
      return
    }
    // 超出并发限制，排队等待
    return new Promise(resolve => {
      this.queue.push(resolve)
    })
  }
  
  release() {
    this.running--
    const next = this.queue.shift()
    if (next) {
      this.running++
      next()
    }
  }
}

// 使用：最多同时运行 3 个任务
const semaphore = new TaskSemaphore(3)
```

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **Task** | 可管理的执行单元，具有完整的生命周期 | Shell 命令、子 Agent |
| **Foreground** | 前台任务，用户可以看到实时输出并中断 | 正在前台运行的 `npm install` |
| **Background** | 后台任务，静默运行直到完成后通知 | 自动后台化的长命令 |
| **Progress** | 进度追踪信息，包含当前值/总量/消息 | `[3/10] 编译模块...` |
| **TaskOutput** | 任务输出，内存缓存 + 磁盘持久化 | 编译日志、测试结果 |
| **AbortController** | 异步操作取消机制，Web 标准 API | 任务超时自动取消 |
| **Semaphore** | 信号量，限制并发任务数量 | 最多同时 3 个任务 |

---

## 💻 代码示例

### 示例 1: 完整的任务管理器

```typescript
import { randomUUID } from 'crypto'

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

type Task = {
  id: string
  type: string
  status: TaskStatus
  output: string
  startTime: number
  endTime?: number
  progress?: { current: number; total: number; message: string }
}

class TaskManager {
  private tasks = new Map<string, Task>()
  private controllers = new Map<string, AbortController>()
  private maxConcurrent = 3
  private runningCount = 0
  private waitQueue: (() => void)[] = []
  
  create(type: string): string {
    const id = randomUUID()
    this.tasks.set(id, {
      id, type, status: 'pending',
      output: '', startTime: Date.now()
    })
    return id
  }
  
  async run(id: string, fn: (signal: AbortSignal) => Promise<string>) {
    // 并发控制：等待空闲位
    await this.waitForSlot()
    
    const task = this.tasks.get(id)!
    const controller = new AbortController()
    this.controllers.set(id, controller)
    
    task.status = 'running'
    try {
      task.output = await fn(controller.signal)
      task.status = 'completed'
    } catch (e) {
      if (controller.signal.aborted) {
        task.status = 'cancelled'
        task.output = '任务已取消'
      } else {
        task.status = 'failed'
        task.output = (e as Error).message
      }
    } finally {
      task.endTime = Date.now()
      this.controllers.delete(id)
      this.releaseSlot()
    }
  }
  
  stop(id: string) {
    const controller = this.controllers.get(id)
    if (controller) {
      controller.abort()
    }
  }
  
  updateProgress(id: string, current: number, total: number, message: string) {
    const task = this.tasks.get(id)
    if (task) {
      task.progress = { current, total, message }
    }
  }
  
  list(filter?: TaskStatus) {
    const tasks = Array.from(this.tasks.values())
    return filter ? tasks.filter(t => t.status === filter) : tasks
  }
  
  get(id: string) { return this.tasks.get(id) }
  
  private waitForSlot(): Promise<void> {
    if (this.runningCount < this.maxConcurrent) {
      this.runningCount++
      return Promise.resolve()
    }
    return new Promise(resolve => {
      this.waitQueue.push(() => { this.runningCount++; resolve() })
    })
  }
  
  private releaseSlot() {
    this.runningCount--
    const next = this.waitQueue.shift()
    if (next) next()
  }
}
```

### 示例 2: 任务进度条 UI（Ink 组件）

```tsx
import React from 'react'
import { Box, Text } from 'ink'

type TaskProgressProps = {
  tasks: Array<{
    id: string
    type: string
    status: string
    progress?: { current: number; total: number; message: string }
  }>
}

function TaskProgress({ tasks }: TaskProgressProps) {
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>任务列表</Text>
      {tasks.map(task => (
        <Box key={task.id} marginTop={1}>
          <StatusIcon status={task.status} />
          <Text> {task.type} </Text>
          {task.progress && (
            <Box>
              <ProgressBar 
                current={task.progress.current} 
                total={task.progress.total} 
              />
              <Text dimColor> {task.progress.message}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}

function StatusIcon({ status }: { status: string }) {
  const icons: Record<string, string> = {
    pending: '○',
    running: '◉',
    completed: '✓',
    failed: '✗',
    cancelled: '⊘',
  }
  const colors: Record<string, string> = {
    pending: 'gray',
    running: 'blue',
    completed: 'green',
    failed: 'red',
    cancelled: 'yellow',
  }
  return <Text color={colors[status]}>{icons[status] || '?'}</Text>
}

function ProgressBar({ current, total }: { current: number; total: number }) {
  const width = 20
  const filled = Math.round((current / total) * width)
  const empty = width - filled
  const percent = Math.round((current / total) * 100)
  return (
    <Text>
      [{'\u2588'.repeat(filled)}{'\u2591'.repeat(empty)}] {percent}%
    </Text>
  )
}
```

---

## ✏️ 动手练习

### 练习 1: 实现任务管理器 (⏱️ ~25 分钟)

实现上面的 TaskManager，添加以下功能：

**要求：**
- 支持 `create`、`run`、`stop`、`list`、`get` 操作
- 实现并发限制（最多 3 个任务同时运行）
- 支持任务超时（默认 5 分钟）
- 编写测试：创建 5 个任务，验证最多 3 个同时运行

### 练习 2: 进度显示 UI (⏱️ ~15 分钟)

用 Ink 实现任务进度条：`[████████░░] 80% — 正在编译...`

**要求：**
- 显示任务名称和状态图标
- 实时更新进度条
- 完成的任务显示绿色勾号，失败的显示红色叉号
- 支持多个任务同时显示

### 练习 3: 分析 LocalShellTask (⏱️ ~15 分钟)

阅读 `src/tasks/LocalShellTask/`，回答以下问题：
- 前台→后台的切换是如何触发的？
- 任务输出是如何持久化到磁盘的？
- 自动后台化的超时阈值是多少？

---

## 📖 扩展阅读

1. **Node.js Child Process API**
   - 🔗 https://nodejs.org/api/
   - 推荐：child_process 模块，理解子进程管理

2. **Ink 终端 UI 框架**
   - 🔗 https://github.com/vadimdemedes/ink
   - 推荐：了解如何在终端中构建动态 UI

3. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：了解 SDK 中的流式处理和并发控制

---

## 🤔 思考题

1. 任务失败时，Agent 应该自动重试还是报告给用户？什么情况下应该重试，什么情况下不该？
2. 如何限制并行任务数量？太多并行任务会导致什么问题？（提示：考虑 CPU、内存、API 限流）
3. 后台任务的输出应该存在哪里？内存 vs 磁盘？（提示：考虑输出大小和会话生命周期）
4. 如果一个任务依赖另一个任务的结果（如先 build 再 test），任务系统应该如何处理依赖关系？
5. 分布式场景下（多台机器上的 Agent 协作），任务状态如何同步？

---

## ➡️ 下一步

**明天：** [Day 18 — 状态管理](./day-18-state-management.md) — 学习 Agent 如何管理全局状态、会话恢复和状态持久化。

### 自检清单

- [ ] 我能说出 Claude Code 的 4 种任务类型
- [ ] 我理解前台/后台任务的区别和切换机制
- [ ] 我知道任务的 5 个状态和状态流转规则
- [ ] 我能解释为什么需要并发控制（信号量模式）
- [ ] 我能实现一个基本的 TaskManager 类

[← 上一天: MCP 集成](./day-16-mcp-integration.md) | [课程首页](../README.md) | [下一天: 状态管理 →](./day-18-state-management.md)
