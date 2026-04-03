# Day 15: 权限系统与安全模型

[← 上一天: 第二周回顾](../week-02/day-14-week2-review.md) | [课程首页](../README.md) | [下一天: MCP 集成 →](./day-16-mcp-integration.md)

---

## 🎯 学习目标

1. 理解 Claude Code 的**多层安全模型**
2. 掌握**权限模式**的设计（Plan/Auto/Bypass）
3. 了解**工具级权限控制**和用户确认流程
4. 学习**命令安全审计**的实现
5. 能够为自己的 Agent 实现一套**基本权限系统**

**难度:** 🔴 高级 | **预计时间:** 1 小时

---

## 📚 核心概念

### 为什么 AI Agent 需要权限系统？

AI Agent 和传统软件最大的区别在于：Agent 的行为**不完全由开发者预先定义**。当你让 Claude Code 帮你"清理项目"，它可能会执行 `rm -rf node_modules`——这通常是安全的；但如果它误解了你的意思，执行 `rm -rf /`——这将是灾难性的。

权限系统的核心目标是在**自动化效率**和**安全可控**之间找到平衡：

```
太严格 ← ─────────────── → 太宽松
每步都确认                    完全自动
（效率极低）                 （风险极高）
     ↑                         ↑
  Plan Mode               Bypass Mode
           ↑
        Default/Auto Mode
       （平衡点）
```

一个好的权限系统应该让**安全的操作自动完成**，**危险的操作需要确认**，**禁止的操作直接拒绝**。

### 多层安全模型

Claude Code 的安全不是单一层面的——它是**多层防御**（Defense in Depth）。这个概念来自网络安全：即使某一层被突破，其他层仍然能提供保护。

```
Layer 1: 权限模式（全局）
  ├─ Plan Mode: 只规划不执行
  ├─ Auto Mode: 自动执行已允许的操作
  └─ Default: 每次都确认

Layer 2: 工具级权限
  ├─ isReadOnly: 只读工具免确认
  ├─ needsPermission: 逐工具判断
  └─ CLAUDE.md 规则: allow/deny 配置

Layer 3: 命令安全
  ├─ AST 解析: 检测危险命令结构
  ├─ 破坏性命令检测: rm, dd, mkfs
  └─ 网络安全: curl|sh, wget|bash

Layer 4: 沙盒隔离
  ├─ 文件系统限制
  └─ 网络访问控制
```

每一层都独立运作，形成纵深防御。例如即使用户配置了 `allow: Bash(*)` 跳过了 Layer 2 的确认，Layer 3 的命令安全检查仍然会拦截 `rm -rf /` 这样的危险命令。

### 权限模式详解

权限模式是最顶层的全局开关，决定了 Agent 的整体行为风格：

```typescript
// src/types/permissions.ts
export type PermissionMode = 
  | 'default'    // 默认：每次确认
  | 'plan'       // 规划模式：只看不做
  | 'auto'       // 自动模式：按规则执行
  | 'bypass'     // 绕过模式（危险！需要明确开启）
```

**Plan Mode（规划模式）**：Agent 只能使用只读工具（如 FileRead、Grep），不能执行任何写入操作。适合在不确定 Agent 会做什么时使用——先让它制定计划，你审核后再切换到其他模式执行。

**Default Mode（默认模式）**：每个非只读工具调用都需要用户确认。这是最安全的交互模式，但频繁的确认对话框会打断工作流。

**Auto Mode（自动模式）**：根据 CLAUDE.md 中的 allow/deny 规则自动决定。已明确允许的操作自动执行，未配置的操作仍然需要确认。这是日常使用的推荐模式。

**Bypass Mode（绕过模式）**：跳过所有权限检查。仅在受控环境（如 CI/CD 管道）中使用，日常开发中应避免。

### 权限请求流程

当 Agent 想要执行一个工具时，权限系统按照固定的优先级顺序进行检查：

```typescript
// 当工具需要权限时的流程
async function checkPermission(tool: Tool, input: unknown): Promise<boolean> {
  // 1. 只读工具直接通过
  if (tool.isReadOnly()) return true
  
  // 2. 检查 CLAUDE.md 的 allow/deny 规则
  const rule = matchPermissionRule(tool.name, input)
  if (rule === 'allow') return true
  if (rule === 'deny') return false
  
  // 3. 检查权限模式
  if (permissionMode === 'auto') {
    return checkAutoModeRules(tool, input)
  }
  
  // 4. 默认：弹出确认对话框
  return await askUserPermission({
    tool: tool.name,
    input,
    message: `允许执行 ${tool.name}？`
  })
}
```

