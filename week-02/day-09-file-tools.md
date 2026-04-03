# Day 09: 文件工具 — 读、写、编辑

[← 上一天: BashTool](./day-08-bash-tool.md) | [课程首页](../README.md) | [下一天: Agent 循环 →](./day-10-agent-loop.md)

---

## 🎯 学习目标

1. 理解三种文件工具的**设计差异**和使用场景
2. 掌握 FileEditTool 的**精确编辑**机制
3. 了解**文件状态缓存**和编辑历史
4. 学习**差异显示 (Diff)** 的实现
5. 能够实现一个支持搜索替换的文件编辑工具

**难度:** 🟡 中级 | **预计时间:** 1 小时

---

## 📚 核心概念

### 三种文件工具概览

Claude Code 将文件操作分解为三个独立的工具，每个工具有明确的职责边界。这种设计遵循**单一职责原则**（Single Responsibility Principle）——每个工具只做一件事，做到最好。

```
FileReadTool — 只读，返回文件内容
  └─ 权限: 不需要确认（isReadOnly = true）
  └─ 特殊: 行号显示、大文件截断、编码检测
  └─ 类比: 相当于 cat/less 命令

FileWriteTool — 创建/覆盖整个文件
  └─ 权限: 需要确认（创建新文件或覆盖现有文件）
  └─ 特殊: 自动创建目录、编码保留
  └─ 类比: 相当于将完整内容写入文件

FileEditTool — 精确的搜索替换
  └─ 权限: 需要确认（修改文件内容）
  └─ 特殊: old_str/new_str 模式、diff 显示
  └─ 类比: 相当于编辑器的"查找替换"功能
```

为什么不合并成一个工具？因为**权限控制**。读取文件不需要确认，但修改文件需要。拆分后，Claude 可以自由读取项目中的任何文件来理解代码，只在需要修改时才请求用户确认。

### FileReadTool 详解

FileReadTool 看似简单，但有几个重要的设计考量：

**行号显示**：返回文件内容时附带行号，这让 Claude 能在对话中精确引用代码位置（"第 42 行有一个 bug"），也让用户容易定位问题。

```typescript
// FileReadTool 的输出格式
// 1 | import { readFile } from 'fs/promises'
// 2 | 
// 3 | export async function loadConfig(path: string) {
// 4 |   const content = await readFile(path, 'utf8')
// 5 |   return JSON.parse(content)
// 6 | }
```

**大文件处理**：如果文件超过一定大小（比如超过 2000 行），FileReadTool 不会返回全部内容。它支持 `offset` 和 `limit` 参数，让 Claude 可以分段读取：

```typescript
// 读取大文件的特定部分
FileReadTool.call({
  file_path: '/project/src/large-file.ts',
  offset: 100,    // 从第 100 行开始
  limit: 50       // 只读 50 行
})
```

**二进制文件检测**：FileReadTool 会检测文件是否为二进制文件（如图片、编译产物）。如果是二进制文件，它不会尝试以文本方式读取，而是返回文件类型信息。

### FileEditTool 的搜索替换设计

FileEditTool 不是基于行号编辑——它用**精确文本匹配**：

```typescript
// FileEditTool 的 inputSchema
{
  type: 'object',
  properties: {
    file_path: { type: 'string' },
    old_str: { type: 'string', description: '要替换的精确文本' },
    new_str: { type: 'string', description: '替换后的文本' }
  },
  required: ['file_path', 'old_str', 'new_str']
}
```

为什么用文本匹配而不是行号？因为**行号会变**。如果 Claude 先在第 10 行添加了代码，之后想编辑第 20 行的内容，行号可能已经偏移了。文本匹配更可靠。

**唯一性要求**是 FileEditTool 最重要的约束：`old_str` 必须在文件中唯一出现。如果匹配到多处，工具会报错，要求提供更多上下文以精确定位。这个设计避免了意外修改错误位置的问题。

```
场景：文件中有 3 处 "return null"

old_str: "return null"
→ 错误：找到 3 处匹配，请提供更精确的文本

old_str: "if (!user) {\n    return null\n  }"
→ 成功：唯一匹配
```

### FileWriteTool 与整文件操作

FileWriteTool 用于创建新文件或完全重写文件。与 FileEditTool 的关键区别：

- **FileEditTool**：修改文件的一部分，保留其余内容
- **FileWriteTool**：写入整个文件内容（覆盖原有内容）

Claude Code 的 System Prompt 中有明确指令：**优先使用 FileEditTool 而非 FileWriteTool**。因为精确编辑的 diff 更清晰，用户更容易审查。完全重写文件时，用户很难判断哪些内容被保留、哪些被修改了。

