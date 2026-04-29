# MinAgent

A production-grade AI agent CLI built with **Bun**, **React 19**, and **Ink 7**. Universal model support, powerful tools, and a terminal-native UX that rivals proprietary solutions.

> 一个基于 **Bun**、**React 19** 和 **Ink 7** 构建的生产级 AI Agent CLI。支持任何大模型、拥有丰富的工具集、以及媲美商业产品的终端原生体验。

---

## Features / 特性

- **Universal Model Support / 通用模型支持**  
  Works with **any** OpenAI-compatible API endpoint: OpenAI, Anthropic, Gemini, Azure, DeepSeek, Ollama, vLLM, and more. No hardcoded defaults — you control the provider.  
  兼容 **任何** OpenAI-compatible API 端点：OpenAI、Anthropic、Gemini、Azure、DeepSeek、Ollama、vLLM 等。无硬编码默认模型，完全由用户配置。

- **21 Built-in Tools / 21 个内置工具**  
  File read/write/edit, grep, glob, tree, bash execution, web fetch/search, sub-agents, code execution (Python/Node/Bash), todo tracking, and more.  
  文件读写编辑、代码搜索、文件查找、目录树、Shell 执行、网页抓取/搜索、子 Agent、代码执行（Python/Node/Bash）、待办追踪等。

- **Smart Permission System / 智能权限系统**  
  5 modes: `default`, `plan`, `acceptEdits`, `bypassPermissions`, `dontAsk`. Destructive tools require confirmation by default.  
  5 种模式：`default`、`plan`、`acceptEdits`、`bypassPermissions`、`dontAsk`。默认情况下破坏性操作需要确认。

- **Terminal-First UX / 终端原生体验**  
  Built with React + Ink for a rich terminal UI: streaming responses, tool call visualization, reasoning display, command autocomplete, input history, and plan mode batch approval.  
  基于 React + Ink 构建的丰富终端 UI：流式响应、工具调用可视化、推理过程显示、命令自动补全、输入历史、批量审批模式。

- **GitHub Integration / GitHub 集成**  
  Native commands for PRs, issues, branches, commits, and more via `gh` CLI.  
  通过 `gh` CLI 原生支持 PR、Issue、分支、提交等操作。

- **Session Management / 会话管理**  
  Persistent sessions, auto-compaction, context file management, `@mention` auto-loading, and cost tracking.  
  持久化会话、自动压缩、上下文文件管理、`@mention` 自动加载、成本追踪。

- **Skills System / Skill 系统**  
  Dynamic skill loading: code-review, debug, refactor, test. Write your own in TypeScript.  
  动态加载 Skill：代码审查、调试、重构、测试。支持用 TypeScript 自定义。

- **Production-Ready / 生产就绪**  
  Zero TypeScript errors (strict mode), LLM error classification with smart retry, workspace auto-detection, and test framework auto-discovery.  
  TypeScript 严格模式零错误、LLM 错误分类与智能重试、工作区自动检测、测试框架自动发现。

---

## Quick Start / 快速开始

### 1. Install Bun / 安装 Bun

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. Clone & Install / 克隆并安装

```bash
git clone https://github.com/BruceL017/minagent.git
cd minagent
bun install
```

### 3. Configure / 配置

Set your API key and model via environment variables:  
通过环境变量配置 API Key 和模型：

```bash
export MINA_PROVIDER="generic"      # openai | anthropic | generic
export MINA_API_KEY="..."           # Your API key / 你的 API 密钥
export MINA_MODEL="..."             # Model name / 模型名称
export MINA_BASE_URL="..."          # Custom API endpoint / 自定义 API 端点
```

Or use persistent config (stored in `~/.minagent/config.json`):  
或使用持久化配置（存储在 `~/.minagent/config.json`）：

```bash
bun run src/main.tsx
/config MINA_PROVIDER generic
/config MINA_API_KEY ...
/config MINA_MODEL ...
/config MINA_BASE_URL ...
```

### 4. Run / 运行

```bash
bun run src/main.tsx
# or / 或
bun start
```

开发调试用热重载：
```bash
bun --hot run src/main.tsx
```

### 5. Permission Modes / 权限模式（可选）