这个流程的关键设计原则是：**deny 优先于 allow**。如果某个操作同时匹配了 allow 和 deny 规则，deny 总是赢。这是安全系统的常见设计——宁可误拒，不可误放。

### CLAUDE.md 中的权限规则

用户可以在项目的 `CLAUDE.md` 文件中配置权限规则，让 Agent 自动处理常见操作：

```markdown
# CLAUDE.md 权限配置示例

## 允许的操作
allow: Bash(npm run *)        # 允许所有 npm 脚本
allow: Bash(git status)       # 允许 git status
allow: Bash(git diff *)       # 允许 git diff
allow: FileEdit(src/**)       # 允许编辑 src 下的文件

## 禁止的操作
deny: Bash(rm -rf *)          # 禁止递归删除
deny: Bash(git push --force)  # 禁止强制推送
deny: FileEdit(.env*)         # 禁止编辑环境变量文件
```

规则匹配使用 glob 模式（`*` 匹配单段，`**` 匹配多段路径），这让配置既灵活又直观。

### 命令安全审计（AST 解析）

对于 BashTool，Claude Code 不仅仅检查命令字符串——它会**解析命令的抽象语法树（AST）**来检测危险结构。这比简单的字符串匹配更可靠：

```typescript
// 简单字符串匹配的问题
"rm -rf /"        // ✅ 能检测到
"r""m" -rf /      // ❌ 字符串拼接绕过
"$(echo rm) -rf /" // ❌ 命令替换绕过

// AST 解析的优势
// 将命令解析为语法树后，无论怎么变形，
// 最终执行的命令结构都会被识别
parseCommand("r""m" -rf /)
// → Command { name: "rm", args: ["-rf", "/"] }
// → 检测到危险模式！
```

常见的危险模式检测包括：

| 模式 | 风险 | 示例 |
|------|------|------|
| 递归删除 | 数据丢失 | `rm -rf /`, `rm -rf ~` |
| 磁盘写入 | 系统损坏 | `dd if=/dev/zero of=/dev/sda` |
| 管道执行 | 远程代码执行 | `curl url \| sh`, `wget url \| bash` |
| 权限修改 | 安全漏洞 | `chmod 777`, `chmod -R 777 /` |
| 系统格式化 | 数据丢失 | `mkfs`, `fdisk` |

### 权限 UI

权限确认对话框是用户与权限系统交互的窗口。好的 UI 设计需要在提供足够信息和不打扰用户之间取得平衡：

```tsx
// src/components/permissions/PermissionRequest.tsx
// 终端中的权限对话框
//
// ┌─ 权限请求 ───────────────────────────┐
// │                                      │
// │  Bash 工具想要执行:                    │
// │  > npm run build                     │
// │                                      │
// │  [y] 允许  [n] 拒绝  [a] 始终允许     │
// └──────────────────────────────────────┘
```

注意 `[a] 始终允许` 选项——它会将当前操作添加到 allow 规则中，以后遇到相同操作就不再询问。这是渐进式信任（Progressive Trust）的体现：用户从一次次手动确认中逐步建立对 Agent 的信任，最终形成一套适合自己工作流的自动化规则。

### 拒绝追踪

Claude Code 会追踪被拒绝的操作，避免重复请求。这不仅仅是用户体验优化——它还让 Agent 能从拒绝中学习，调整策略：

```typescript
// src/utils/permissions/denialTracking.ts
type DenialTrackingState = {
  deniedTools: Map<string, {
    count: number      // 被拒绝次数
    lastDenied: number // 最后拒绝时间
    inputs: string[]   // 被拒绝的输入
  }>
}

// Agent 可以查询拒绝记录，避免重复请求
function shouldRetryTool(toolName: string, input: string): boolean {
  const denial = state.deniedTools.get(toolName)
  if (!denial) return true
  
  // 同样的输入被拒绝过 → 不要再试
  if (denial.inputs.includes(input)) return false
  
  // 被拒绝超过 3 次 → 换个策略
  if (denial.count >= 3) return false
  
  return true
}
```

拒绝追踪信息会被注入到 Agent 的系统提示中，让 LLM 知道用户之前拒绝了什么，从而避免生成相同的工具调用请求。

### 沙盒隔离

