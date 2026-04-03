# Day 11: 上下文管理 — System Prompt 与 CLAUDE.md

[← 上一天: Agent 循环](./day-10-agent-loop.md) | [课程首页](../README.md) | [下一天: 上下文压缩 →](./day-12-context-compression.md)

---

## 🎯 学习目标

1. 理解 **System Prompt** 的组装过程
2. 掌握 **CLAUDE.md** 配置文件的加载机制
3. 了解**上下文窗口**管理策略
4. 学习**动态上下文注入**的设计
5. 能够为自己的 Agent 设计上下文管理系统

**难度:** 🟡 中级 | **预计时间:** 1 小时

---

## 📚 核心概念

### System Prompt 的重要性

System Prompt 是 Agent 行为的"基因"——它定义了 Agent 是谁、能做什么、应该遵守什么规则。一个好的 System Prompt 是 Agent 可靠运行的基础。

Claude Code 的 System Prompt 不是一个静态字符串——它是**动态组装**的，包含多个来源。每次对话开始时，Claude Code 都会根据当前环境重新构建 System Prompt：

```
System Prompt 组成：
├── 1. 基础角色定义（"你是 Claude，一个 AI 编程助手"）
├── 2. 工具列表（所有可用工具的描述和参数）
├── 3. 行为规则（安全规则、输出格式、编码规范）
├── 4. 项目上下文
│    ├── Git 状态（分支、最近 commit）
│    ├── 工作目录
│    └── 操作系统信息
├── 5. CLAUDE.md 内容（用户自定义指令）
├── 6. 记忆文件（~/.claude/memory）
└── 7. 动态注入（插件、MCP 工具描述）
```

### System Prompt 组装过程

组装 System Prompt 的过程可以理解为**模板填充**——有一个基础模板，然后根据运行时环境填入具体信息：

```typescript
// src/constants/prompts.ts — System Prompt 构建（简化）
export function getSystemPrompt(config) {
  return `
你是 Claude，一个由 Anthropic 开发的 AI 编程助手。
你在用户的终端中运行，可以使用以下工具：

${formatToolDescriptions(config.tools)}

## 行为规则
- 在执行破坏性操作前必须获得用户确认
- 不要输出文件的完整内容，除非被要求
- 优先使用精确编辑而不是重写整个文件
...

## 项目上下文
工作目录: ${config.cwd}
Git 分支: ${config.gitBranch}
最近 commit: ${config.recentCommits}

## 用户自定义指令 (CLAUDE.md)
${config.claudeMdContent}
  `
}
```

工具描述是 System Prompt 中最大的部分。每个工具的名称、描述、参数定义都会包含在内，让 Claude 知道有哪些工具可用，以及如何正确调用它们。

### CLAUDE.md — 用户定制层

CLAUDE.md 是 Claude Code 最独特的设计之一——它让用户用自然语言配置 Agent 的行为，无需修改代码。

Claude Code 会在多个位置搜索 CLAUDE.md 文件，形成层级配置：

```typescript
// src/utils/claudemd.ts — CLAUDE.md 搜索路径
export async function getClaudeMds() {
  const paths = [
    // 项目级：当前项目的指令
    join(projectRoot, 'CLAUDE.md'),
    join(projectRoot, '.claude/CLAUDE.md'),
    
    // 用户级：全局偏好
    join(homeDir, '.claude/CLAUDE.md'),
    
    // 父目录级：monorepo 支持
    ...getParentDirectoryClaudeMds(projectRoot),
  ]
  
  // 读取所有存在的文件，合并内容
  const contents = await Promise.all(
    paths.map(p => readFileSafe(p))
  )
  
  return contents.filter(Boolean).join('\n\n')
}
```

优先级：项目级 > 父目录级 > 用户级。这让你可以有全局偏好，同时每个项目有自己的规则。

**为什么是多层级设计？** 考虑这个场景：

```
~/.claude/CLAUDE.md (全局)
  → "我偏好 TypeScript，使用 2 空格缩进"

~/work/monorepo/CLAUDE.md (monorepo 级)
  → "这个项目使用 pnpm，测试用 vitest"

~/work/monorepo/packages/api/CLAUDE.md (子项目级)
  → "这是 Express API，路由在 routes/ 目录"
```

当你在 `packages/api/` 目录工作时，三个层级的配置都会生效。这类似于 Git 的配置层级（`--system` > `--global` > `--local`）。

### CLAUDE.md 中的权限配置

CLAUDE.md 不仅支持自然语言指令，还支持结构化的权限规则：

```markdown
# CLAUDE.md 示例

## 项目信息
这是一个 React + TypeScript 项目，使用 Vite 构建。
测试框架是 Vitest。

## 编码规范
- 使用函数式组件，不用 class 组件
- 状态管理用 Zustand
- 样式用 Tailwind CSS

## 权限规则
allow: npm test
allow: npm run build
allow: git status
allow: git diff *
deny: rm -rf *
deny: git push --force
```

`allow` 和 `deny` 行会被解析为 BashTool 的权限规则（Day 08 讨论过）。其余文本会原样注入 System Prompt，作为 Claude 的行为指导。

