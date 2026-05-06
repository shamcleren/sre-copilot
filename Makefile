# SRE Copilot - 远程打包与部署（仅支持远端 K8s，本地部署已取消）
# 使用: make [target]，默认 make 或 make help

ROOT := $(dir $(abspath $(lastword $(MAKEFILE_LIST))))
REMOTE_HOST := dev
REMOTE_PATH := /data/sre-copilot
NAMESPACE := sre-copilot
APP_NAME := sre-copilot-app

DEPLOY_SCRIPT := $(ROOT)scripts/deploy/deploy-remote.sh

.PHONY: help deploy deploy-sync deploy-yes deploy-fast sync build docker-build logs ssh status check local-start local-restart local-stop local-up-bg local-restart-bg local-db-reset verify-local verify-local-all verify-local-quick verify-local-smoke verify-local-tests verify-local-auth verify-local-fast verify-local-ci verify-local-smoke-fast verify-local-smoke-ci verify-local-auth-fast verify-local-auth-ci verify-local-browser verify-browser verify-online verify-copilot-diagnosis verify-prune verify-v2-core verify-v2-full verify-v2-regression verify-runtime-core verify-runtime-full verify-runtime-regression test-all-report test-all-report-fast test-all-report-ci test-no-llm test-embedding verify-m1-memory verify-m1-chatops-mcp verify-playbook-coverage verify-effect-tuning-gate benchmark-llm-cross gen-admin-token codex-deploy-local codex-status codex-health codex-test-no-llm codex-test-report codex-test-report-push codex-exec v2-readiness-status runtime-readiness-status v2-context-status runtime-context-status v2-seed-runtime-sample runtime-seed-sample workspace-prune workflow workflow-resume workflow-check workflow-verify workflow-refresh workflow-handoff

