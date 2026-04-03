# Day 14: 第二周回顾 + 项目实战

[← 上一天: 子 Agent](./day-13-agent-tool.md) | [课程首页](../README.md) | [下一天: 权限系统 →](../week-03/day-15-permission-system.md)

---

## 🎯 学习目标

1. 巩固第二周**核心概念**
2. 完成**中级项目**：带工具系统的 Agent CLI
3. 评估学习进度
4. 建立各模块之间的**关联认知**

**难度:** 🟡 中级 | **预计时间:** 1 小时（15 分钟复习 + 45 分钟项目）

---

## 📚 第二周知识图谱

本周我们深入了 Claude Code 的**执行层**——从工具实现到 Agent 循环，从上下文管理到子 Agent 协作。这些模块共同构成了 Claude Code 的核心运行时。

```
Day 08: BashTool
  └─ 命令解析 → 安全检查 → 权限 → 执行 → 截断
  └─ AST 安全分析、沙盒、默认拒绝原则

Day 09: 文件工具
  └─ Read / Write / Edit 三种模式
  └─ old_str/new_str 精确编辑
  └─ Diff 显示、文件状态缓存、乐观锁

Day 10: Agent 循环
  └─ QueryEngine.submitMessage()
  └─ query() while(true) 核心循环
  └─ 流式响应处理、中断恢复
  └─ 终止条件、错误重试

Day 11: 上下文管理
  └─ System Prompt 动态组装
  └─ CLAUDE.md 多级加载（项目 > 父目录 > 用户）
  └─ 记忆系统、动态上下文注入

Day 12: 上下文压缩
  └─ Snip / MicroCompact / Full Compact
  └─ 自动触发（80% 阈值）、压缩边界
  └─ Token 预算管理、消息分组

Day 13: 子 Agent
  └─ Agent 调用 Agent（AgentTool）
  └─ 前台/后台执行
  └─ 并行处理、递归防护
  └─ 结果摘要
```

### 模块之间的关联

这些模块不是孤立的——它们形成了一个紧密协作的系统：

```
用户输入
  │
  ▼
QueryEngine (Day 10)
  ├─ 组装 System Prompt (Day 11)
  │    ├─ 加载 CLAUDE.md
  │    ├─ 注入工具描述
  │    └─ 添加动态上下文
  │
  ├─ 进入 query() 循环 (Day 10)
  │    ├─ 调用 Claude API
  │    ├─ 执行工具
  │    │    ├─ BashTool (Day 08)
  │    │    ├─ FileReadTool (Day 09)
  │    │    ├─ FileEditTool (Day 09)
  │    │    └─ AgentTool (Day 13) → 派生子循环
  │    │
  │    ├─ 检查上下文大小
  │    └─ 触发压缩 (Day 12)
  │
  └─ 返回最终结果
```

---

## 🔑 关键术语

| 术语 | 出自 | 核心要点 |
|------|------|---------|
| **AST 解析** | Day 08 | 用语法树分析命令安全性 |
| **old_str/new_str** | Day 09 | 精确文本匹配编辑 |
| **query() 循环** | Day 10 | while(true) 直到无工具调用 |
| **System Prompt** | Day 11 | 动态组装的 Agent 身份定义 |
| **CLAUDE.md** | Day 11 | 用户自定义 Agent 行为 |
| **Compact** | Day 12 | 对话历史压缩 |
| **AgentTool** | Day 13 | 子 Agent 派生 |

---

## 🏗️ 项目：功能完整的 Agent CLI

**在 Day 07 的基础上，添加：**

1. **真实的 Anthropic API 调用**（使用 API Key）
2. **BashTool + FileReadTool**（至少 2 个工具）
3. **流式输出**（实时显示回复）
4. **上下文管理**（token 估算 + 简单压缩）

### 核心代码框架

