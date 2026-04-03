# Day 20: 多 Agent 系统 — Team 与 Swarm

[← 上一天: 成本与性能](./day-19-cost-and-performance.md) | [课程首页](../README.md) | [下一天: 终极项目 →](./day-21-capstone.md)

---

## 🎯 学习目标

1. 理解 Claude Code 的**多 Agent 架构**（Team/Swarm）
2. 掌握 **Agent 间通信**和协调机制
3. 了解 **Coordinator 模式**的设计思想
4. 学习**分布式 Agent 协作**中的隔离与同步
5. 能够设计一个**多 Agent 协作方案**

**难度:** 🔴 高级 | **预计时间:** 1 小时

---

## 📚 核心概念

### 为什么需要多 Agent？

单个 Agent 在处理大型任务时面临几个瓶颈：

1. **上下文窗口限制**：一个 Agent 的上下文窗口装不下整个大型项目的信息
2. **串行执行**：一个 Agent 只能按顺序处理任务，无法并行
3. **专业分工**：不同类型的任务（前端/后端/测试）可能需要不同的系统提示和工具集

多 Agent 系统通过**分工协作**解决这些问题——就像软件团队由不同角色的工程师组成。

```
单 Agent（全栈独干）:
  Agent → 分析需求 → 写前端 → 写后端 → 写测试 → 部署
  （串行，慢；上下文越来越大，质量下降）

多 Agent（团队协作）:
  Coordinator → 分析需求，分配任务
    ├─ 前端 Agent → 写 UI 组件
    ├─ 后端 Agent → 写 API 接口
    └─ 测试 Agent → 写测试用例
  （并行，快；每个 Agent 上下文小且专注）
```

### 从子 Agent 到 Team

Day 13 我们学习了子 Agent（1 对 1 关系）。Claude Code 的 Team/Swarm 系统更进一步——多个 Agent **平等协作**：

```
子 Agent 模式（Day 13）:
  主 Agent
    ├─ 子 Agent A
    └─ 子 Agent B
  （父子关系，子 Agent 报告给父 Agent）

Team 模式:
  Coordinator（协调者）
    ├─ Teammate 1（前端）
    ├─ Teammate 2（后端）
    └─ Teammate 3（测试）
  （各自独立工作，Coordinator 分配和汇总）

Swarm 模式:
  Agent 1 ←→ Agent 2
    ↕           ↕
  Agent 3 ←→ Agent 4
  （对等网络，互相通信）
```

三种模式的对比：

| 特性 | 子 Agent | Team | Swarm |
|------|---------|------|-------|
| 关系 | 父子（层级） | 协调者 + 成员 | 对等（平等） |
| 通信 | 父→子→父 | Coordinator 中转 | 任意 Agent 间直接通信 |
| 适用场景 | 简单子任务 | 明确分工的项目 | 复杂、动态的协作 |
| 复杂度 | 低 | 中 | 高 |
| 成本 | 低 | 中（N 个 Agent） | 高（N 个 Agent + 通信开销） |

### Team 创建

```typescript
// src/tools/TeamCreateTool/TeamCreateTool.ts
// Agent 可以创建 "团队"
const TeamCreateTool = buildTool({
  name: 'TeamCreate',
  description: '创建一组并行工作的 Teammate Agent',
  
  inputSchema: {
    type: 'object',
    properties: {
      teammates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string' },     // "前端开发者"
            prompt: { type: 'string' },    // 任务描述
            tools: { type: 'array' },      // 可用工具
          }
        }
      }
    }
  }
})
```

Team 模式的一个关键设计决策是**工具集隔离**：每个 Teammate 只能使用分配给它的工具。前端 Agent 不需要数据库查询工具，测试 Agent 不需要部署工具。这种隔离不仅提高了安全性，还减少了每个 Agent 的工具定义开销（更少的 Token 消耗）。

### Coordinator 模式

Coordinator（协调者）是 Team 模式的核心。它不直接编写代码，而是专注于任务分析、分配和结果汇总：

```typescript
// src/coordinator/coordinatorMode.ts
// Coordinator 是特殊的 Agent：不直接写代码，只分配和协调

// Coordinator 的 System Prompt 会包含：
// "你是一个协调者。你的工作是：
//  1. 分析任务，识别可并行的子任务
//  2. 将任务分配给合适的 Teammate
//  3. 监控进度，处理依赖关系
//  4. 汇总结果，检查一致性
//  不要自己写代码！"
```

Coordinator 的工作流程：