help:
	@echo "SRE Copilot - 远程打包与部署"
	@echo ""
	@echo "默认工作流：优先使用 V2 回归 / readiness / handoff，以及面向已运行服务实例的 verify-local / test-all-report。"
	@echo ""
	@echo "遗留本地服务维护（仅兼容/排障，不属于默认工作流）："
	@echo "  make local-start   # 兼容入口：转到 local-up-bg"
	@echo "  make local-restart # 兼容入口：转到 local-restart-bg"
	@echo "  make local-stop    # 仅停止本地 dev 实例（终止占用 3001 端口的进程）"
	@echo "  make local-up-bg   # 仅在明确需要维护本地 dev 实例时使用；会尝试启动 postgres 与本地服务"
	@echo "  make local-restart-bg # 仅在明确需要维护本地 dev 实例时使用；先停旧服务再启动"
	@echo "  make local-db-reset CONFIRM_RESET_DB=YES # 危险：显式确认后重置本地 postgres 数据卷"
	@echo ""
	@echo "测试与报告："
	@echo "  make verify-local [VERIFY_STAGE=all|quick|smoke|tests|auth|browser] [VERIFY_PROFILE=local-fast|ci] [BASE_URL=http://127.0.0.1:3001] [PORT=3001] [AUTH_TOKEN=<token>] [RUN_BROWSER_E2E=1] [RUN_V2_REGRESSION=0]"
	@echo "                    # 本地验收统一入口：输出服务实例准备说明，并对已运行的 BASE_URL 执行健康检查、离线回归（含 V2 harness）、脚本检查（含 ChatOps 设计/测试守门）并输出报告；不会自动执行 local-restart-bg；PORT 与 BASE_URL 协同用于 browser 阶段；默认自动执行 verify-prune（可用 VERIFY_AUTO_PRUNE=0 关闭）"
	@echo "  make verify-local-all    # 等价 VERIFY_STAGE=all（全量本地验收）"
	@echo "  make verify-local-quick  # 仅服务实例准备说明 + 健康检查（最快）"
	@echo "  make verify-local-smoke  # 冒烟验收（服务实例准备说明 + 健康 + 静态 + MCP本地）"
	@echo "  make verify-local-tests  # 仅离线回归（v2:test + V2 harness + ChatOps 守门）"
	@echo "  make verify-local-auth AUTH_TOKEN=<token> # 仅鉴权路径验收"
	@echo "  make verify-local-fast [VERIFY_STAGE=all|smoke|auth|tests|quick]"
	@echo "                    # 本地极速模式（默认 3s API 超时、跳过重路径）"
	@echo "  make verify-local-ci [VERIFY_STAGE=all|smoke|auth|tests|quick]"
	@echo "                    # CI 稳健模式（更宽超时、包含重路径）"
	@echo "  make verify-local-smoke-fast / make verify-local-smoke-ci"
	@echo "                    # 冒烟场景的一键 profile 入口"
	@echo "  make verify-local-auth-fast AUTH_TOKEN=<token> / make verify-local-auth-ci AUTH_TOKEN=<token>"
	@echo "                    # 鉴权场景的一键 profile 入口"
	@echo "  make verify-local-browser AUTH_TOKEN=<token> [VERIFY_PROFILE=ci|local-fast] [RUN_BROWSER_E2E=1] [PORT=3001] [BASE_URL=http://127.0.0.1:3001]"
	@echo "                    # 走统一 verify-local 报告模板，仅执行浏览器全链路回归阶段；PORT 与 BASE_URL 协同指定端口"
	@echo "  make verify-browser [AUTH_TOKEN=<token>] [BASE_URL=http://127.0.0.1:3001] [PORT=3001] [HEADLESS=1]"
	@echo "                    # 完整浏览器回归：MCP 删除 + ChatOps 读意图 + 失败追问上下文 + 待确认会话自动续接 + 控制台/网络断言；PORT 与 BASE_URL 协同用于本地回归；默认自动执行 verify-prune（可用 VERIFY_AUTO_PRUNE=0 关闭）"
	@echo "  make verify-online [AUTH_TOKEN=<token>] [REMOTE_HOST=dev] [REMOTE_PATH=/data/sre-copilot]"
	@echo "                    # 远端线上验收：集群内 health + token phase API + 专家排障入口 + effect-tuning 最小回放守门，并落盘 ONLINE-VERIFY 报告"
	@echo "  make verify-effect-tuning-gate AUTH_TOKEN=<token> [BASE_URL=http://127.0.0.1:3001]"
	@echo "                    # 执行 A/B/C/D/E 最小 effect-tuning 发布守门集，并将机读报告落到 eval/reports/"
	@echo "  make benchmark-llm-cross [AUTH_TOKEN=<token>] [REMOTE_HOST=dev] [REMOTE_PATH=/data/sre-copilot]"
	@echo "                    # 基于 eval/corpus.json 默认 case 运行 bk_ai / minimax 交叉 benchmark，并落盘 LLM-CROSS-BENCHMARK 报告"
	@echo "  make verify-copilot-diagnosis AUTH_TOKEN=<token> [BASE_URL=http://127.0.0.1:3001]"
	@echo "                    # 通过 /api/chat 验证“专家排障能力”对话入口（MCP/DB/503 三类场景）"
	@echo "  make verify-prune [DRY_RUN=1]"
	@echo "                    # 清理 docs/verification 超上限滚动产物；DRY_RUN=1 仅预览不删除"
	@echo "  make test-all-report AUTH_TOKEN=<token> [BASE_URL=http://127.0.0.1:3001]"
	@echo "                    # 针对已运行服务实例执行 scripts/test 全量脚本并输出报告文件"
	@echo "  make test-all-report-fast AUTH_TOKEN=<token>"
	@echo "                    # 全量报告（本地极速 profile，跳过重路径，单脚本超时保护）"
	@echo "  make test-all-report-ci AUTH_TOKEN=<token>"
	@echo "                    # 全量报告（CI profile，包含重路径，单脚本超时保护）"
	@echo "  make test-no-llm  # 兼容占位；请直接使用 npm run v2:test"
	@echo "  make verify-v2-regression"
	@echo "                    # 执行当前 V2 harness 回归入口：typecheck + runtime regression + smoke + replay"
	@echo "  make v2-readiness-status"
	@echo "                    # 基于 core gate 与最新 compare 观察结果生成当前 V2 readiness / 验收状态"
	@echo "  make workspace-prune [DRY_RUN=1|0] [CONFIRM_PRUNE=YES]"
	@echo "                    # 迁移旧 EFFECT-TUNING replay JSON 到 eval/reports，并清理根 logs/memory"
	@echo "  make test-embedding [EMBED_INPUT='监控告警处理流程'] [EMBED_MODEL=qwen3-embedding-8B]"
	@echo "                    # 兼容占位：当前暂不可用"
	@echo "  make verify-m1-memory [REPORT_FILE=docs/verification/M1-MEMORY-VERIFICATION-YYYYMMDD-HHMMSS.MD]"
	@echo "                    # 兼容占位：当前暂不可用"
	@echo "  make verify-m1-chatops-mcp AUTH_TOKEN=<token> [REPORT_FILE=docs/verification/M1-CHATOPS-MCP-E2E-YYYYMMDD-HHMMSS.MD]"
	@echo "                    # 兼容占位：当前暂不可用"
	@echo "  make verify-playbook-coverage [REPORT_FILE=docs/verification/PLAYBOOK-COVERAGE-VERIFY-YYYYMMDD-HHMMSS.MD]"
	@echo "                    # 兼容占位：当前暂不可用"
	@echo "  make gen-admin-token [BOOTSTRAP_TOKEN=<token>] [USER_ID=shamcleren]"
	@echo "                    # 为指定用户生成访问 token（默认 shamcleren）；未提供 bootstrap token 时自动写入 .env.secrets"
	@echo ""
	@echo "Codex 远程运维："
	@echo "  make codex-deploy-local   # 远程拉代码并触发 legacy local-restart-bg（仅维护远端既有 dev 实例）"
	@echo "  make codex-status         # 远程回传健康状态+进程+监听端口"
	@echo "  make codex-health         # 远程仅检查 /health"
	@echo "  make codex-test-no-llm    # 远程执行离线回归"
	@echo "  make codex-test-report [AUTH_TOKEN=<token>]"
	@echo "                            # 远程执行全量脚本并产出报告（未提供 AUTH_TOKEN 时自动兜底）"
	@echo "  make codex-test-report-push [AUTH_TOKEN=<token>] [REPORT_COMMIT_MSG='test: add full test run report']"
	@echo "                            # 远程生成报告后自动 commit/push，本地 git pull 可直接查看"
	@echo "  make codex-exec CMD='git status --short --branch'"
	@echo "                            # 远程执行任意命令"
	@echo ""
	@echo "部署（远端 K8s）："
	@echo "  make deploy        # 远端部署（git push 后远程拉取、构建、部署）"
	@echo "  make deploy-sync   # 使用 rsync 同步代码后远端构建并部署（不依赖 git push）"
	@echo "  make deploy-yes    # 同上，并跳过未提交更改确认"
	@echo "  make deploy-fast   # 等价 deploy --yes --sync，常用组合"
	@echo ""
	@echo "本地编译与同步："
	@echo "  make build         # 本地 TypeScript 编译 (nodejs)"
	@echo "  make sync         # 仅将代码 rsync 到远程（不构建不部署）"
	@echo "  make docker-build # 本地 Docker 构建（仅验证用）"
	@echo ""
	@echo "运维与调试："
	@echo "  make logs         # 打印查看远程日志的命令"
	@echo "  make ssh          # SSH 到部署机 (ssh dev)"
	@echo "  make status       # 打印查看远程 Pod/服务状态的命令"
	@echo "  make check       # 运行远端环境检查 (check-remote-env.sh)"
	@echo ""

