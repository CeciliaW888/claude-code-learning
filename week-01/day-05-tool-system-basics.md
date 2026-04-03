# Day 05: Tool 系统基础 — 注册、定义与执行

[← 上一天: REPL 与输入](./day-04-repl-and-input.md) | [课程首页](../README.md) | [下一天: 消息类型 →](./day-06-message-types.md)

---

## 🎯 学习目标

1. 掌握 `Tool.ts` 中的 **Tool 接口**完整定义
2. 理解 Tool 的**生命周期**：注册 → 校验 → 权限 → 执行 → 结果
3. 学习 `buildTool()` 工厂函数的设计模式
4. 实现一个自己的 Tool

**难度:** 🟡 中级 | **预计时间:** 1 小时（25 分钟阅读 + 35 分钟动手）

---

## 📚 核心概念

### Tool 接口 — 一切工具的基石

Claude Code 有 30+ 种工具，但它们都基于同一个接口。打开 `Tool.ts`，核心定义：

```typescript
// src/Tool.ts — ToolDef 核心字段
export type ToolDef = {
  // 基本信息
  name: string              // 工具名，如 "Bash"、"Read"
  description: string       // 给 Claude 的描述（决定 Claude 何时调用）
  inputSchema: ToolInputJSONSchema  // JSON Schema 定义参数
  
  // 执行
  call: (input, context: ToolUseContext) => Promise<ToolResultBlockParam>
  
  // 权限
  isReadOnly: () => boolean
  needsPermission?: (input) => Promise<PermissionResult>
  
  // UI 渲染
  renderToolUseMessage?: (input) => React.ReactNode
  renderToolResultMessage?: (result) => React.ReactNode
  
  // 验证
  validateInput?: (input) => ValidationResult
}
```

**关键洞察：** `description` 不是给人看的——它是给 Claude 看的。Claude 根据 description 决定什么时候调用哪个工具。写好 description 直接决定 Agent 的行为质量。

#### Tool 接口的设计哲学

为什么一个 Tool 需要这么多字段？每个字段都有明确的职责：

- `name` + `description` + `inputSchema`：这三个字段被发送给 Claude API，Claude 根据它们决定何时调用、传什么参数
- `call`：实际执行逻辑，只在本地运行，Claude 看不到实现细节
- `isReadOnly` + `needsPermission`：安全层，决定是否需要用户确认
- `renderToolUseMessage` + `renderToolResultMessage`：UI 层，决定在终端中怎么显示
- `validateInput`：防御层，在执行前校验参数合法性

这种分离让每个关注点都可以独立变化。例如，修改 BashTool 的权限逻辑不会影响它的执行逻辑，修改它的 UI 渲染不会影响它的安全检查。

#### description 的写作技巧

一个好的 Tool description 应该告诉 Claude：
1. 这个工具**做什么**（一句话概括）
2. **什么时候**应该使用它（使用场景）
3. **不应该**在什么情况下使用（避免误用）

```typescript
// 差的 description
description: '执行命令'  // 太模糊，Claude 不知道什么时候该用

// 好的 description  
description: `Execute a bash command in the user's terminal.
Use this for running scripts, installing packages, or checking system state.
Prefer Read tool for simply viewing file contents.`
// 清晰说明了用途和边界
```

### buildTool() 工厂函数

Claude Code 不直接导出 ToolDef 对象，而是用 `buildTool()` 封装：

```typescript
// buildTool 将原始定义转换为完整的 Tool 对象
export function buildTool(def: ToolDef): Tool {
  return {
    ...def,
    // 添加默认行为
    isReadOnly: def.isReadOnly ?? (() => false),
    // 包装 call 函数：添加日志、计时、错误处理
    call: async (input, context) => {
      const startTime = Date.now()
      try {
        return await def.call(input, context)
      } catch (error) {
        // 统一错误处理
        return buildErrorResult(error)
      } finally {
        logToolDuration(def.name, Date.now() - startTime)
      }
    }
  }
}
```

### Tool 执行生命周期

```
Claude 决定调用工具
     │
     ▼
1. validateInput(input)      → 参数校验
     │
     ▼
2. needsPermission(input)    → 需要用户授权？
     │  ├─ 需要 → 显示权限对话框 → 用户确认/拒绝
     │  └─ 不需要 → 继续
     │
     ▼
3. renderToolUseMessage()    → UI 显示 "正在执行..."
     │
     ▼
4. call(input, context)      → 实际执行
     │
     ▼
5. renderToolResultMessage() → UI 显示结果
     │
     ▼
结果返回给 Claude → 决定下一步
```

### 权限系统 — 安全的核心

Tool 系统中最重要的设计之一是**权限控制**。不是所有工具都可以自由执行——有些操作（如运行 Shell 命令、写入文件）需要用户明确授权。

```typescript
// 权限检查的三种结果
type PermissionResult =
  | { allowed: true }                    // 允许执行
  | { allowed: false, reason: string }   // 拒绝并说明原因
  | { requiresApproval: true, message: string }  // 需要用户确认

// 示例：BashTool 的权限逻辑
needsPermission: async (input) => {
  const { command } = input
  // 安全命令（ls, cat, grep）不需要确认
  if (isSafeCommand(command)) return { allowed: true }
  // 危险命令（rm, sudo）需要用户确认
  return { requiresApproval: true, message: `执行命令: ${command}` }
}
```

Claude Code 的权限模式（Permission Mode）有多个级别：
- **默认模式**：每个危险操作都询问
- **宽松模式**：只询问高危操作（如删除文件）
- **自动模式**：不询问（用于 CI/CD 场景，需谨慎使用）

### 工具池组装