```
用户: "给这个项目添加用户认证功能"
    │
    ▼
Coordinator 分析任务:
    ├─ 子任务 1: 设计数据库 Schema（前置）
    ├─ 子任务 2: 实现 API 接口（依赖子任务 1）
    ├─ 子任务 3: 实现登录 UI（依赖子任务 1）
    └─ 子任务 4: 编写测试（依赖子任务 2、3）
    │
    ▼
Coordinator 调度执行:
    Phase 1: Teammate-DB → 设计 Schema
    Phase 2: Teammate-API → 实现接口 ┐ （并行）
             Teammate-UI  → 实现 UI  ┘
    Phase 3: Teammate-Test → 编写测试
    │
    ▼
Coordinator 汇总结果:
    "认证功能已完成。包含..."
```

注意 Coordinator 识别了子任务之间的**依赖关系**，并据此安排了执行阶段：可以并行的任务并行执行，有依赖的任务按顺序执行。

### Agent 间消息传递

```typescript
// src/tools/SendMessageTool/SendMessageTool.ts
// Agent 之间可以发送消息

const SendMessageTool = buildTool({
  name: 'SendMessage',
  description: '向另一个 Teammate 发送消息',
  
  inputSchema: {
    type: 'object',
    properties: {
      target: { type: 'string', description: '目标 Teammate ID' },
      message: { type: 'string', description: '消息内容' }
    }
  }
})
```

Agent 间通信有几种常见模式：

```
1. 请求-响应模式（最简单）:
   Agent A → SendMessage("完成了 API 接口") → Agent B
   Agent B → SendMessage("收到，开始集成") → Agent A

2. 广播模式:
   Coordinator → 广播("数据库 Schema 已更新") → 所有 Teammates

3. 事件驱动模式:
   Agent A 完成 → 触发事件 → 等待该事件的 Agent 自动开始

4. 共享状态模式:
   所有 Agents → 读写共享的状态存储 → 通过状态变化协调
```

Claude Code 主要使用请求-响应模式和事件驱动模式的组合。Coordinator 在分配任务后等待 Teammates 的完成消息，然后决定下一步。

### 权限同步

多 Agent 场景下，权限需要集中管理。如果每个 Agent 都独立弹出权限对话框，用户会被淹没在确认请求中：

```typescript
// src/utils/swarm/permissionSync.ts
// Swarm 工作者需要从 Leader 获取权限批准

// Worker Agent 需要执行危险操作时：
// 1. 发送权限请求给 Leader
// 2. Leader 弹出确认对话框（只有一个对话框！）
// 3. 用户确认/拒绝
// 4. 结果同步回 Worker
```

权限集中管理的设计：

```
权限请求流:
  Teammate-API: "我需要执行 npm install express"
      │
      ▼
  Coordinator（或 Leader）: 检查规则
      ├─ 在 allow 列表中 → 自动批准
      └─ 不在列表中 → 弹出用户确认
          │
          ▼
      用户: [y] 允许
          │
          ▼
  结果同步回 Teammate-API: 已批准
```

这样用户只需要与一个集中的权限管理点交互，而不是分别处理每个 Agent 的权限请求。

### Worktree 隔离

并行工作时，每个 Agent 在自己的 git worktree 中工作，避免文件冲突：

```typescript
// src/utils/worktree.ts
async function createAgentWorktree(agentId: string) {
  // 每个 Agent 有自己的工作目录副本
  // 避免多个 Agent 同时修改同一个文件
  await exec(`git worktree add .worktrees/${agentId}`)
}
```

Git worktree 是 git 的原生功能，它可以为同一个仓库创建多个工作目录。每个工作目录有自己的 HEAD 和工作区，但共享 git 历史：

```
项目根目录/
├── .git/                          # 共享的 git 仓库
├── src/                           # 主工作区
├── .worktrees/
│   ├── teammate-frontend/         # 前端 Agent 的工作区
│   │   ├── src/
│   │   └── ...
│   ├── teammate-backend/          # 后端 Agent 的工作区
│   │   ├── src/
│   │   └── ...
│   └── teammate-test/             # 测试 Agent 的工作区
│       ├── src/
│       └── ...
```

每个 Agent 可以自由修改文件而不影响其他 Agent。工作完成后，Coordinator 将各个 worktree 的修改合并回主分支（可能需要处理冲突）。

### 多 Agent 的成本考量

多 Agent 系统的成本不是简单的 N 倍关系：