FileWriteTool 的一个贴心设计是**自动创建目录**——如果目标路径的父目录不存在，它会自动创建，相当于 `mkdir -p`。

### 文件状态缓存

Claude Code 维护一个文件状态缓存，记录每个文件的最后已知内容。这个缓存有两个用途：

1. **外部修改检测**：如果用户在 Claude 操作期间用其他编辑器修改了文件，缓存能检测到差异并提醒
2. **编辑验证**：确保 `old_str` 匹配的是文件的当前内容，而不是过时的版本

```typescript
// src/utils/fileStateCache.ts
type FileStateCache = Map<string, {
  content: string
  modifiedTime: number
  encoding: string
}>

// 用于检测外部修改
// 如果文件被 Claude 之外的程序修改，会提示用户
```

这种设计类似于数据库中的**乐观锁**（Optimistic Locking）——不加锁，但在写入时检查数据是否已被修改。

### Diff 显示

编辑后，Claude Code 会渲染漂亮的差异视图，使用 Ink 的 React 组件实现：

```typescript
// src/components/StructuredDiff.tsx
// 显示编辑前后的对比
// - 红色背景: 删除的行
// + 绿色背景: 添加的行
//   灰色: 未变化的上下文
```

Diff 显示不仅是视觉效果——它是安全机制的一部分。用户可以在确认前看到 Claude 将要做的修改，确保没有意外的更改。这与 `git diff` 在提交前审查更改的理念一致。

### 编码处理

文件编码是容易被忽略但非常重要的细节。不同操作系统和工具可能产生不同编码的文件：

- **UTF-8**：现代标准，大多数文件使用
- **UTF-16**：某些 Windows 工具生成
- **ASCII**：纯英文文件
- **行结束符**：Unix 用 `\n`，Windows 用 `\r\n`

Claude Code 在读取文件时检测编码，在写入时保留原始编码。这意味着编辑一个 `\r\n` 结尾的文件不会把它改成 `\n`——避免了不必要的差异出现在 `git diff` 中。

---

## 🔑 关键术语

| 术语 | 定义 | 示例 |
|------|------|------|
| **old_str/new_str** | 搜索替换模式 | `old_str: 'foo'`, `new_str: 'bar'` |
| **FileStateCache** | 文件状态缓存 | 记录文件内容和修改时间 |
| **StructuredDiff** | 结构化差异视图 | 红绿色对比显示修改 |
| **Encoding** | 文件编码格式 | UTF-8、UTF-16、ASCII |
| **Line Endings** | 行结束符 | `\n` (Unix) vs `\r\n` (Windows) |
| **Optimistic Locking** | 乐观锁，写入时检查冲突 | 检测文件是否被外部修改 |
| **Unique Match** | 唯一匹配要求 | old_str 必须在文件中只出现一次 |
| **Binary Detection** | 二进制文件检测 | 跳过图片、编译产物等非文本文件 |

---

## 💻 代码示例

### 示例 1: FileEditTool 核心逻辑

```typescript
// 简化的 FileEditTool
const FileEditTool = buildTool({
  name: 'Edit',
  description: '对文件进行精确的文本替换编辑。',
  
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      old_str: { type: 'string' },
      new_str: { type: 'string' }
    },
    required: ['file_path', 'old_str', 'new_str']
  },
  
  async call(input) {
    const { file_path, old_str, new_str } = input
    const content = await readFile(file_path, 'utf8')
    
    // 检查 old_str 是否存在
    if (!content.includes(old_str)) {
      return { type: 'tool_result', content: '错误: 未找到要替换的文本' }
    }
    
    // 检查 old_str 是否唯一
    const occurrences = content.split(old_str).length - 1
    if (occurrences > 1) {
      return { type: 'tool_result', content: `错误: 找到 ${occurrences} 处匹配，请提供更精确的文本` }
    }
    
    // 执行替换
    const newContent = content.replace(old_str, new_str)
    await writeFile(file_path, newContent)
    
    return { type: 'tool_result', content: '文件已更新' }
  }
})
```

### 示例 2: 带 Diff 显示的编辑

```typescript
// 生成可读的 diff 输出
function generateDiff(oldStr: string, newStr: string, context: number = 3): string {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  
  let diff = '--- 修改前\n+++ 修改后\n'
  for (const line of oldLines) {
    diff += `- ${line}\n`  // 删除的行
  }
  for (const line of newLines) {
    diff += `+ ${line}\n`  // 添加的行
  }
  return diff
}
```