# 远端全流程部署：git push -> 远程 pull -> 构建镜像 -> 推送到镜像仓库 -> K8s apply
deploy:
	@$(DEPLOY_SCRIPT)

# 使用 rsync 同步本地代码到远程后再部署（不依赖 git push，适合未提交或分支未推送）
deploy-sync:
	@$(DEPLOY_SCRIPT) --sync

# 跳过「未提交更改」确认后部署
deploy-yes:
	@$(DEPLOY_SCRIPT) --yes

# 常用组合：rsync 同步 + 跳过确认
deploy-fast:
	@$(DEPLOY_SCRIPT) --yes --sync

# 仅同步代码到远程（不构建、不部署）
sync:
	@rsync -avz --delete \
		--exclude='.git' \
		--exclude='node_modules' \
		--exclude='.env' \
		--exclude='.env.secrets' \
		--exclude='*.log' \
		$(ROOT) $(REMOTE_HOST):$(REMOTE_PATH)/
	@echo "✅ 代码已同步到 $(REMOTE_HOST):$(REMOTE_PATH)"

# 本地 TypeScript 编译（V2）
build:
	@cd $(ROOT) && ./node_modules/.bin/tsc --noEmit -p v2/tsconfig.json

# 本地 Docker 构建（使用根 Dockerfile）
docker-build:
	@cd $(ROOT) && docker build -t sre-copilot:local .

# 打印查看远程应用日志的命令
logs:
	@echo "查看远程应用日志："
	@echo "  ssh $(REMOTE_HOST) 'kubectl logs -f deployment/$(APP_NAME) -n $(NAMESPACE)'"
	@echo "最近 100 行："
	@echo "  ssh $(REMOTE_HOST) 'kubectl logs deployment/$(APP_NAME) -n $(NAMESPACE) --tail=100'"

# SSH 到部署机
ssh:
	@ssh $(REMOTE_HOST)

# 打印查看远程状态的命令
status:
	@echo "Pod 状态："
	@echo "  ssh $(REMOTE_HOST) 'kubectl get pods -n $(NAMESPACE)'"
	@echo "全部资源："
	@echo "  ssh $(REMOTE_HOST) 'kubectl get all -n $(NAMESPACE)'"
	@echo "回滚："
	@echo "  ssh $(REMOTE_HOST) 'kubectl rollout undo deployment/$(APP_NAME) -n $(NAMESPACE)'"

# 运行远端环境检查脚本
check:
	@$(ROOT)scripts/deploy/check-remote-env.sh

# ---------- 本地启动（统一非阻塞） ----------
# 统一入口：local-start -> local-up-bg，避免阻塞终端
local-start:
	@$(MAKE) --no-print-directory local-up-bg

# 统一入口：local-restart -> local-restart-bg，避免阻塞终端
local-restart:
	@$(MAKE) --no-print-directory local-restart-bg

# 仅停止本地服务（终止占用 3001 端口的进程）
local-stop:
	@echo "停止本地服务 (端口 3001)..."
	@PIDS=$$(lsof -tiTCP:3001 -sTCP:LISTEN 2>/dev/null || true); \
	if [ -n "$$PIDS" ]; then \
		echo "$$PIDS" | xargs kill -9 2>/dev/null || true; \
	fi; \
	if [ -f /tmp/sre-copilot-dev.pid ]; then \
		PID_FILE_VAL=$$(cat /tmp/sre-copilot-dev.pid 2>/dev/null || true); \
		if [ -n "$$PID_FILE_VAL" ]; then kill -9 "$$PID_FILE_VAL" 2>/dev/null || true; fi; \
		rm -f /tmp/sre-copilot-dev.pid; \
	fi
	@echo "已停止"