```
成本分析:
  单 Agent:
    - 上下文会变得很大（所有任务的信息都在一个上下文中）
    - 后期每次调用的输入 token 很多
    - 但只有 1 个 Agent 在调用 API

  多 Agent (3 个 Teammate + 1 个 Coordinator):
    - 每个 Agent 的上下文小（只包含自己的任务信息）
    - 每次调用的输入 token 较少
    - 但有 4 个 Agent 在调用 API
    - 还有通信开销

  实际对比（大型任务）:
    单 Agent: 500K input tokens（上下文膨胀）
    多 Agent: 4 × 80K = 320K input tokens + 40K 通信开销 = 360K
    
    多 Agent 可能更省钱！（因为避免了上下文膨胀）
```

何时使用多 Agent 取决于**任务的可分解性**和**上下文膨胀程度**。如果任务天然可以分为独立的子任务，多 Agent 通常更高效。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **Team** | 有协调者的 Agent 组，成员分工明确 | Coordinator + 3 Teammates |
| **Swarm** | 对等 Agent 网络，Agent 间平等通信 | 4 个 Agent 互相通信 |
| **Coordinator** | 协调 Agent，负责任务分析、分配和汇总 | 不写代码，只管理 |
| **Teammate** | 团队成员 Agent，接受任务独立执行 | 前端 Agent、后端 Agent |
| **Worktree** | Git 工作树，每个 Agent 独立的文件工作区 | `.worktrees/teammate-api/` |
| **Leader** | 权限管理者，集中处理 Swarm 中的权限请求 | 权限请求都发给 Leader |
| **Task Dependency** | 任务依赖，子任务之间的前后关系 | 先设计 Schema 再写 API |
| **Permission Sync** | 权限同步，多 Agent 间共享权限决策 | Leader 批准后同步给 Worker |

---

## 💻 代码示例

### 示例 1: 多 Agent 协调器

```typescript
type TeamConfig = {
  role: string
  prompt: string
  tools: string[]
}

type SubTask = {
  id: string
  assignee: string     // Teammate 角色
  prompt: string
  dependencies: string[] // 依赖的其他子任务 ID
  status: 'pending' | 'running' | 'completed' | 'failed'
  result?: string
}

class Coordinator {
  private teammates = new Map<string, TeammateAgent>()
  private tasks: SubTask[] = []
  
  async delegateTask(task: string, teamConfig: TeamConfig[]) {
    // 1. 创建 Teammate Agents
    for (const config of teamConfig) {
      const agent = new TeammateAgent(config.role, config.tools)
      this.teammates.set(config.role, agent)
    }
    
    // 2. 分析任务，创建子任务和依赖关系
    this.tasks = await this.analyzeAndSplit(task)
    
    // 3. 按阶段执行（尊重依赖关系）
    while (this.tasks.some(t => t.status === 'pending')) {
      // 找出所有依赖已满足的待执行任务
      const readyTasks = this.tasks.filter(t => 
        t.status === 'pending' &&
        t.dependencies.every(depId => 
          this.tasks.find(d => d.id === depId)?.status === 'completed'
        )
      )
      
      if (readyTasks.length === 0) {
        throw new Error('任务死锁：存在循环依赖')
      }
      
      // 并行执行所有就绪任务
      const results = await Promise.allSettled(
        readyTasks.map(async (subTask) => {
          subTask.status = 'running'
          const teammate = this.teammates.get(subTask.assignee)!
          const result = await teammate.execute(subTask.prompt)
          subTask.status = 'completed'
          subTask.result = result
          return { task: subTask.id, result }
        })
      )
      
      // 处理失败的任务
      for (const result of results) {
        if (result.status === 'rejected') {
          const failedTask = readyTasks.find(t => t.status === 'running')
          if (failedTask) failedTask.status = 'failed'
        }
      }
    }
    
    // 4. 汇总结果
    return this.summarize(this.tasks)
  }
  
  private async analyzeAndSplit(task: string): Promise<SubTask[]> {
    // 使用 LLM 分析任务，生成子任务
    // 这里简化为手动定义
    return []
  }
  
  private summarize(tasks: SubTask[]): string {
    const completed = tasks.filter(t => t.status === 'completed')
    const failed = tasks.filter(t => t.status === 'failed')
    return [
      `完成: ${completed.length}/${tasks.length} 个子任务`,
      ...completed.map(t => `  ✓ ${t.assignee}: ${t.prompt}`),
      ...failed.map(t => `  ✗ ${t.assignee}: ${t.prompt}`),
    ].join('\n')
  }
}
```

### 示例 2: Agent 消息总线

