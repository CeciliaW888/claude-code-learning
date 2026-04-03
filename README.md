# Claude Code 源码解析：21天构建 AI Agent CLI 工具

> 基于 Claude Code 源码，从零到一学会构建类似的 AI Agent CLI 工具

[![PWA Ready](https://img.shields.io/badge/PWA-Ready-c4825a)](https://CeciliaW888.github.io/claude-code-learning/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Days](https://img.shields.io/badge/课程-21天-blue.svg)](#课程大纲)

## 课程简介

这是一门基于 **Claude Code 真实源码**（516K 行 TypeScript）的深度解析课程。通过 21 天的系统学习，你将掌握构建一个类似 Claude Code 的 AI Agent CLI 工具所需的全部核心技能。

**不是抽象理论，是真实代码。** 每一天的代码示例都直接来自 Claude Code 源码。

## 学习目标

完成本课程后，你将能够：

- 理解 AI Agent CLI 工具的**完整架构**
- 使用 Ink（React for CLI）构建**终端 UI**
- 实现 Tool 系统：Bash、文件操作、Web 搜索等
- 构建 **Agent 循环**：感知 → 思考 → 行动
- 实现**上下文管理**和对话压缩
- 设计**多 Agent 协作**和子 Agent 系统
- 理解**安全模型**：权限控制、沙盒、命令审计
- 构建自己的 AI Agent CLI 工具原型

## 适合谁

- 有一定 Claude/ChatGPT 使用经验
- 对 TypeScript/JavaScript 有基础了解
- 每天能投入 **1 小时**学习
- 想构建类似的 AI Agent 工具

## 课程大纲

### 第一周：基础篇

| 天 | 主题 | 关键文件 |
|----|------|---------|
| [Day 01](./week-01/day-01-architecture-overview.md) | 架构总览：从 `claude` 命令到完整系统 | `main.tsx`, `package.json` |
| [Day 02](./week-01/day-02-entry-and-bootstrap.md) | 入口与启动：CLI 解析与状态初始化 | `cli.tsx`, `bootstrap/state.ts` |
| [Day 03](./week-01/day-03-ink-terminal-ui.md) | 终端 UI：用 React 写命令行界面 | `ink/`, `components/App.tsx` |
| [Day 04](./week-01/day-04-repl-and-input.md) | REPL 循环与用户输入处理 | `screens/REPL.tsx`, `PromptInput/` |
| [Day 05](./week-01/day-05-tool-system-basics.md) | Tool 系统基础：注册、定义与执行 | `Tool.ts`, `tools.ts` |
| [Day 06](./week-01/day-06-message-types.md) | 消息类型与对话流 | `types/message.ts`, `utils/messages.ts` |
| [Day 07](./week-01/day-07-week1-review.md) | 第一周回顾 + 迷你项目 | 综合复习 |

### 第二周：实战篇

| 天 | 主题 | 关键文件 |
|----|------|---------|
| [Day 08](./week-02/day-08-bash-tool.md) | BashTool 深度解析 | `tools/BashTool/` |
| [Day 09](./week-02/day-09-file-tools.md) | 文件工具：读、写、编辑 | `FileReadTool/`, `FileWriteTool/`, `FileEditTool/` |
| [Day 10](./week-02/day-10-agent-loop.md) | Agent 循环：QueryEngine 与 query() | `QueryEngine.ts`, `query.ts` |
| [Day 11](./week-02/day-11-context-management.md) | 上下文管理：System Prompt 与 CLAUDE.md | `context.ts`, `constants/prompts.ts` |
| [Day 12](./week-02/day-12-context-compression.md) | 上下文压缩与紧凑化 | `services/compact/` |
| [Day 13](./week-02/day-13-agent-tool.md) | 子 Agent 工具：多 Agent 协作 | `tools/AgentTool/` |
| [Day 14](./week-02/day-14-week2-review.md) | 第二周回顾 + 项目实战 | 综合复习 |

### 第三周：进阶篇

| 天 | 主题 | 关键文件 |
|----|------|---------|
| [Day 15](./week-03/day-15-permission-system.md) | 权限系统与安全模型 | `permissions/`, `bashSecurity.ts` |
| [Day 16](./week-03/day-16-mcp-integration.md) | MCP 协议集成 | `services/mcp/` |
| [Day 17](./week-03/day-17-task-system.md) | 任务系统与后台执行 | `tasks/`, `Task.ts` |
| [Day 18](./week-03/day-18-state-management.md) | 状态管理与 AppState | `state/AppState.ts` |
| [Day 19](./week-03/day-19-cost-and-performance.md) | 成本追踪与性能优化 | `cost-tracker.ts`, `utils/` |
| [Day 20](./week-03/day-20-multi-agent.md) | 多 Agent 系统：Team 与 Swarm | `coordinator/`, `TeamCreateTool/` |
| [Day 21](./week-03/day-21-capstone.md) | 终极项目：构建你的 Agent CLI | 综合实战 |

## 快速开始

### 在线学习

访问 GitHub Pages 上的 PWA 课程网站（可安装到桌面/手机，支持离线）：

```
https://CeciliaW888.github.io/claude-code-learning/
```

### 本地学习

```bash
# 1. 克隆课程仓库
git clone https://github.com/CeciliaW888/claude-code-learning.git
cd claude-code-learning

# 2. 直接打开 Markdown 指南开始学习
# macOS/Linux:
open week-01/day-01-architecture-overview.md
# Windows:
start week-01/day-01-architecture-overview.md
```

### 本地构建 PWA 网站

如果你想在本地预览或修改课程网站：

```bash
# 进入 website 目录
cd website

# 运行构建脚本（需要 bash 环境，Windows 用户请在 Git Bash 中运行）
bash build.sh

# 构建脚本会将 _base.html + modules/*.html + _footer.html 拼装成 index.html
# 输出示例：✅ Built index.html — 21 modules assembled.

# 用浏览器打开预览
# macOS/Linux:
open index.html
# Windows (Git Bash):
start index.html
```

### 部署到 GitHub Pages

1. Fork 或克隆本仓库到你的 GitHub 账户
2. 进入仓库的 **Settings → Pages**
3. Source 选择 **GitHub Actions**
4. 仓库已包含 `.github/workflows/pages.yml`，推送到 `main` 分支即可自动部署
5. 部署完成后访问 `https://<你的用户名>.github.io/claude-code-learning/`

> **注意：** GitHub Actions 会将 `website/` 目录部署为站点根目录。如果你本地修改了 `modules/` 中的文件，需要先运行 `bash build.sh` 重新生成 `index.html`，然后提交推送。

### 安装为 PWA

1. 用 Chrome/Edge 打开课程网站
2. 点击地址栏右侧的"安装"图标，或页面底部的安装提示
3. 安装后可从桌面/主屏幕直接打开，支持离线访问

## 项目结构

```
claude-code-learning/
├── README.md                    # 本文件
├── LICENSE                      # MIT 许可证
├── .github/workflows/pages.yml  # GitHub Pages 自动部署
│
├── week-01/                     # 第一周：基础篇
│   ├── day-01-architecture-overview.md
│   ├── ...
│   ├── day-07-week1-review.md
│   └── quiz-01.json             # 周测验
├── week-02/                     # 第二周：实战篇
│   ├── day-08-bash-tool.md
│   ├── ...
│   ├── day-14-week2-review.md
│   └── quiz-02.json
├── week-03/                     # 第三周：进阶篇
│   ├── day-15-permission-system.md
│   ├── ...
│   ├── day-21-capstone.md
│   └── quiz-03.json
│
├── projects/                    # 实战项目说明
├── flashcards/                  # 闪卡复习数据
│   └── flashcards.json
├── diagrams/                    # Excalidraw 源文件
│   ├── agent-loop.excalidraw
│   └── architecture-overview.excalidraw
│
└── website/                     # PWA 课程网站
    ├── _base.html               # HTML 模板头部
    ├── _footer.html             # HTML 模板尾部
    ├── build.sh                 # 构建脚本（拼装 index.html）
    ├── styles.css               # 预构建样式
    ├── main.js                  # 预构建交互引擎
    ├── index.html               # 构建产物（由 build.sh 生成）
    ├── manifest.json            # PWA 清单
    ├── sw.js                    # Service Worker
    ├── offline.html             # 离线回退页
    ├── modules/                 # 每日课程 HTML 模块
    │   ├── 01-architecture-overview.html
    │   ├── ...
    │   └── 21-capstone.html
    ├── icons/                   # PWA 图标
    │   ├── icon-192.png
    │   ├── icon-512.png
    │   ├── icon-192-maskable.png
    │   ├── icon-512-maskable.png
    │   └── apple-touch-icon-180.png
    └── diagrams/                # 导出的 SVG 图表
        ├── agent-loop.svg
        └── architecture-overview.svg
```

## 参考资源

- [Ink — React for CLI](https://github.com/vadimdemedes/ink) — 终端 UI 框架
- [Anthropic API 文档](https://docs.anthropic.com/) — Claude API
- [Anthropic Tool Use](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) — 工具调用指南
- [MCP 协议](https://modelcontextprotocol.io/) — Model Context Protocol
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) — TypeScript SDK
- [Commander.js](https://github.com/tj/commander.js) — CLI 参数解析

## License

MIT — 详见 [LICENSE](./LICENSE) 文件。

课程基于 Claude Code 源码分析，仅供学习研究使用。