# 非阻塞后台启动本地服务（自动启动 postgres，若 3001 未监听则启动 npm run dev）
local-up-bg:
	@cd $(ROOT) && { \
		APP_PORT=$${PORT:-3001}; \
		echo "ℹ️ 数据库保护：local-up-bg/local-restart-bg 不会执行 docker compose down -v，不会清理 postgres 数据卷"; \
			if command -v docker >/dev/null 2>&1; then \
				if docker compose version >/dev/null 2>&1; then \
					docker compose --env-file ../.env.secrets up -d postgres >/dev/null 2>&1 || true; \
				elif command -v docker-compose >/dev/null 2>&1; then \
					docker-compose --env-file ../.env.secrets -f docker-compose.yml up -d postgres >/dev/null 2>&1 || true; \
				fi; \
				DB_WAIT_SEC=$${LOCAL_DB_WAIT_SEC:-15}; \
				echo "⏳ 等待 postgres healthy（最多 $${DB_WAIT_SEC}s）..."; \
				for i in $$(seq 1 "$$DB_WAIT_SEC"); do \
					if docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' sre-copilot-postgres 2>/dev/null | grep -q healthy; then \
						echo "✅ postgres healthy"; \
						break; \
					fi; \
					if [ $$((i % 3)) -eq 0 ]; then echo "   ... $$i s"; fi; \
					sleep 1; \
				done; \
				if ! docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' sre-copilot-postgres 2>/dev/null | grep -q healthy; then \
					echo "⚠️ postgres 未在 $${DB_WAIT_SEC}s 内进入 healthy，继续尝试启动应用（可通过 LOCAL_DB_WAIT_SEC 调整等待时长）"; \
				fi; \
			fi; \
			if ! lsof -ti:"$$APP_PORT" >/dev/null 2>&1; then \
				START_MODE="$${LOCAL_START_MODE:-dev}"; \
				if [ "$$START_MODE" = "prod" ]; then \
					START_CMD="npm run build && npm run start"; \
				else \
					START_CMD="npm run dev"; \
				fi; \
				PORT="$$APP_PORT" nohup /bin/sh -lc "$$START_CMD" > /tmp/sre-copilot-dev.log 2>&1 < /dev/null & echo $$! > /tmp/sre-copilot-dev.pid; \
				sleep 2; \
				PID_FILE_VAL=$$(cat /tmp/sre-copilot-dev.pid 2>/dev/null || true); \
				if [ -n "$$PID_FILE_VAL" ] && ! kill -0 "$$PID_FILE_VAL" 2>/dev/null; then \
					if [ "$$START_MODE" = "dev" ] && grep -q "Error: listen EPERM: operation not permitted .*tsx-.*\\.pipe" /tmp/sre-copilot-dev.log 2>/dev/null; then \
						echo "⚠️ dev 模式触发 tsx IPC 权限限制，自动回退到 prod 模式启动"; \
						PORT="$$APP_PORT" nohup /bin/sh -lc "npm run build && npm run start" > /tmp/sre-copilot-dev.log 2>&1 < /dev/null & echo $$! > /tmp/sre-copilot-dev.pid; \
						START_MODE="prod"; \
					fi; \
				fi; \
				echo "✅ 已后台启动服务 PID=$$(cat /tmp/sre-copilot-dev.pid) (mode=$$START_MODE)"; \
			else \
				OCCUPIER=$$(lsof -nP -iTCP:"$$APP_PORT" -sTCP:LISTEN | awk 'NR==2{print $$1 " (pid=" $$2 ")"}'); \
				if [ -n "$$OCCUPIER" ]; then \
					echo "ℹ️ 检测到 $$APP_PORT 端口已有监听进程，跳过重复启动: $$OCCUPIER"; \
				else \
					echo "ℹ️ 检测到 $$APP_PORT 端口已被占用，跳过重复启动"; \
				fi; \
			fi; \
		}

# 非阻塞后台重启本地服务（先停旧服务再启动）
local-restart-bg:
	@APP_PORT=$${PORT:-3001}; \
	echo "停止本地服务 (端口 $$APP_PORT)..."; \
	PIDS=$$(lsof -tiTCP:$$APP_PORT -sTCP:LISTEN 2>/dev/null || true); \
	if [ -n "$$PIDS" ]; then \
		echo "$$PIDS" | xargs kill -9 2>/dev/null || true; \
	fi; \
	if [ -f /tmp/sre-copilot-dev.pid ]; then \
		PID_FILE_VAL=$$(cat /tmp/sre-copilot-dev.pid 2>/dev/null || true); \
		if [ -n "$$PID_FILE_VAL" ]; then kill -9 "$$PID_FILE_VAL" 2>/dev/null || true; fi; \
		rm -f /tmp/sre-copilot-dev.pid; \
	fi; \
	echo "已停止"
	@$(MAKE) --no-print-directory local-up-bg

# 危险操作：只有显式确认后才允许清空本地 postgres 数据卷
local-db-reset:
	@if [ "$(CONFIRM_RESET_DB)" != "YES" ]; then \
		echo "❌ 拒绝执行。此操作会清空本地 postgres 数据卷。"; \
		echo "如确认需要重置数据库，请执行：make local-db-reset CONFIRM_RESET_DB=YES"; \
		exit 2; \
	fi
	@cd $(ROOT) && { \
		echo "⚠️ 正在重置本地 postgres 数据卷..."; \
		if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then \
			docker compose --env-file ../.env.secrets down -v postgres; \
		elif command -v docker-compose >/dev/null 2>&1; then \
			docker-compose --env-file ../.env.secrets -f docker-compose.yml down -v postgres; \
		else \
			echo "❌ 未检测到 docker compose / docker-compose"; \
			exit 1; \
		fi; \
		echo "✅ 本地 postgres 数据卷已重置"; \
	}

