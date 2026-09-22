# 可视化工作流查看与执行回放

> 说明：初始仓库只包含本任务描述，没有任何已有的工作流/前端代码。
> 因此这里实现的是与任务要求最接近的最小全栈集成：一个零外部运行时
> 依赖的 Node.js + TypeScript 工作流服务（内置 HTTP API），以及
> React + TypeScript（Vite）前端，图为自研轻量 SVG 分层 DAG 组件。

## 功能

- 工作流节点与依赖关系图（分层布局、箭头、点击查看依赖与状态）
- 校验：循环依赖（CYCLE）、缺失依赖（MISSING_DEPENDENCY）、重复节点；
  无效工作流禁止执行、禁止回放，页面明确展示错误
- 节点状态：`pending / running / success / failed`（失败时未开始的下游
  节点标记为 `skipped`，已完成节点保留状态）
- 历史执行记录选择，时间轴拖动 + 首帧/上一步/播放/下一步/末帧逐步回放
- 异常执行记录处理：
  - 事件顺序与拓扑顺序不一致 → `OUT_OF_ORDER_NODE_EVENT` 警告，仍按日志忠实回放
  - 部分节点无任何事件 → `MISSING_NODE_RECORDS` 警告，缺失节点保持 `pending`
  - 未知节点事件 → `UNKNOWN_NODE_EVENT` 警告
- 发起执行并以 500ms 轮询展示 running→success/failed，完成后自动进入回放
- 所有数据来自真实 HTTP API，无前端硬编码演示数据

## 目录

- `server/src/` — 类型、校验（`workflow.ts`）、执行引擎（`engine.ts`）、
  回放构造（`replay.ts`）、内存存储与种子数据（`store.ts`）、HTTP 服务（`app.ts`）
- `server/test/` — Node 内置测试框架回归用例（22 个）
- `web/src/` — React 页面、API 客户端、DAG 布局与 SVG 图组件、样式

## API

- `GET  /api/workflows`
- `GET  /api/workflows/:id`
- `GET  /api/workflows/:id/executions`
- `POST /api/workflows/:id/executions`（无效工作流返回 400）
- `GET  /api/executions` / `GET /api/executions/:id`
- `GET  /api/executions/:id/replay`（逐帧状态 + 校验/异常警告）

## 运行与验证

```bash
npm install
npm test           # 后端 22 个回归测试
npm run typecheck  # 前后端 tsc 类型检查
npm run build      # 编译后端 + 构建前端到 web/dist
PORT=4319 npm start
# 打开 http://localhost:4319 （服务同时托管 web/dist）
```

## 已知限制

- 数据存储为进程内内存（含种子工作流/历史记录），重启后恢复为种子状态，
  新发起的执行不持久化
- 执行引擎为波次调度的模拟器（`durationMs` / `fail`），没有真实任务队列、
  鉴权、暂停/恢复/取消接口；仓库原本不存在这些能力，未凭空新增
- 图组件仅支持 DAG 分层展示，不支持拖拽编辑
- 状态同步采用轮询（仓库原本无 WebSocket/SSE 基础）
