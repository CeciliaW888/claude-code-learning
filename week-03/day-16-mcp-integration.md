# Day 16: MCP 协议集成

[← 上一天: 权限系统](./day-15-permission-system.md) | [课程首页](../README.md) | [下一天: 任务系统 →](./day-17-task-system.md)

---

## 🎯 学习目标

1. 理解 **MCP（Model Context Protocol）**的核心概念和设计动机
2. 掌握 Claude Code 中 MCP **工具发现和执行**的机制
3. 了解 **MCP Server 连接管理**和生命周期
4. 学习如何为你的 Agent 集成 MCP
5. 理解 MCP 的**安全审批**流程

**难度:** 🔴 高级 | **预计时间:** 1 小时

---

## 📚 核心概念

### 什么是 MCP？

MCP（Model Context Protocol）是 Anthropic 推出的开放协议，让 AI Agent 可以连接**任何外部工具和数据源**。你可以把它理解为 AI 的 "USB 接口"——标准化的连接方式。

```
不用 MCP:
  Agent → 自己写 GitHub API 调用
  Agent → 自己写数据库查询
  Agent → 自己写 Slack 接口
  （每个都要自己实现）

用 MCP:
  Agent → MCP Client → MCP Server (GitHub)
                     → MCP Server (Database)
                     → MCP Server (Slack)
  （统一协议，即插即用）
```

### 为什么需要 MCP？

在 MCP 出现之前，每个 AI 应用都需要为每个外部服务编写专门的集成代码。这导致了 **M×N 问题**：M 个 Agent 连接 N 个服务，需要 M×N 个集成。MCP 将这个问题简化为 M+N：每个 Agent 只需要实现 MCP Client，每个服务只需要提供 MCP Server。

```
没有 MCP（M×N 集成）:
  Agent A ──┬── GitHub 集成
            ├── Slack 集成
            └── DB 集成
  Agent B ──┬── GitHub 集成（重复！）
            ├── Slack 集成（重复！）
            └── DB 集成（重复！）

有了 MCP（M+N 集成）:
  Agent A ── MCP Client ──┐
  Agent B ── MCP Client ──┤
                          ├── GitHub MCP Server
                          ├── Slack MCP Server
                          └── DB MCP Server
```

这和 USB 的故事非常类似：在 USB 出现之前，每种设备都有自己的接口标准（串口、并口、PS/2...）。USB 统一了接口，让设备和计算机之间的连接变得简单。

### MCP 协议架构

MCP 使用**客户端-服务器**架构，通过 JSON-RPC 2.0 协议通信：

```
┌─────────────┐         JSON-RPC 2.0        ┌─────────────┐
│  MCP Client │ ◄──────────────────────────► │  MCP Server │
│ (Agent 端)  │      stdio / HTTP SSE        │ (工具提供方) │
└─────────────┘                              └─────────────┘
     │                                            │
     │  请求: listTools()                         │
     │ ──────────────────────────────────────────► │
     │                                            │
     │  响应: [{ name: "search", ... }]           │
     │ ◄────────────────────────────────────────── │
     │                                            │
     │  请求: callTool("search", { q: "..." })    │
     │ ──────────────────────────────────────────► │
     │                                            │
     │  响应: { content: [...] }                  │
     │ ◄────────────────────────────────────────── │
```

通信的传输层（Transport）可以是 stdio（标准输入输出，用于本地进程）或 HTTP SSE（服务器发送事件，用于远程服务）。

### Claude Code 的 MCP 架构

```
src/services/mcp/
├── client.ts          # MCP 客户端管理
├── types.ts           # MCP 类型定义
├── officialRegistry.ts # 官方 MCP Server 注册表
├── vscodeSdkMcp.ts    # VS Code MCP 集成
└── ...
```

Claude Code 作为 MCP Client，在启动时读取配置、连接所有已配置的 MCP Server，然后将它们提供的工具注册到自己的 Tool 系统中。这个过程对用户是透明的——用户不需要知道某个工具是内置的还是通过 MCP 提供的。

### MCP Server 配置