# 统一验收入口：面向已运行服务实例生成本地验收报告
verify-local:
	@BASE_URL="$${BASE_URL:-http://127.0.0.1:3001}" AUTH_TOKEN="$${AUTH_TOKEN:-}" PORT="$${PORT:-}" VERIFY_STAGE="$${VERIFY_STAGE:-all}" VERIFY_PROFILE="$${VERIFY_PROFILE:-local-fast}" REPORT_FILE="$${REPORT_FILE:-}" \
		bash $(ROOT)scripts/test/verify-local-baseline.sh; \
	rc=$$?; \
	if [ "$$rc" -ne 0 ]; then \
		exit "$$rc"; \
	fi; \
	if [ "$${VERIFY_AUTO_PRUNE:-1}" = "1" ]; then \
		$(MAKE) --no-print-directory verify-prune DRY_RUN="$${VERIFY_PRUNE_DRY_RUN:-0}"; \
	fi

verify-local-all:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=all

verify-local-quick:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=quick

verify-local-smoke:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=smoke

verify-local-tests:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=tests

verify-local-auth:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=auth

verify-local-fast:
	@$(MAKE) --no-print-directory verify-local VERIFY_PROFILE=local-fast

verify-local-ci:
	@$(MAKE) --no-print-directory verify-local VERIFY_PROFILE=ci

verify-local-smoke-fast:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=smoke VERIFY_PROFILE=local-fast

verify-local-smoke-ci:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=smoke VERIFY_PROFILE=ci

verify-local-auth-fast:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=auth VERIFY_PROFILE=local-fast

verify-local-auth-ci:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=auth VERIFY_PROFILE=ci

verify-local-browser:
	@$(MAKE) --no-print-directory verify-local VERIFY_STAGE=browser

verify-browser:
	@BASE_URL="$${BASE_URL:-http://127.0.0.1:3001}" AUTH_TOKEN="$${AUTH_TOKEN:-}" PORT="$${PORT:-}" HEADLESS="$${HEADLESS:-1}" \
		bash $(ROOT)scripts/test/test-browser-regression.sh; \
	rc=$$?; \
	if [ "$$rc" -ne 0 ]; then \
		exit "$$rc"; \
	fi; \
	if [ "$${VERIFY_AUTO_PRUNE:-1}" = "1" ]; then \
		$(MAKE) --no-print-directory verify-prune DRY_RUN="$${VERIFY_PRUNE_DRY_RUN:-0}"; \
	fi

verify-online:
	@AUTH_TOKEN="$${AUTH_TOKEN:-}" REMOTE_HOST="$${REMOTE_HOST:-$(REMOTE_HOST)}" REMOTE_PATH="$${REMOTE_PATH:-$(REMOTE_PATH)}" \
		bash $(ROOT)scripts/test/verify-online-regression.sh

benchmark-llm-cross:
	@AUTH_TOKEN="$${AUTH_TOKEN:-}" REMOTE_HOST="$${REMOTE_HOST:-$(REMOTE_HOST)}" REMOTE_PATH="$${REMOTE_PATH:-$(REMOTE_PATH)}" REMOTE_SERVICE_PORT="$${REMOTE_SERVICE_PORT:-3900}" \
		node $(ROOT)scripts/test/run-llm-cross-benchmark.js

verify-copilot-diagnosis:
	@BASE_URL="$${BASE_URL:-http://127.0.0.1:3001}" AUTH_TOKEN="$${AUTH_TOKEN:-}" \
		node $(ROOT)scripts/test/test-expert-diagnosis-entry.js

verify-prune:
	@DRY_RUN="$${DRY_RUN:-0}" bash $(ROOT)scripts/test/verify-prune.sh

workspace-prune:
	@DRY_RUN="$${DRY_RUN:-1}" CONFIRM_PRUNE="$${CONFIRM_PRUNE:-}" bash $(ROOT)scripts/tools/prune-workspace-artifacts.sh