```bash
export MINA_PERMISSION_MODE=default           # 默认：破坏性工具需确认
export MINA_PERMISSION_MODE=acceptEdits       # 自动接受文件编辑，bash 仍需确认
export MINA_PERMISSION_MODE=bypassPermissions # 跳过所有确认（危险）
export MINA_PERMISSION_MODE=dontAsk           # 从不询问（危险）
```

### 6. Common Commands / 常用命令速查

| 命令 | 作用 |
|------|------|
| `/quit` `/exit` | 退出并保存会话 |
| `/help` | 查看所有命令 |
| `/plan` | 进入批量审批模式 |
| `/act` | 退出 plan 模式 |
| `/clear` | 清空当前会话 |
| `/config KEY VALUE` | 修改配置 |
| `/permissions` | 查看当前权限模式 |
| `/skills` | 查看可用 skills |
| `/add <file>` | 添加文件到上下文 |
| `/changes` | 查看本次会话修改的文件 |

### 7. Exit / 退出

- 正常退出：输入 `/quit` 或 `/exit`
- 强制退出：按 `Ctrl + C`
- 进程卡死：另开终端执行 `pkill -f "bun run src/main.tsx"`

---

## Configuration / 配置项

| Variable | Description | Required |
|----------|-------------|----------|
| `MINA_API_KEY` | API key for your LLM provider | Yes |
| `MINA_MODEL` | Model name (e.g., `gpt-4o`, `claude-sonnet-4-6`, `llama3.1:8b`) | Yes |
| `MINA_PROVIDER` | Provider type: `generic` (default), `openai`, `anthropic` | No |
| `MINA_BASE_URL` | Custom API base URL | No |
| `MINA_CONTEXT_WINDOW` | Context window size (default: 128000) | No |
| `MINA_PERMISSION_MODE` | Permission mode: `default`, `plan`, `acceptEdits`, `bypassPermissions`, `dontAsk` | No |
| `MINA_REASONING` | Enable reasoning display (`true`/`false`) | No |
| `MINA_THEME` | UI theme | No |
| `MINA_TRUST_LOCAL_SKILLS` | Trust and load repo-local `./skills` modules (`true`/`false`, default `false`) | No |

---

## Commands / 命令

Type `/` followed by a command name. Use **Tab** for autocomplete.

输入 `/` + 命令名。按 **Tab** 自动补全。

### Git / 版本控制
`/status`, `/diff`, `/log`, `/commit`, `/branch`, `/checkout`, `/push`, `/pull`, `/merge`, `/rebase`, `/cherry-pick`, `/blame`, `/stash`, `/stash-pop`, `/stash-list`

### GitHub
`/pr`, `/pr-view`, `/pr-create`, `/issue`, `/issue-view`, `/repo`

### Session / 会话
`/clear`, `/compact`, `/resume`, `/tokens`, `/cost`, `/sessions`

### Context / 上下文
`/add <file>`, `/drop <file>`, `/context`

### System / 系统
`/doctor`, `/config`, `/env`, `/model`, `/permissions`, `/plan`, `/act`, `/skills`, `/theme`, `/help`, `/quit`

### Project / 项目
`/test [pattern]` — auto-detect and run tests / 自动检测并运行测试  
`/format` — auto-format code / 自动格式化代码  
`/changes` — show files changed this session / 显示本次会话修改的文件  
`/diff` — show detailed diff of session changes / 显示会话变更的详细 diff

---

## Architecture / 架构

```
src/
  main.tsx           # Entry point / 入口
  config.ts          # Configuration loader / 配置加载
  types.ts           # Shared types / 共享类型
  agent/
    index.ts         # Core agent loop / 核心 Agent 循环
    llm.ts           # LLM client (OpenAI + Anthropic + Generic) / LLM 客户端
    toolExecutor.ts  # Smart concurrent tool execution / 智能并发工具执行
  tools/             # 21 built-in tools / 21 个内置工具
  commands/          # 40+ slash commands / 40+ 个斜杠命令
  components/        # React + Ink UI / React + Ink UI 组件
  utils/             # Context, compaction, cost tracking, permissions / 工具库
  skills/            # Dynamic skill system / 动态 Skill 系统
  state/             # Session persistence / 会话持久化
```

---

## License / 许可证

MIT