### 上下文窗口管理

Claude 的上下文窗口有大小限制（200K tokens）。System Prompt + 对话历史 + 工具定义，所有内容都要放在这个窗口里。因此，上下文窗口是一种宝贵的"不动产"——需要精心规划如何使用。

```
上下文窗口 (200K tokens) 的典型分配：
┌──────────────────────────────────────────┐
│ System Prompt + 工具定义     ~10K tokens  │  5%
├──────────────────────────────────────────┤
│ CLAUDE.md + 记忆            ~2K tokens   │  1%
├──────────────────────────────────────────┤
│                                          │
│ 对话历史 + 工具结果                       │
│ (随对话增长)              ~150K tokens    │  75%
│                                          │
├──────────────────────────────────────────┤
│ 输出预留空间               ~38K tokens    │  19%
└──────────────────────────────────────────┘
```

当对话历史接近上下文窗口限制时，需要进行**上下文压缩**（明天的主题）。

### 动态上下文注入

除了静态配置，Claude Code 还会在运行时动态注入上下文信息。这些信息会附加在消息中，让 Claude 了解最新状态：

```typescript
// 动态上下文示例
async function getSystemContext() {
  return {
    // Git 状态：让 Claude 知道当前在哪个分支
    gitBranch: await exec('git branch --show-current'),
    
    // 最近的 commit：帮助 Claude 理解项目变更历史
    recentCommits: await exec('git log --oneline -5'),
    
    // 工作目录文件结构：帮助 Claude 定位文件
    directoryTree: await exec('ls -la'),
    
    // 操作系统：影响命令语法（如 Windows vs Unix）
    platform: process.platform,
    
    // 当前时间
    currentDate: new Date().toISOString(),
  }
}
```

这些信息在每次对话开始时收集，不会在对话过程中更新（除非显式刷新）。这是一个性能权衡——实时更新会增加延迟和复杂性。

### 记忆系统

Claude Code 有一个记忆系统，可以跨会话保存信息。记忆不是对话历史——它是从对话中提取的**持久化知识**：

```typescript
// src/utils/memory/ — 记忆类型
const MEMORY_TYPE_VALUES = [
  'user_preference',    // 用户偏好："我喜欢用 4 空格缩进"
  'project_convention', // 项目规范："这个项目用 ESM 模块"
  'workflow_pattern',   // 工作流模式："提交前总是运行 lint"
  'lesson_learned',     // 经验教训："不要修改 config.legacy.ts"
]
```

记忆的生命周期：

```
1. Claude 在对话中发现重要信息
   → "用户说这个项目使用 PostgreSQL 而不是 MySQL"

2. Claude 调用记忆保存工具
   → { type: 'project_convention', content: '数据库用 PostgreSQL' }

3. 下次会话开始时，记忆被加载到 System Prompt
   → Claude 自动知道数据库选择

4. 过时的记忆可以被覆盖或删除
```

### System Prompt 的大小优化

System Prompt 越长，每次 API 调用消耗的 token 越多（token = 费用）。Claude Code 使用了几种优化策略：

1. **工具描述精简**：只传递工具名、描述和参数 schema，不传递实现细节
2. **条件包含**：如果项目不使用 Git，不包含 Git 相关的规则
3. **压缩格式**：使用简洁的文本格式而非 JSON
4. **缓存利用**：Anthropic 的 Prompt Caching 可以缓存 System Prompt，避免重复计费

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **System Prompt** | 告诉 Claude "你是谁"的指令 | 角色定义 + 规则 + 上下文 |
| **CLAUDE.md** | 用户自定义指令文件 | 项目偏好、编码规范、权限规则 |
| **Context Window** | 上下文窗口大小限制 | Claude 3.5 Sonnet: 200K tokens |
| **Memory** | 跨会话记忆 | 记住用户偏好和项目规范 |
| **Dynamic Injection** | 动态注入运行时上下文 | Git 状态、当前时间 |
| **Prompt Caching** | 缓存 System Prompt 减少费用 | Anthropic 的缓存机制 |
| **层级配置** | 多层 CLAUDE.md 合并 | 全局 > monorepo > 项目 |
| **Token Budget** | Token 预算分配 | System Prompt 占 5%，对话占 75% |

---

## 💻 代码示例

### 示例 1: 你的 Agent 的 System Prompt 构建

```typescript
function buildSystemPrompt(config: {
  tools: ToolDef[]
  cwd: string
  projectConfig?: string
}) {
  const toolDescriptions = config.tools.map(t => 
    `### ${t.name}\n${t.description}\n参数: ${JSON.stringify(t.inputSchema)}`
  ).join('\n\n')
  
  return `
你是一个 AI 编程助手。

## 可用工具
${toolDescriptions}

## 工作环境
- 当前目录: ${config.cwd}
- 时间: ${new Date().toISOString()}

## 规则
1. 执行文件修改前必须先读取文件
2. 使用精确编辑，不要重写整个文件
3. 危险命令需要用户确认

${config.projectConfig ? `## 项目配置\n${config.projectConfig}` : ''}
  `.trim()
}
```