在 `~/.claude/settings.json` 或项目的 `.claude/settings.json` 中：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxx"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/docs"]
    }
  }
}
```

每个 MCP Server 配置包含：
- **command**：启动 Server 的命令（通常是 `npx` 或 `node`）
- **args**：命令参数（包含 Server 的 npm 包名）
- **env**：传给 Server 进程的环境变量（如 API Token）

全局配置（`~/.claude/settings.json`）适用于所有项目；项目配置（`.claude/settings.json`）只在当前项目生效。项目配置会覆盖全局配置中同名的 Server。

### MCP 工具如何变成 Agent 工具

Claude Code 将 MCP Server 提供的工具**自动注册**到 Tool 系统：

```typescript
// src/services/mcp/client.ts — MCP 工具发现（简化）
async function getMcpToolsCommandsAndResources() {
  const mcpTools = []
  
  for (const [name, config] of Object.entries(mcpServers)) {
    // 1. 连接 MCP Server
    const client = await connectMcpServer(config)
    
    // 2. 获取 Server 提供的工具列表
    const tools = await client.listTools()
    
    // 3. 将 MCP 工具转换为 Agent Tool
    for (const tool of tools) {
      mcpTools.push(buildTool({
        name: `mcp_${name}_${tool.name}`,
        description: tool.description,
        inputSchema: tool.inputSchema,
        
        async call(input) {
          // 通过 MCP 协议调用远程工具
          return await client.callTool(tool.name, input)
        }
      }))
    }
  }
  
  return mcpTools
}
```

注意工具命名规则：`mcp_{serverName}_{toolName}`。这确保了不同 MCP Server 的工具不会名称冲突，同时让用户和 Agent 都能知道工具来源。

### MCP 的三种能力

| 能力 | 描述 | Claude Code 对应 | 用途示例 |
|------|------|-----------------|---------|
| **Tools** | 可调用的函数 | MCPTool | 创建 GitHub Issue、查询数据库 |
| **Resources** | 可读取的数据 | ReadMcpResourceTool / ListMcpResourcesTool | 读取文件内容、获取配置 |
| **Prompts** | 预定义的提示模板 | （部分支持） | 代码审查模板、Bug 报告模板 |

**Tools** 是最核心的能力——它让 Agent 可以通过 MCP Server 执行操作。每个 Tool 都有名称、描述和 JSON Schema 定义的输入参数。

**Resources** 提供只读数据访问。与 Tools 的区别是 Resources 不会产生副作用——它们只是读取信息。例如，一个数据库 MCP Server 可能提供 `query` Tool（执行修改），同时也提供 `schema://tables` Resource（只读取表结构）。

**Prompts** 是预定义的提示模板，帮助 Agent 以最佳方式使用 Server 的能力。例如，GitHub MCP Server 可能提供 "code-review" Prompt，包含代码审查的最佳实践指引。

### MCP 安全审批

新的 MCP Server 第一次连接时，Claude Code 会要求用户确认。这是因为 MCP Server 本质上是**可执行代码**——一个恶意的 MCP Server 可以：

- 读取你的文件系统
- 发送网络请求
- 执行任意命令

```
首次连接新的 MCP Server 时:

┌─ MCP Server 审批 ────────────────────────┐
│                                          │
│  新 MCP Server: @example/server-x        │
│  命令: npx -y @example/server-x          │
│                                          │
│  该 Server 将获得以下能力:                 │
│  • 提供工具供 Agent 调用                   │
│  • 访问环境变量中的凭证                    │
│                                          │
│  [y] 批准  [n] 拒绝  [i] 查看详情        │
└──────────────────────────────────────────┘
```

### MCP 连接生命周期

MCP Server 的生命周期管理对 Agent 的稳定性很重要：

```
启动阶段:
  读取配置 → 逐个启动 Server 进程 → 完成初始化握手 → 获取工具列表

运行阶段:
  Agent 调用工具 → Client 转发请求 → Server 处理 → 返回结果
  (如果 Server 崩溃 → 自动重连 → 重新获取工具列表)

关闭阶段:
  Agent 退出 → 发送关闭信号 → 等待 Server 清理 → 终止进程
```

Claude Code 实现了**自动重连**机制：如果 MCP Server 进程意外退出，Client 会尝试重新启动并连接。这保证了长时间运行的会话中，MCP 工具始终可用。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **MCP** | Model Context Protocol，AI 工具集成的标准协议 | 类似于 USB 的统一接口标准 |
| **MCP Server** | 工具提供方，实现 MCP 协议的服务端 | GitHub Server、数据库 Server |
| **MCP Client** | 工具消费方，调用 MCP Server 的客户端 | Claude Code 本身 |
| **Transport** | 传输层，MCP 通信使用的底层协议 | stdio（本地进程）/ HTTP SSE（远程） |
| **Resource** | MCP 只读资源，提供数据但不执行操作 | 文件列表、数据库表结构 |
| **JSON-RPC** | MCP 使用的远程过程调用协议格式 | `{"method": "tools/call", ...}` |
| **Tool Discovery** | 工具发现，Client 启动时获取 Server 的工具列表 | `client.listTools()` |

---

## 💻 代码示例

### 示例 1: 集成 MCP 到你的 Agent

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

// MCP Server 配置类型
type McpServerConfig = {
  command: string
  args: string[]
  env?: Record<string, string>
}

async function connectMcpServer(config: McpServerConfig) {
  // 创建 stdio 传输层（启动子进程）
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...process.env, ...config.env }
  })
  
  // 创建 MCP Client 并连接
  const client = new Client({ name: 'my-agent', version: '1.0.0' })
  await client.connect(transport)
  
  // 获取可用工具
  const { tools } = await client.listTools()
  console.log('MCP 工具:', tools.map(t => t.name))
  
  return { client, tools }
}

