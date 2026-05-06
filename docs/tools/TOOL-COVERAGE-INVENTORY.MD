# 工具覆盖清单

> ⚠️ **本文档中引用的 `v1/src/` 路径均属于历史实现快照；`v1/` 已于 2026-03-26 删除。** 当前工具实现请参考 `v2/src/` 与现行脚本/文档。

> 用途：把排障主链路需要的工具能力、当前接入状态和 playbook 对应关系集中列清，后续新增场景优先补数据，不再散落到核心执行代码里做特判。

## 目标原则

- 工具是证据获取手段，不是场景 hardcode 入口。
- 新增排障场景时，优先新增或调整 playbook 数据、工具绑定和验证材料，不优先改 `agent/plan.ts` 之类核心链路。
- 同一类证据优先复用现有工具，不为单 case 新造近似能力。

## 当前覆盖

| 证据域 | 代表工具 | 当前状态 | 主要用途 | 典型 playbook 绑定 |
| --- | --- | --- | --- | --- |
| 指标 / Trace / Log / 关联查询 | `query_metrics` `query_promql` `query_raw` `query_trace` `query_log` `query_relation_multi_resource` | 已接入 | 运行时事实验证、telemetry 关联、查询语句校验 | 监控误报、Trace/Log 排查、UnifyQuery 关联验证 |
| K8s 对象状态 | `k8s_management` | 已接入 | 集群、工作负载、Pod、命名空间对象读取 | 集群采集异常、ServiceMonitor / Pod 残留、服务状态核查 |
| 主机 / 进程 / 远程执行 | `ssh_remote_management` | 已接入 | 主机侧进程、日志、目录与脚本级检查 | 进程未 reload、主机链路验证、观测断点补证 |
| 知识 / Runbook / 历史案例 | `search_knowledge` | 已接入 | 规划路径、参数补全、历史误判提示 | 所有排障场景的 planning guidance |
| DataID / 元数据查询 | `get_dataid_info` 等 DataID 系列 | 已接入 | 元数据、链路、归属、Transfer 结构核对 | DataID 基本信息查询、链路异常类场景 |
| 通用管理 / 辅助 | Admin、角色/业务配置接口 | 已接入 | 权限、业务上下文、系统配置治理 | 工具接入、业务配置、权限排障 |

## 当前缺口边界

- 暂无独立“日志平台专用”工具分层，当前日志排障统一复用 UnifyQuery `query_raw / query_log`。
- 暂无独立“CMDB-only”工具层，当前资源关联统一收敛到 UnifyQuery relation。
- 若后续新增工具，必须先回答：
  - 覆盖哪类新证据域？
  - 对应哪些 playbook step？
  - 是否只是已有工具的参数模板问题？

## 与 Playbook 的衔接要求

- playbook step 优先使用 `toolBindings` 声明候选工具、参数模板和回退顺序。
- `request_evidence` 优先声明需要的最小材料，而不是把补材料逻辑写进代码分支。
- 若现有工具足以覆盖，只补 playbook 数据，不补核心执行特判。

## 历史代码锚点

> 下列路径仅用于定位历史设计来源；当前仓库已删除 `v1/`，实现应以 `v2/` 与现行脚本/文档为准。

- 工具注册：`v1/src/services/tools/builtin.ts`
- UnifyQuery 工具：`v1/src/services/tools/unify-query.ts`
- K8s 工具：`v1/src/services/tools/k8s-management.ts`
- Playbook 主数据：`v1/src/services/troubleshooting-playbooks.json`
- Playbook 编译：`v1/src/agent/troubleshooting-playbook-plan.ts`