### 示例 2: CLAUDE.md 加载器

```typescript
import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

async function loadClaudeMd(projectRoot: string): Promise<string> {
  const locations = [
    join(projectRoot, 'CLAUDE.md'),
    join(projectRoot, '.claude', 'CLAUDE.md'),
    join(homedir(), '.claude', 'CLAUDE.md'),
  ]
  
  const sections: string[] = []
  
  for (const path of locations) {
    try {
      const content = await readFile(path, 'utf8')
      sections.push(`<!-- 来源: ${path} -->\n${content}`)
    } catch {
      // 文件不存在，跳过
    }
  }
  
  return sections.join('\n\n---\n\n')
}

// 解析权限规则
function parsePermissionRules(claudeMd: string): PermissionRule[] {
  const rules: PermissionRule[] = []
  const lines = claudeMd.split('\n')
  
  for (const line of lines) {
    const allowMatch = line.match(/^allow:\s*(.+)$/)
    if (allowMatch) {
      rules.push({ type: 'allow', pattern: allowMatch[1].trim() })
    }
    
    const denyMatch = line.match(/^deny:\s*(.+)$/)
    if (denyMatch) {
      rules.push({ type: 'deny', pattern: denyMatch[1].trim() })
    }
  }
  
  return rules
}
```

### 示例 3: 简单的记忆系统

```typescript
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

interface Memory {
  type: 'user_preference' | 'project_convention' | 'lesson_learned'
  content: string
  createdAt: string
}

class MemoryStore {
  private memoryPath: string
  
  constructor() {
    this.memoryPath = join(homedir(), '.my-agent', 'memory.json')
  }
  
  async load(): Promise<Memory[]> {
    try {
      const data = await readFile(this.memoryPath, 'utf8')
      return JSON.parse(data)
    } catch {
      return []
    }
  }
  
  async save(memory: Memory): Promise<void> {
    const memories = await this.load()
    memories.push(memory)
    
    await mkdir(join(homedir(), '.my-agent'), { recursive: true })
    await writeFile(this.memoryPath, JSON.stringify(memories, null, 2))
  }
  
  async toPromptSection(): Promise<string> {
    const memories = await this.load()
    if (memories.length === 0) return ''
    
    return '## 已知信息\n' + memories
      .map(m => `- [${m.type}] ${m.content}`)
      .join('\n')
  }
}
```

---

## ✏️ 动手练习

### 练习 1: 写一个 CLAUDE.md (⏱️ ~10 分钟)

为你自己的项目写一个 CLAUDE.md，包含：
- 项目描述（一句话）
- 技术栈
- 编码规范（3-5 条）
- 权限规则（至少 2 条 allow，2 条 deny）

### 练习 2: System Prompt 优化 (⏱️ ~20 分钟)

写两个版本的 System Prompt：

- **精简版**（200 字）：只包含最核心的角色定义和规则
- **详细版**（2000 字）：包含所有规则、示例、边界情况

用相同的提问测试两个版本，比较 Claude 的回答质量。思考：在哪些场景下详细版更好？在哪些场景下精简版更好？

### 练习 3: 实现记忆加载 (⏱️ ~20 分钟)

基于示例 3，实现完整的记忆系统：
- 从 `~/.my-agent/memory.json` 加载记忆
- 将记忆注入到 System Prompt
- 添加一个 "保存记忆" 的工具，让 Agent 可以记住重要信息

---

## 📖 扩展阅读

1. **Anthropic 工具使用文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：理解工具描述如何影响 Agent 行为

2. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：查看 SDK 中 system prompt 的传递方式

3. **MCP 协议**
   - 🔗 https://modelcontextprotocol.io/
   - 推荐：了解 MCP 工具如何动态注入上下文

---

## 🤔 思考题

1. **理解：** System Prompt 越长越好吗？长 prompt 的代价是什么？（提示：token 费用、注意力分散、响应速度）
2. **应用：** CLAUDE.md 的多层级设计（项目级/用户级）有什么好处？能否想到一个需要三层配置的真实场景？
3. **思辨：** 记忆系统如何防止过时信息影响 Agent 行为？如果记忆中的信息和文件现状矛盾，Agent 应该相信哪个？
4. **设计：** 如果要给 CLAUDE.md 添加条件逻辑（如"如果是 Windows 则用 cmd，否则用 bash"），你会怎么设计语法？

---

## ➡️ 下一步

**明天：** [Day 12 — 上下文压缩](./day-12-context-compression.md) — 当对话太长时如何智能压缩。

### ✅ 自检清单

- [ ] 能列出 System Prompt 的所有组成部分
- [ ] 理解 CLAUDE.md 的搜索路径和优先级
- [ ] 能实现一个基本的 System Prompt 构建函数
- [ ] 了解记忆系统的工作原理
- [ ] 理解上下文窗口的 token 分配策略

[← 上一天: Agent 循环](./day-10-agent-loop.md) | [课程首页](../README.md) | [下一天: 上下文压缩 →](./day-12-context-compression.md)