`tools.ts` 中的 `assembleToolPool()` 根据配置动态决定哪些工具可用：

```typescript
// src/tools.ts — 工具池组装（简化）
export function assembleToolPool(config) {
  const tools = [
    // 核心工具：永远可用
    BashTool,
    FileReadTool,
    FileEditTool,
    FileWriteTool,
    GlobTool,
    GrepTool,
    
    // 条件工具
    ...(config.webSearch ? [WebSearchTool] : []),
    ...(config.agentMode ? [AgentTool] : []),
    ...(config.taskMode ? [TaskCreateTool, TaskListTool] : []),
  ]
  
  // 过滤掉用户禁用的工具
  return tools.filter(t => !config.disabledTools.includes(t.name))
}
```

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **ToolDef** | 工具定义类型 | 包含 name、description、call 等 |
| **inputSchema** | 参数 JSON Schema | `{ type: 'object', properties: { command: { type: 'string' } } }` |
| **ToolUseContext** | 工具执行上下文 | 包含 cwd、权限模式、取消信号等 |
| **ToolResultBlockParam** | 工具返回值类型 | `{ type: 'tool_result', content: '...' }` |
| **buildTool** | 工具工厂函数 | 将 ToolDef 转为完整 Tool |
| **isReadOnly** | 是否只读操作 | `FileReadTool` 是只读，`BashTool` 不是 |

---

## 💻 代码示例

### 示例 1: 实际的 GrepTool 定义

```typescript
// src/tools/GrepTool/GrepTool.ts — 真实的 Claude Code 工具
export const GrepTool = buildTool({
  name: 'Grep',
  
  description: `Search for a pattern in files using ripgrep.
Results are returned with line numbers.
By default searches current directory recursively.`,
  
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'The regex pattern to search for'
      },
      path: {
        type: 'string',
        description: 'Directory or file to search in'
      },
      include: {
        type: 'string',
        description: 'File pattern to include (e.g., "*.ts")'
      }
    },
    required: ['pattern']
  },
  
  isReadOnly: () => true,  // 搜索是只读操作
  
  async call(input, context) {
    const { pattern, path, include } = input
    const result = await exec('rg', [
      '--line-number',
      pattern,
      path || '.',
      ...(include ? ['--glob', include] : [])
    ])
    return { type: 'tool_result', content: result.stdout }
  }
})
```

### 示例 2: 实现你自己的 Tool

```typescript
// 示例：一个翻译工具
const TranslateTool = buildTool({
  name: 'Translate',
  
  description: '将文本翻译成目标语言。用于需要翻译文档或消息时。',
  
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: '要翻译的文本' },
      targetLang: { type: 'string', description: '目标语言代码（zh/en/ja 等）' }
    },
    required: ['text', 'targetLang']
  },
  
  isReadOnly: () => true,
  
  async call(input) {
    // 调用翻译 API
    const translated = await translateAPI(input.text, input.targetLang)
    return {
      type: 'tool_result',
      content: `翻译结果：\n${translated}`
    }
  }
})
```

---

## ✏️ 动手练习

### 练习 1: 分析 Tool 描述 (⏱️ ~10 分钟)

打开 `src/tools/` 中的 5 个不同工具，比较它们的 `description`。思考：哪些描述写得好？为什么？

### 练习 2: 实现一个 Tool (⏱️ ~25 分钟)

实现一个 `WordCountTool`：
- name: "WordCount"
- 接收 `filePath` 参数
- 返回文件的行数、单词数、字符数
- 设置为 `isReadOnly: true`

### 练习 3: 工具链设计 (⏱️ ~15 分钟)

思考并设计：如果 Claude 要"统计项目中所有 TypeScript 文件的总行数"，它需要按什么顺序调用哪些工具？画出工具调用链。

提示：思考以下问题：
1. 先找文件还是先数行数？
2. 可以一次性完成还是需要多轮？
3. 哪些步骤可以并行？
4. 如果文件太多怎么办？

参考答案格式：
```
步骤 1: [工具名] → 目的: ...
步骤 2: [工具名] → 目的: ...
→ 最终结果: ...
```

---

## 📖 扩展阅读

1. **Anthropic Tool Use 文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：官方 Tool Use 设计理念，理解 Claude 如何选择和调用工具

2. **Anthropic TypeScript SDK — Tool 定义**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：了解 SDK 中 Tool 相关的类型定义

3. **MCP 协议 — 外部工具集成**
   - 🔗 https://modelcontextprotocol.io/
   - 推荐：理解 Claude Code 如何通过 MCP 集成第三方工具

4. **TypeScript 官方文档 — 类型系统**
   - 🔗 https://www.typescriptlang.org/docs/
   - 推荐：理解 ToolDef 类型定义中用到的高级类型特性

---

## 🤔 思考题

1. **理解：** 为什么 `description` 对 Agent 行为如此重要？一个模糊的 description 会导致什么问题？
2. **应用：** 如果你要给 Agent 添加"发送邮件"工具，`needsPermission` 应该怎么实现？
3. **思辨：** Claude Code 有 30+ 工具，但工具越多，Claude 选择正确工具的难度也越大。你怎么看这个权衡？

---

## ➡️ 下一步

**明天：** [Day 06 — 消息类型](./day-06-message-types.md) — 理解 Claude Code 中各种消息类型和对话流的设计。

**继续前请确认：**
- [ ] 我能写出一个 ToolDef 的完整定义
- [ ] 我理解 Tool 的生命周期
- [ ] 我知道 `description` 为什么重要
- [ ] 我实现了自己的第一个 Tool

[← 上一天: REPL 与输入](./day-04-repl-and-input.md) | [课程首页](../README.md) | [下一天: 消息类型 →](./day-06-message-types.md)