沙盒是最后一道防线。即使所有其他层都被绕过，沙盒限制了 Agent 能访问的文件系统范围和网络资源：

```
沙盒边界
┌─────────────────────────────────┐
│  Agent 可访问:                   │
│  ├─ 项目目录 (cwd)              │
│  ├─ 临时目录 (/tmp)             │
│  └─ 用户配置 (~/.claude)        │
│                                 │
│  Agent 不可访问:                 │
│  ├─ 系统文件 (/etc, /usr)       │
│  ├─ 其他用户目录                 │
│  └─ 未授权的网络端点             │
└─────────────────────────────────┘
```

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **Permission Mode** | 全局权限模式，控制 Agent 整体行为风格 | default / plan / auto / bypass |
| **allow/deny** | CLAUDE.md 中的权限规则，使用 glob 模式匹配 | `allow: Bash(git *)` |
| **isReadOnly** | 只读标记，标识工具是否只进行读取操作 | FileRead、Grep 免确认 |
| **Denial Tracking** | 拒绝追踪，记录用户拒绝的操作以避免重复请求 | 同一命令被拒绝 3 次后不再请求 |
| **Sandbox** | 沙盒隔离，限制 Agent 的文件系统和网络访问范围 | 只能访问项目目录 |
| **Defense in Depth** | 纵深防御，多层独立安全机制叠加 | 4 层安全模型 |
| **Progressive Trust** | 渐进信任，从手动确认到自动允许的信任建立过程 | `[a] 始终允许` |
| **AST Parsing** | 抽象语法树解析，将命令解析为结构化数据进行安全检查 | 检测变形的危险命令 |

---

## 💻 代码示例

### 示例 1: 完整的权限系统

```typescript
// 一个简单但完整的权限系统实现
type PermissionRule = {
  pattern: string  // glob 模式
  action: 'allow' | 'deny'
}

class PermissionSystem {
  private mode: 'ask' | 'auto' | 'readonly' = 'ask'
  private rules: PermissionRule[] = []
  private denials = new Map<string, { count: number; inputs: string[] }>()
  
  constructor(mode: 'ask' | 'auto' | 'readonly', rules: PermissionRule[]) {
    this.mode = mode
    this.rules = rules
  }
  
  async check(toolName: string, input: unknown): Promise<boolean> {
    const inputStr = JSON.stringify(input)
    
    // readonly 模式：只允许只读操作
    if (this.mode === 'readonly') {
      return this.isReadOnlyTool(toolName)
    }
    
    // 检查 deny 规则（优先级最高）
    if (this.matchRules('deny', toolName, inputStr)) {
      return false
    }
    
    // 检查 allow 规则
    if (this.matchRules('allow', toolName, inputStr)) {
      return true
    }
    
    // auto 模式：已知安全的操作自动通过
    if (this.mode === 'auto') {
      return this.isKnownSafe(toolName, input)
    }
    
    // 检查拒绝记录
    const denial = this.denials.get(toolName)
    if (denial && denial.inputs.includes(inputStr)) {
      return false  // 之前被拒绝过，不再询问
    }
    
    // 默认：询问用户
    const allowed = await this.promptUser(toolName, input)
    if (!allowed) {
      this.trackDenial(toolName, inputStr)
    }
    return allowed
  }
  
  private matchRules(action: 'allow' | 'deny', tool: string, input: string): boolean {
    return this.rules
      .filter(r => r.action === action)
      .some(r => this.globMatch(r.pattern, `${tool}(${input})`))
  }
  
  private trackDenial(toolName: string, input: string) {
    const existing = this.denials.get(toolName) || { count: 0, inputs: [] }
    existing.count++
    existing.inputs.push(input)
    this.denials.set(toolName, existing)
  }
  
  private isReadOnlyTool(name: string): boolean {
    return ['FileRead', 'Grep', 'Glob', 'ListDir'].includes(name)
  }
  
  private isKnownSafe(tool: string, input: unknown): boolean {
    // 只读工具总是安全的
    if (this.isReadOnlyTool(tool)) return true
    // 其他情况需要额外规则判断
    return false
  }
  
  private globMatch(pattern: string, value: string): boolean {
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
    return new RegExp(`^${regex}$`).test(value)
  }
  
  private async promptUser(tool: string, input: unknown): Promise<boolean> {
    // 在实际实现中，这里会渲染一个 Ink 对话框
    console.log(`权限请求: ${tool}(${JSON.stringify(input)})`)
    console.log('[y] 允许  [n] 拒绝  [a] 始终允许')
    return true // 简化：默认允许
  }
}
```