### 示例 3: FileReadTool 带行号和范围支持

```typescript
// 完整的 FileReadTool 实现
const FileReadTool = buildTool({
  name: 'Read',
  description: '读取文件内容，支持行号显示和范围指定。',
  
  inputSchema: {
    type: 'object',
    properties: {
      file_path: { type: 'string', description: '文件绝对路径' },
      offset: { type: 'number', description: '起始行号（从 0 开始）' },
      limit: { type: 'number', description: '读取的行数' }
    },
    required: ['file_path']
  },
  
  isReadOnly: () => true,
  
  async call(input) {
    const { file_path, offset = 0, limit = 2000 } = input
    
    // 检测二进制文件
    if (await isBinaryFile(file_path)) {
      const stats = await stat(file_path)
      return { 
        type: 'tool_result', 
        content: `二进制文件 (${formatBytes(stats.size)})，无法以文本方式显示` 
      }
    }
    
    const content = await readFile(file_path, 'utf8')
    const lines = content.split('\n')
    
    // 应用范围限制
    const selectedLines = lines.slice(offset, offset + limit)
    
    // 添加行号
    const numbered = selectedLines.map((line, i) => 
      `${String(offset + i + 1).padStart(4)} | ${line}`
    ).join('\n')
    
    // 如果文件被截断，添加提示
    const truncated = lines.length > offset + limit
    const suffix = truncated 
      ? `\n[... 还有 ${lines.length - offset - limit} 行未显示 ...]` 
      : ''
    
    return { type: 'tool_result', content: numbered + suffix }
  }
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
```

---

## ✏️ 动手练习

### 练习 1: 实现 FileEditTool 完整版 (⏱️ ~20 分钟)

在示例 1 的基础上，添加以下功能：
- 乐观锁检测：编辑前比对文件修改时间
- 编码保留：检测原文件编码，用相同编码写入
- 生成 diff 输出：返回修改前后的差异

### 练习 2: 编辑冲突检测 (⏱️ ~20 分钟)

实现 "乐观锁" 编辑：编辑前检查文件是否被外部修改（对比修改时间），如果是则警告用户。

```typescript
// 提示：使用 fs.stat() 获取文件修改时间
const stats = await fs.stat(filePath)
const modifiedTime = stats.mtimeMs
```

### 练习 3: Diff 美化 (⏱️ ~15 分钟)

用 Ink 的 `<Text>` 组件渲染一个彩色 diff 视图：红色显示删除、绿色显示添加。如果不熟悉 Ink，可以用 ANSI 转义码实现终端彩色输出：

```typescript
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const RESET = '\x1b[0m'
console.log(`${RED}- 删除的行${RESET}`)
console.log(`${GREEN}+ 添加的行${RESET}`)
```

---

## 📖 扩展阅读

1. **Ink 框架 — 终端 React UI**
   - 🔗 https://github.com/vadimdemedes/ink
   - 推荐：了解 Claude Code 如何用 React 组件渲染 Diff 视图

2. **TypeScript 文档**
   - 🔗 https://www.typescriptlang.org/docs/
   - 推荐：文件操作相关的类型定义

3. **Node.js 文件系统 API**
   - 🔗 https://nodejs.org/api/
   - 推荐：`fs.readFile`、`fs.writeFile`、`fs.stat` 等核心 API

---

## 🤔 思考题

1. **理解：** 为什么 FileEditTool 要求 old_str 唯一匹配？如果允许多处替换会怎样？想象一个具体的出错场景。
2. **应用：** 如果文件很大（超过 100MB），FileReadTool 应该怎么处理？列出至少 3 种策略。
3. **思辨：** 文本搜索替换 vs 行号编辑 vs AST 编辑，各有什么优缺点？在什么场景下应该选择哪种方式？
4. **设计：** 如果要支持"撤销"功能（undo），文件工具的架构需要怎样修改？

---

## ➡️ 下一步

**明天：** [Day 10 — Agent 循环](./day-10-agent-loop.md) — 深入 QueryEngine 和 query() 主循环。

### ✅ 自检清单

- [ ] 能解释三种文件工具各自的职责和使用场景
- [ ] 理解为什么用文本匹配而不是行号编辑
- [ ] 能实现一个带唯一性检查的搜索替换功能
- [ ] 了解文件状态缓存和乐观锁的概念
- [ ] 理解编码保留的重要性

[← 上一天: BashTool](./day-08-bash-tool.md) | [课程首页](../README.md) | [下一天: Agent 循环 →](./day-10-agent-loop.md)