# 针对已运行服务实例执行全量脚本并生成 Markdown 报告
test-all-report:
	@AUTH_TOKEN="$${AUTH_TOKEN:-}"; \
	BASE_URL="$${BASE_URL:-http://127.0.0.1:3001}"; \
	TEST_PROFILE="$${TEST_PROFILE:-local-fast}"; \
	CONSOLE_MODE="$${CONSOLE_MODE:-concise}"; \
	if [ "$$TEST_PROFILE" = "ci" ]; then \
		API_TIMEOUT_SEC="$${API_TIMEOUT_SEC:-5}"; \
		CONNECT_TIMEOUT_SEC="$${CONNECT_TIMEOUT_SEC:-2}"; \
		RUN_HEAVY_MCP="$${RUN_HEAVY_MCP:-1}"; \
		RUN_TOOL_DISCOVERY_CHECK="$${RUN_TOOL_DISCOVERY_CHECK:-1}"; \
		SCRIPT_TIMEOUT_SEC="$${SCRIPT_TIMEOUT_SEC:-120}"; \
	else \
		API_TIMEOUT_SEC="$${API_TIMEOUT_SEC:-3}"; \
		CONNECT_TIMEOUT_SEC="$${CONNECT_TIMEOUT_SEC:-1}"; \
		RUN_HEAVY_MCP="$${RUN_HEAVY_MCP:-0}"; \
		RUN_TOOL_DISCOVERY_CHECK="$${RUN_TOOL_DISCOVERY_CHECK:-0}"; \
		SCRIPT_TIMEOUT_SEC="$${SCRIPT_TIMEOUT_SEC:-45}"; \
	fi; \
	if [ -z "$$AUTH_TOKEN" ]; then \
		echo "❌ 缺少 AUTH_TOKEN。用法：make test-all-report AUTH_TOKEN=<token> [BASE_URL=http://127.0.0.1:3001]"; \
		exit 2; \
	fi; \
	echo "▶ 校验已提供的服务实例：$$BASE_URL/health"; \
	for i in $$(seq 1 60); do \
		if curl -fsS "$$BASE_URL/health" >/dev/null 2>&1; then break; fi; \
		sleep 1; \
	done; \
	if ! curl -fsS "$$BASE_URL/health" >/dev/null 2>&1; then \
		echo "❌ 服务未就绪：$$BASE_URL/health"; \
		echo "   当前目标不会自动执行 local-up-bg；请先准备已运行的服务实例"; \
		exit 1; \
	fi; \
	mkdir -p $(ROOT)docs/verification; \
	TS=$$(date +%Y%m%d-%H%M%S)-$$$$; \
	OUT="$(ROOT)docs/verification/FULL-TEST-RUN-$$TS.MD"; \
	TMP_DIR=$$(mktemp -d 2>/dev/null || mktemp -d -t de-test-report); \
	trap 'rm -rf "$$TMP_DIR"' EXIT; \
	{ \
		echo "# 全量测试执行记录"; \
		echo; \
		echo "- 时间: $$(date "+%F %T %Z")"; \
		echo "- BASE_URL: $$BASE_URL"; \
		echo "- TEST_PROFILE: $$TEST_PROFILE"; \
		echo "- CONSOLE_MODE: $$CONSOLE_MODE"; \
		echo "- API_TIMEOUT_SEC: $$API_TIMEOUT_SEC"; \
		echo "- CONNECT_TIMEOUT_SEC: $$CONNECT_TIMEOUT_SEC"; \
		echo "- SCRIPT_TIMEOUT_SEC: $$SCRIPT_TIMEOUT_SEC"; \
		echo; \
	} > "$$OUT"; \
	if [ "$$TEST_PROFILE" = "ci" ]; then \
		FILE_LIST="scripts/test/test-static-pages.sh scripts/test/test-mcp-executor.sh scripts/test/test-role-permissions.sh scripts/test/verify-llm.sh scripts/test/test-mcp-local.sh scripts/test/test-mcp.sh scripts/test/test-domain-health.sh"; \
	else \
		FILE_LIST="scripts/test/test-static-pages.sh scripts/test/test-role-permissions.sh scripts/test/test-mcp-local.sh scripts/test/test-mcp.sh"; \
	fi; \
	TOTAL_COUNT=0; PASS_COUNT=0; FAIL_COUNT=0; \
	echo "▶ 执行全量脚本 (profile=$$TEST_PROFILE, console=$$CONSOLE_MODE)"; \
	for f in $$FILE_LIST; do \
		TOTAL_COUNT=$$((TOTAL_COUNT + 1)); \
		LOG_FILE="$$TMP_DIR/$$(basename "$$f").log"; \
		if command -v timeout >/dev/null 2>&1; then \
			AUTH_TOKEN="$$AUTH_TOKEN" BASE_URL="$$BASE_URL" API_TIMEOUT_SEC="$$API_TIMEOUT_SEC" CONNECT_TIMEOUT_SEC="$$CONNECT_TIMEOUT_SEC" QUIET=1 RUN_HEAVY_MCP="$$RUN_HEAVY_MCP" RUN_TOOL_DISCOVERY_CHECK="$$RUN_TOOL_DISCOVERY_CHECK" RUN_TOOLS_ENDPOINT_CHECK="$$( [ "$$TEST_PROFILE" = "ci" ] && echo 1 || echo 0 )" timeout "$$SCRIPT_TIMEOUT_SEC" bash "$$f" >"$$LOG_FILE" 2>&1; \
			rc=$$?; \
		else \
			AUTH_TOKEN="$$AUTH_TOKEN" BASE_URL="$$BASE_URL" API_TIMEOUT_SEC="$$API_TIMEOUT_SEC" CONNECT_TIMEOUT_SEC="$$CONNECT_TIMEOUT_SEC" QUIET=1 RUN_HEAVY_MCP="$$RUN_HEAVY_MCP" RUN_TOOL_DISCOVERY_CHECK="$$RUN_TOOL_DISCOVERY_CHECK" RUN_TOOLS_ENDPOINT_CHECK="$$( [ "$$TEST_PROFILE" = "ci" ] && echo 1 || echo 0 )" bash "$$f" >"$$LOG_FILE" 2>&1; \
			rc=$$?; \
		fi; \
		if [ "$$rc" -eq 0 ]; then \
			PASS_COUNT=$$((PASS_COUNT + 1)); \
			echo "✅ $$f"; \
		else \
			FAIL_COUNT=$$((FAIL_COUNT + 1)); \
			echo "❌ $$f (rc=$$rc)"; \
			echo "   --- failed log tail ---"; \
			tail -n 40 "$$LOG_FILE"; \
			echo "   --- end failed log tail ---"; \
		fi; \
		if [ "$$CONSOLE_MODE" = "full" ] && [ "$$rc" -eq 0 ]; then \
			echo "   --- full log ($$f) ---"; \
			tail -n +1 "$$LOG_FILE"; \
			echo "   --- end full log ---"; \
		fi; \
		{ \
			echo "## $$f"; \
			echo; \
			echo "- exit: $$rc"; \
			echo; \
			echo '```'; \
			tail -n +1 "$$LOG_FILE"; \
			echo; \
			echo '```'; \
			echo; \
		} >> "$$OUT"; \
	done; \
	{ \
		echo "## 汇总"; \
		echo; \
		echo "- 总数: $$TOTAL_COUNT"; \
		echo "- 通过: $$PASS_COUNT"; \
		echo "- 失败: $$FAIL_COUNT"; \
		echo; \
	} | tee -a "$$OUT"; \
	echo "REPORT_FILE=$$OUT"; \
	if [ "$$FAIL_COUNT" -gt 0 ]; then \
		echo "❌ 全量测试存在失败项（$$FAIL_COUNT/$$TOTAL_COUNT）"; \
		exit 1; \
	fi