```typescript
// agent-cli/src/index.ts
import Anthropic from '@anthropic-ai/sdk'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import * as readline from 'readline'

const client = new Anthropic()

// 工具定义
const tools: Anthropic.Tool[] = [
  {
    name: 'bash',
    description: '执行 shell 命令并返回输出',
    input_schema: {
      type: 'object' as const,
      properties: { command: { type: 'string' } },
      required: ['command']
    }
  },
  {
    name: 'read_file',
    description: '读取文件内容，返回带行号的文本',
    input_schema: {
      type: 'object' as const,
      properties: { path: { type: 'string' } },
      required: ['path']
    }
  }
]

// 工具执行
function executeTool(name: string, input: any): string {
  switch (name) {
    case 'bash':
      try {
        return execSync(input.command, { encoding: 'utf8', timeout: 30000 })
      } catch (e: any) {
        return `错误: ${e.message}`
      }
    case 'read_file':
      try {
        const content = readFileSync(input.path, 'utf8')
        return content.split('\n')
          .map((line, i) => `${String(i + 1).padStart(4)} | ${line}`)
          .join('\n')
      } catch (e: any) {
        return `错误: ${e.message}`
      }
    default:
      return `未知工具: ${name}`
  }
}

// Token 估算
function estimateTokens(messages: any[]): number {
  return Math.ceil(JSON.stringify(messages).length / 3)
}

// 简单压缩
async function compressIfNeeded(messages: any[]) {
  if (estimateTokens(messages) > 80000) {
    const keepRecent = 4
    const old = messages.splice(0, messages.length - keepRecent)
    
    const summary = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: '用 3-5 句话摘要以下对话，保留关键操作和结果。',
      messages: [{ 
        role: 'user', 
        content: old.map(m => `[${m.role}]: ${JSON.stringify(m.content)}`).join('\n') 
      }]
    })
    
    const summaryText = summary.content[0].type === 'text' ? summary.content[0].text : ''
    messages.unshift({ 
      role: 'user', 
      content: `[对话摘要] ${summaryText}` 
    })
  }
}

// Agent 循环
async function agentLoop(prompt: string) {
  const messages: any[] = [{ role: 'user', content: prompt }]
  
  for (let turn = 0; turn < 15; turn++) {
    // 压缩检查
    await compressIfNeeded(messages)
    
    // 流式 API 调用
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: '你是一个 AI 编程助手。使用提供的工具完成任务。',
      tools,
      messages,
    })
    
    // 实时显示文字
    stream.on('text', (text) => {
      process.stdout.write(text)
    })
    
    const response = await stream.finalMessage()
    messages.push({ role: 'assistant', content: response.content })
    
    // 检查工具调用
    const toolUses = response.content.filter(b => b.type === 'tool_use')
    if (toolUses.length === 0) {
      console.log('\n')
      return
    }
    
    // 执行工具
    const results: any[] = []
    for (const tu of toolUses) {
      console.log(`\n[工具调用] ${tu.name}: ${JSON.stringify(tu.input)}`)
      const output = executeTool(tu.name, tu.input)
      console.log(`[结果] ${output.slice(0, 200)}...`)
      results.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: output.slice(0, 10000)  // 截断大输出
      })
    }
    
    messages.push({ role: 'user', content: results })
  }
  
  console.log('\n[达到最大循环次数]')
}

// 交互式 REPL
async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
  
  console.log('Agent CLI 已启动。输入你的请求（Ctrl+C 退出）\n')
  
  const prompt = (query: string) => new Promise<string>(
    resolve => rl.question(query, resolve)
  )
  
  while (true) {
    const input = await prompt('> ')
    if (!input.trim()) continue
    await agentLoop(input)
  }
}

main().catch(console.error)
```

### 项目扩展挑战

完成基础版后，尝试添加：

1. **FileEditTool**：添加 old_str/new_str 编辑工具
2. **命令安全检查**：拒绝 `rm -rf /` 等危险命令
3. **CLAUDE.md 加载**：读取当前目录的 CLAUDE.md 注入 System Prompt
4. **对话历史保存**：将对话保存到文件，下次可以继续