```typescript
// 简单的 Agent 间消息传递系统
type AgentMessage = {
  from: string
  to: string
  content: string
  timestamp: number
  type: 'task' | 'result' | 'info' | 'error'
}

class MessageBus {
  private queues = new Map<string, AgentMessage[]>()
  private handlers = new Map<string, (msg: AgentMessage) => void>()
  
  // 注册 Agent
  register(agentId: string, handler: (msg: AgentMessage) => void) {
    this.queues.set(agentId, [])
    this.handlers.set(agentId, handler)
  }
  
  // 发送消息
  send(from: string, to: string, content: string, type: AgentMessage['type'] = 'info') {
    const message: AgentMessage = {
      from, to, content, timestamp: Date.now(), type
    }
    
    // 添加到目标队列
    const queue = this.queues.get(to)
    if (!queue) throw new Error(`Agent ${to} 未注册`)
    queue.push(message)
    
    // 通知目标 Agent
    const handler = this.handlers.get(to)
    if (handler) handler(message)
  }
  
  // 广播消息（发给所有 Agent）
  broadcast(from: string, content: string, type: AgentMessage['type'] = 'info') {
    for (const [agentId] of this.queues) {
      if (agentId !== from) {
        this.send(from, agentId, content, type)
      }
    }
  }
  
  // 获取未读消息
  getMessages(agentId: string): AgentMessage[] {
    const messages = this.queues.get(agentId) || []
    this.queues.set(agentId, [])  // 清空已读
    return messages
  }
}

// 使用示例
const bus = new MessageBus()
bus.register('coordinator', (msg) => {
  console.log(`Coordinator 收到来自 ${msg.from} 的消息: ${msg.content}`)
})
bus.register('frontend', (msg) => {
  console.log(`Frontend Agent 收到任务: ${msg.content}`)
})

bus.send('coordinator', 'frontend', '实现登录页面', 'task')
```

---

## ✏️ 动手练习

### 练习 1: 设计 Agent 团队 (⏱️ ~15 分钟)

为一个"网站开发"任务设计 Agent 团队。

**要求：**
- 定义至少 3 个 Teammate 角色（包含角色名、System Prompt 摘要、工具列表）
- 画出任务依赖图（哪些任务可以并行，哪些必须串行）
- 估算每个 Teammate 大概需要的上下文大小
- 与单 Agent 方案对比成本和时间

### 练习 2: 实现消息总线 (⏱️ ~25 分钟)

实现两个 Agent 之间的消息传递系统。

**要求：**
- 支持点对点消息和广播消息
- 每条消息有类型（task / result / info / error）
- 实现消息历史记录
- 支持等待特定消息（`await waitForMessage(from, type)`）

### 练习 3: 分析 Swarm 源码 (⏱️ ~15 分钟)

阅读 `src/utils/swarm/` 目录，回答以下问题：
- 权限同步的完整流程是什么？
- Worktree 是如何创建和清理的？
- Swarm 模式下 Agent 的工具集如何配置？

---

## 📖 扩展阅读

1. **MCP 协议（多 Agent 通信基础）**
   - 🔗 https://modelcontextprotocol.io/
   - 推荐：理解 Agent 间的标准通信协议

2. **Anthropic Tool Use 文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：理解工具调用在多 Agent 中的应用

3. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：多个 API 客户端实例的管理

---

## 🤔 思考题

1. Team 模式 vs Swarm 模式，什么时候用哪个？（提示：考虑任务的可预测性和动态性）
2. 多 Agent 系统的成本如何控制？N 个 Agent = N 倍成本吗？（提示：回顾上文的成本分析）
3. 如何处理 Agent 之间的"意见分歧"？如果前端 Agent 和后端 Agent 对 API 接口设计有不同想法怎么办？
4. Worktree 合并时发生冲突怎么处理？这与多人协作的 git 冲突有什么异同？
5. 如果一个 Teammate 卡住了（无限循环），Coordinator 应该如何检测和处理？

---

## ➡️ 下一步

**明天：** [Day 21 — 终极项目](./day-21-capstone.md) — 构建你自己的 AI Agent CLI 工具！用 21 天学到的一切。

### 自检清单

- [ ] 我能区分子 Agent、Team 和 Swarm 三种多 Agent 模式
- [ ] 我理解 Coordinator 的角色和工作流程
- [ ] 我知道 Worktree 隔离解决了什么问题
- [ ] 我理解多 Agent 场景下权限集中管理的重要性
- [ ] 我能分析多 Agent vs 单 Agent 的成本权衡

[← 上一天: 成本与性能](./day-19-cost-and-performance.md) | [课程首页](../README.md) | [下一天: 终极项目 →](./day-21-capstone.md)
