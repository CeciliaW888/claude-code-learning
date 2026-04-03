# 实战项目

## 项目列表

### Week 1: Mini Agent CLI
- **目标：** 构建一个简单的 CLI Agent 框架
- **包含：** CLI 入口、工具定义、模拟 Agent 循环、消息类型
- **代码：** 参见 [Day 07](../week-01/day-07-week1-review.md) 的项目部分

### Week 2: 功能完整的 Agent CLI
- **目标：** 添加真实 API 调用和核心工具
- **包含：** Anthropic API、BashTool、FileReadTool、流式输出、上下文管理
- **代码：** 参见 [Day 14](../week-02/day-14-week2-review.md) 的项目部分

### Week 3: My Agent CLI (终极项目)
- **目标：** 构建完整的 AI Agent CLI 工具
- **包含：** Ink UI、Agent 循环、3+ 工具、权限控制、成本追踪
- **代码：** 参见 [Day 21](../week-03/day-21-capstone.md) 的完整代码

## 快速开始

```bash
# 创建项目
mkdir my-agent-cli && cd my-agent-cli
npm init -y

# 安装依赖
npm install @anthropic-ai/sdk ink react commander
npm install -D typescript @types/react tsx

# 设置 API Key
export ANTHROPIC_API_KEY=your-key-here

# 运行
npx tsx src/index.tsx "你好，帮我看看当前目录"
```