---

## 💻 代码示例

### 示例: 项目目录结构

```
agent-cli/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # 入口 + REPL
│   ├── agent.ts          # Agent 循环
│   ├── tools/
│   │   ├── bash.ts       # BashTool
│   │   ├── readFile.ts   # FileReadTool
│   │   └── editFile.ts   # FileEditTool (扩展挑战)
│   ├── context/
│   │   ├── systemPrompt.ts  # System Prompt 构建
│   │   └── compress.ts      # 上下文压缩
│   └── utils/
│       └── tokens.ts     # Token 估算
└── CLAUDE.md             # 项目配置
```

---

## ✏️ 动手练习

### 练习 1: 完成项目 (⏱️ ~45 分钟)

按照上面的代码框架，创建并运行你的 Agent CLI。

验证步骤：
1. `npm init -y && npm install @anthropic-ai/sdk typescript tsx`
2. 创建 `src/index.ts`
3. 运行 `npx tsx src/index.ts`
4. 测试：输入 "当前目录有哪些文件？"
5. 测试：输入 "读取 package.json 并总结"
6. 测试：输入 "创建一个 hello.txt 文件"（应该调用 bash 的 echo 命令）

### 练习 2: 添加安全检查 (⏱️ ~15 分钟)

为 BashTool 添加安全检查：
- 拒绝包含 `rm -rf` 的命令
- 拒绝包含 `sudo` 的命令
- 对其他命令显示确认提示

### 练习 3: 回顾笔记 (⏱️ ~10 分钟)

回顾本周笔记，用自己的话写一段 200 字的总结，解释 Claude Code 的核心架构。

---

## 📖 扩展阅读

1. **Anthropic TypeScript SDK**
   - 🔗 https://github.com/anthropics/anthropic-sdk-typescript
   - 推荐：项目中使用的 SDK，查看完整 API

2. **Anthropic 工具使用文档**
   - 🔗 https://docs.anthropic.com/en/docs/build-with-claude/tool-use
   - 推荐：工具定义和调用的完整规范

3. **Anthropic Streaming API**
   - 🔗 https://docs.anthropic.com/en/api/messages-streaming
   - 推荐：流式 API 的事件格式

---

## ✅ 自测清单

- [ ] 能解释 BashTool 的安全检查流程
- [ ] 能实现 old_str/new_str 的精确编辑
- [ ] 能写出 Agent 循环的核心代码
- [ ] 理解 System Prompt 的组装过程
- [ ] 能解释三种压缩策略的区别
- [ ] 理解子 Agent 的前台/后台模式
- [ ] 完成了 Agent CLI 项目（或至少运行了核心框架）

---

## 🤔 思考题

1. **对比：** 你的 Agent 项目和 Claude Code 还差什么？列出 5 个最重要的差距。
2. **规划：** 如果你要把这个 Agent 发布给其他人使用，首先要解决什么问题？（提示：安全性、易用性、文档）
3. **反思：** 回顾第一、二周，哪个概念对你影响最大？它改变了你对 AI 工具的什么认知？

---

## ➡️ 下一步

**下周预告：** 第三周进入高级主题——权限系统、MCP 集成、任务系统、多 Agent 架构、终极项目。

### 第三周学习路线

- **Day 15:** 权限系统 — 细粒度的工具权限控制
- **Day 16:** MCP 集成 — Model Context Protocol 扩展
- **Day 17:** 任务系统 — 后台任务和 Headless 模式
- **Day 18:** 多 Agent 架构 — 复杂的 Agent 编排
- **Day 19:** 高级调试 — 性能分析和问题排查
- **Day 20:** 终极项目 — 构建你自己的 Claude Code
- **Day 21:** 课程总结 — 回顾与展望

[← 上一天: 子 Agent](./day-13-agent-tool.md) | [课程首页](../README.md) | [下一天: 权限系统 →](../week-03/day-15-permission-system.md)