test-all-report-fast:
	@$(MAKE) --no-print-directory test-all-report TEST_PROFILE=local-fast

test-all-report-ci:
	@$(MAKE) --no-print-directory test-all-report TEST_PROFILE=ci

# 离线回归（V1 已删除，此 target 仅保留兼容性占位）
test-no-llm:
	@echo "⚠️ v1/ 已删除，test-no-llm 不再可用；请使用 npm run v2:test 执行 V2 回归"

# 当前主运行时回归入口（保留 verify-v2-regression 兼容旧脚本）
verify-v2-core:
	@bash $(ROOT)scripts/test/verify-v2-core.sh

verify-runtime-core:
	@$(MAKE) --no-print-directory verify-v2-core

verify-v2-full:
	@bash $(ROOT)scripts/test/verify-v2-core.sh

verify-v2-regression:
	@$(MAKE) --no-print-directory verify-v2-full

verify-runtime-full:
	@$(MAKE) --no-print-directory verify-v2-full

verify-runtime-regression:
	@$(MAKE) --no-print-directory verify-runtime-full

v2-readiness-status:
	@bash $(ROOT)scripts/test/report-v2-readiness.sh

runtime-readiness-status:
	@$(MAKE) --no-print-directory v2-readiness-status

v2-context-status:
	@cd $(ROOT) && ./node_modules/.bin/tsx v2/eval/runners/project-context-status.ts

runtime-context-status:
	@$(MAKE) --no-print-directory v2-context-status

v2-handoff:
	@$(MAKE) --no-print-directory v2-context-status

runtime-handoff:
	@$(MAKE) --no-print-directory v2-handoff

workflow:
	@cd $(ROOT) && npm run workflow

workflow-resume:
	@cd $(ROOT) && npm run workflow:resume

workflow-check:
	@cd $(ROOT) && npm run workflow:check

workflow-verify:
	@cd $(ROOT) && npm run workflow:verify

workflow-refresh:
	@cd $(ROOT) && npm run workflow:refresh

workflow-handoff:
	@cd $(ROOT) && npm run workflow:handoff

v2-seed-runtime-sample:
	@echo "⚠️ seed-runtime-sample 需要通过 V2 app 入口执行，请参考 v2/src/app/index.ts"

runtime-seed-sample:
	@$(MAKE) --no-print-directory v2-seed-runtime-sample

# embedding 连通性测试（V1 已删除，暂不可用）
test-embedding:
	@echo "⚠️ v1/ 已删除，test-embedding 暂不可用"

# M1 三层记忆闭环验收（输出 Markdown 报告）
verify-m1-memory:
	@echo "⚠️ v1/ 已删除，verify-m1-memory 暂不可用"

verify-m1-chatops-mcp:
	@echo "⚠️ v1/ 已删除，verify-m1-chatops-mcp 暂不可用"

verify-playbook-coverage:
	@echo "⚠️ v1/ 已删除，verify-playbook-coverage 暂不可用"

verify-effect-tuning-gate:
	@AUTH_TOKEN="$${AUTH_TOKEN:-}" BASE_URL="$${BASE_URL:-http://127.0.0.1:3001}" CASES_FILE="$(ROOT)eval/effect-tuning-release-gate.json" \
		npm run replay:baseline

# ---------- Codex 专用远程运维 ----------
codex-deploy-local:
	@$(ROOT)scripts/tools/CODEX-REMOTE-OPS.SH deploy-local

codex-status:
	@$(ROOT)scripts/tools/CODEX-REMOTE-OPS.SH status

codex-health:
	@$(ROOT)scripts/tools/CODEX-REMOTE-OPS.SH health

codex-test-no-llm:
	@$(ROOT)scripts/tools/CODEX-REMOTE-OPS.SH test-no-llm

codex-test-report:
	@$(ROOT)scripts/tools/CODEX-REMOTE-OPS.SH test-report

codex-test-report-push:
	@$(ROOT)scripts/tools/CODEX-REMOTE-OPS.SH test-report-push

codex-exec:
	@if [ -z "$(CMD)" ]; then echo "❌ 请提供 CMD，例如 make codex-exec CMD='git status --short --branch'"; exit 1; fi
	@$(ROOT)scripts/tools/CODEX-REMOTE-OPS.SH exec "$(CMD)"

