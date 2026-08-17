# Legacy Retirement 验收记录

> 日期：2026-08-17<br>
> 范围：Phase 0 干净基线<br>
> 历史锚点：`7f81522` (`origin/codex/pi-sre-core`)<br>
> 结果：PASS

## 删除范围

- `v2/`：41 个 tracked files。
- `eval/`：8 个 tracked files。
- `config/`：5 个 tracked files。
- `knowledge/`：2 个 tracked files。
- 旧 `scripts/`：47 个 tracked files，由单一 clean-start guard 替代。
- Docker、Makefile、nginx、MCP、本地开发、部署和旧活跃文档入口已退役。

## 验证

| 命令 | 结果 |
|---|---|
| `npm ci --ignore-scripts` | PASS |
| `npm run clean:start:verify` | PASS |

## 结论

当前工作树不存在可执行旧 runtime、兼容别名或旧部署入口。旧实现仍可从 Git 提交 `7f81522` 查阅；Phase 1 可以从唯一的 `agent/` 路线开始。