// 将 MCP 工具转换为你的 Agent 工具格式
function mcpToolToAgentTool(client: Client, serverName: string, mcpTool: any) {
  return {
    name: `mcp_${serverName}_${mcpTool.name}`,
    description: mcpTool.description,
    inputSchema: mcpTool.inputSchema,
    
    async execute(input: unknown): Promise<string> {
      const result = await client.callTool({
        name: mcpTool.name,
        arguments: input as Record<string, unknown>
      })
      // MCP 返回的是 content 数组
      return result.content
        .map((c: any) => c.type === 'text' ? c.text : JSON.stringify(c))
        .join('\n')
    }
  }
}
```

### 示例 2: MCP Server 管理器

```typescript
// 管理多个 MCP Server 的连接
class McpManager {
  private servers = new Map<string, {
    client: Client
    tools: any[]
    status: 'connected' | 'disconnected' | 'error'
  }>()
  
  async connectAll(configs: Record<string, McpServerConfig>) {
    const results = await Promise.allSettled(
      Object.entries(configs).map(async ([name, config]) => {
        try {
          const { client, tools } = await connectMcpServer(config)
          this.servers.set(name, { client, tools, status: 'connected' })
          return { name, toolCount: tools.length }
        } catch (error) {
          this.servers.set(name, { 
            client: null!, tools: [], status: 'error' 
          })
          throw error
        }
      })
    )
    
    // 报告连接结果
    for (const result of results) {
      if (result.status === 'fulfilled') {
        console.log(`✓ ${result.value.name}: ${result.value.toolCount} 个工具`)
      } else {
        console.log(`✗ 连接失败: ${result.reason}`)
      }
    }
  }
  
  getAllTools() {
    const allTools = []
    for (const [name, server] of this.servers) {
      if (server.status !== 'connected') continue
      for (const tool of server.tools) {
        allTools.push(mcpToolToAgentTool(server.client, name, tool))
      }
    }
    return allTools
  }
  
  async disconnectAll() {
    for (const [name, server] of this.servers) {
      if (server.status === 'connected') {
        await server.client.close()
      }
    }
    this.servers.clear()
  }
}
```

---

## ✏️ 动手练习

### 练习 1: 安装并测试 MCP Server (⏱️ ~20 分钟)

安装并测试 `@modelcontextprotocol/server-filesystem`，理解 MCP 的连接过程。

**步骤：**
1. 在 `~/.claude/settings.json` 中添加 filesystem MCP Server 配置
2. 指定一个安全的测试目录（如 `/tmp/mcp-test`）
3. 重启 Claude Code，验证 MCP 工具出现在工具列表中
4. 尝试通过 MCP 工具读取和列出文件

### 练习 2: MCP 工具注册转换 (⏱️ ~20 分钟)

实现将 MCP 工具自动注册为 Agent Tool 的转换逻辑。

**要求：**
- 读取 `settings.json` 中的 `mcpServers` 配置
- 连接每个 Server 并获取工具列表
- 使用 `mcp_{server}_{tool}` 命名规则转换工具
- 处理连接失败的情况（某个 Server 失败不影响其他 Server）

### 练习 3: 阅读 MCP 源码 (⏱️ ~15 分钟)

查看 `src/services/mcp/` 目录，重点关注以下问题：
- MCP Server 审批流程是怎么实现的？（`mcpServerApproval.tsx`）
- 连接失败时的重试策略是什么？
- 工具列表变化时如何动态更新？

---

## 📖 扩展阅读

1. **MCP 官方文档**
   - 🔗 https://modelcontextprotocol.io/
   - 推荐：理解协议设计和 Server 生态

2. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：了解 SDK 中的 MCP 集成方式

3. **Anthropic Tool Use 文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：理解工具调用如何与 MCP 工具配合

---

## 🤔 思考题

1. MCP 和传统 REST API 有什么区别？为什么 AI Agent 需要专门的协议？（提示：思考 Tool Discovery 和类型安全）
2. 如果 MCP Server 是恶意的，会有什么安全风险？怎么防范？（提示：回顾 Day 15 的权限系统）
3. MCP 的 stdio 传输方式有什么局限？什么时候该用 HTTP？（提示：考虑跨机器和长连接场景）
4. 如何设计一个 MCP Server 让它既安全又灵活？最小权限原则如何应用？
5. MCP 生态中有哪些有趣的 Server？它们如何扩展 Agent 的能力边界？

---

## ➡️ 下一步

**明天：** [Day 17 — 任务系统](./day-17-task-system.md) — 学习 Agent 如何管理长时间运行的操作和并行工作流。

### 自检清单

- [ ] 我能解释 MCP 解决了什么问题（M×N → M+N）
- [ ] 我理解 MCP 的客户端-服务器架构和通信流程
- [ ] 我知道如何在 settings.json 中配置 MCP Server
- [ ] 我能说出 MCP 的三种能力（Tools / Resources / Prompts）
- [ ] 我理解 MCP 工具如何自动注册到 Agent 的 Tool 系统

[← 上一天: 权限系统](./day-15-permission-system.md) | [课程首页](../README.md) | [下一天: 任务系统 →](./day-17-task-system.md)