### 示例 2: 命令安全检查器

```typescript
// 检测危险的 Shell 命令
const DANGEROUS_PATTERNS = [
  { pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)\s+\//, desc: '递归删除根目录' },
  { pattern: /rm\s+(-[a-zA-Z]*r[a-zA-Z]*f|--recursive)\s+~/, desc: '递归删除主目录' },
  { pattern: /dd\s+if=.*of=\/dev\//, desc: '磁盘直接写入' },
  { pattern: /mkfs/, desc: '格式化文件系统' },
  { pattern: /curl\s+.*\|\s*(sh|bash|zsh)/, desc: '远程代码执行' },
  { pattern: /wget\s+.*\|\s*(sh|bash|zsh)/, desc: '远程代码执行' },
  { pattern: /chmod\s+(-R\s+)?777/, desc: '过度开放权限' },
  { pattern: />(\/dev\/sda|\/dev\/nvme)/, desc: '覆盖磁盘设备' },
]

function checkCommandSafety(command: string): { safe: boolean; reason?: string } {
  for (const { pattern, desc } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return { safe: false, reason: `检测到危险操作: ${desc}` }
    }
  }
  return { safe: true }
}

// 使用示例
const result = checkCommandSafety('curl https://example.com/install.sh | bash')
// → { safe: false, reason: '检测到危险操作: 远程代码执行' }
```

---

## ✏️ 动手练习

### 练习 1: 实现权限配置加载 (⏱️ ~20 分钟)

实现从 `.agent/permissions.json` 加载 allow/deny 规则的功能。

**要求：**
- 定义 JSON 配置格式（包含 mode 和 rules 字段）
- 实现文件读取和解析
- 处理文件不存在的情况（使用默认配置）
- 验证配置格式的合法性

```typescript
// 参考配置格式
{
  "mode": "auto",
  "rules": [
    { "action": "allow", "pattern": "Bash(npm run *)" },
    { "action": "deny", "pattern": "Bash(rm -rf *)" }
  ]
}
```

### 练习 2: 命令安全检查 (⏱️ ~20 分钟)

实现一个函数，检测以下危险模式：`rm -rf /`, `curl|sh`, `dd if=`, `chmod 777`。

**要求：**
- 至少覆盖上述 4 种危险模式
- 返回危险等级（low / medium / high / critical）
- 提供人类可读的风险描述
- 编写至少 5 个测试用例验证功能

### 练习 3: 权限 UI 组件 (⏱️ ~15 分钟)

用 Ink 实现一个权限确认对话框。

**要求：**
- 显示工具名和参数摘要
- 支持 y（允许）、n（拒绝）、a（始终允许）三个选项
- 对危险操作用红色高亮显示
- 显示操作的简要风险评估

---

## 📖 扩展阅读

1. **Anthropic Tool Use 文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：理解工具调用的安全设计

2. **Node.js 安全最佳实践**
   - 🔗 https://nodejs.org/api/
   - 推荐：child_process 模块的安全使用

3. **Commander.js CLI 框架**
   - 🔗 https://github.com/tj/commander.js
   - 推荐：理解 CLI 参数解析和权限标志

---

## 🤔 思考题

1. "始终允许" 选项有什么安全隐患？如何缓解？（提示：考虑规则的作用域和过期时间）
2. 如何平衡安全性和用户体验？每次都确认很安全但很烦人。（提示：思考渐进信任模型）
3. 沙盒能防止所有安全问题吗？有什么局限？（提示：考虑信息泄露和侧信道）
4. 如果 Agent 被提示注入（Prompt Injection），权限系统能提供什么保护？

---

## ➡️ 下一步

**明天：** [Day 16 — MCP 集成](./day-16-mcp-integration.md) — 学习 AI Agent 如何通过标准协议连接外部工具和数据源。

### 自检清单

- [ ] 我能说出 Claude Code 的 4 层安全模型分别是什么
- [ ] 我理解 deny 优先于 allow 的设计原因
- [ ] 我能解释 Plan / Default / Auto / Bypass 模式的区别
- [ ] 我知道 AST 解析比字符串匹配更安全的原因
- [ ] 我能为自己的 Agent 实现基本的权限检查逻辑

[← 上一天: 第二周回顾](../week-02/day-14-week2-review.md) | [课程首页](../README.md) | [下一天: MCP 集成 →](./day-16-mcp-integration.md)