# 生成管理员访问 token（默认用户 shamcleren）
gen-admin-token:
	@BASE_URL="$${BASE_URL:-http://127.0.0.1:3001}"; \
	USER_ID="$${USER_ID:-shamcleren}"; \
	LABEL="$${LABEL:-admin-token}"; \
	BOOTSTRAP_TOKEN="$${BOOTSTRAP_TOKEN:-$${AUTH_TOKEN:-}}"; \
	ENV_FILE="$(ROOT).env.secrets"; \
	[ -f "$$ENV_FILE" ] || touch "$$ENV_FILE"; \
	if [ -z "$$BOOTSTRAP_TOKEN" ]; then \
		BOOTSTRAP_TOKEN=$$(sed -n 's/^ADMIN_BOOTSTRAP_TOKEN=//p' "$$ENV_FILE" | tail -n1); \
	fi; \
	if [ -z "$$BOOTSTRAP_TOKEN" ]; then \
		if command -v openssl >/dev/null 2>&1; then \
			BOOTSTRAP_TOKEN=$$(openssl rand -hex 24); \
		else \
			BOOTSTRAP_TOKEN=$$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 48); \
		fi; \
		BACKUP_FILE="$(ROOT).env.secrets.bak.$$(date +%Y%m%d-%H%M%S)"; \
		cp "$$ENV_FILE" "$$BACKUP_FILE" 2>/dev/null || true; \
		TMP_FILE=$$(mktemp); \
		awk -v bt="$$BOOTSTRAP_TOKEN" ' \
			BEGIN { hasAllow=0; hasToken=0; hasUser=0 } \
			/^ALLOW_BOOTSTRAP_TOKEN=/ { print "ALLOW_BOOTSTRAP_TOKEN=true"; hasAllow=1; next } \
			/^ADMIN_BOOTSTRAP_TOKEN=/ { print "ADMIN_BOOTSTRAP_TOKEN=" bt; hasToken=1; next } \
			/^ADMIN_BOOTSTRAP_USER_ID=/ { print "ADMIN_BOOTSTRAP_USER_ID=wecom_admin"; hasUser=1; next } \
			{ print } \
			END { \
				if (!hasAllow) print "ALLOW_BOOTSTRAP_TOKEN=true"; \
				if (!hasToken) print "ADMIN_BOOTSTRAP_TOKEN=" bt; \
				if (!hasUser) print "ADMIN_BOOTSTRAP_USER_ID=wecom_admin"; \
			} \
		' "$$ENV_FILE" > "$$TMP_FILE" && mv "$$TMP_FILE" "$$ENV_FILE"; \
		echo "✅ 已自动生成并写入 bootstrap token 到 $$ENV_FILE"; \
		echo "🗂️  备份文件：$$BACKUP_FILE"; \
	fi; \
	echo "⏳ 等待服务就绪..."; \
	for i in $$(seq 1 60); do \
		if curl -fsS "$$BASE_URL/health" >/dev/null 2>&1; then break; fi; \
		if [ $$((i % 5)) -eq 0 ]; then echo "   ... 服务等待 $$i s"; fi; \
		sleep 1; \
	done; \
	if ! curl -fsS "$$BASE_URL/health" >/dev/null 2>&1; then \
		echo "❌ 服务未就绪：$$BASE_URL/health"; \
		echo "请先准备一个已运行的服务实例，再重试 make gen-admin-token"; \
		exit 1; \
	fi; \
	echo "✅ 服务已就绪"; \
	echo "⏳ 等待数据库连接..."; \
	for i in $$(seq 1 90); do \
		HEALTH=$$(curl -sS "$$BASE_URL/health" || true); \
		echo "$$HEALTH" | grep -q '"database":"connected"' && break; \
		if [ $$((i % 5)) -eq 0 ]; then echo "   ... 数据库等待 $$i s"; fi; \
		sleep 1; \
	done; \
	HEALTH=$$(curl -sS "$$BASE_URL/health" || true); \
	if ! echo "$$HEALTH" | grep -q '"database":"connected"'; then \
		echo "❌ 数据库仍不可用，当前 /health: $$HEALTH"; \
		echo "请先确认 postgres 已启动且连接参数正确，再重试 make gen-admin-token"; \
		exit 1; \
	fi; \
	RESP=$$(curl -sS -X POST "$$BASE_URL/api/admin/users/$$USER_ID/tokens" \
		-H "Authorization: Bearer $$BOOTSTRAP_TOKEN" \
		-H "Content-Type: application/json" \
		-d "{\"label\":\"$$LABEL\"}"); \
	echo "$$RESP"; \
	TOKEN=$$(echo "$$RESP" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'); \
	TOKEN_ID=$$(echo "$$RESP" | sed -n 's/.*"tokenId":"\([^"]*\)".*/\1/p'); \
	if [ -z "$$TOKEN" ]; then \
		echo "❌ 未生成 token，请检查上面的错误响应"; \
		exit 1; \
	fi; \
	OUT="$(ROOT).env.admin-token"; \
	{ \
		echo "AUTH_TOKEN=$$TOKEN"; \
		echo "BOOTSTRAP_TOKEN=$$BOOTSTRAP_TOKEN"; \
		echo "USER_ID=$$USER_ID"; \
		echo "TOKEN_ID=$$TOKEN_ID"; \
		echo "BASE_URL=$$BASE_URL"; \
		echo "GENERATED_AT=$$(date "+%Y-%m-%dT%H:%M:%S%z")"; \
	} > "$$OUT"; \
	echo "✅ 已生成管理员 token（user=$$USER_ID）"; \
	echo "TOKEN_FILE=$$OUT"; \
	echo "使用方式：export AUTH_TOKEN=$$TOKEN"
