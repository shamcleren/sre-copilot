#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:3001}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
HEADLESS="${HEADLESS:-1}"

if [ -z "$AUTH_TOKEN" ] && [ -f "$ROOT_DIR/.env.admin-token" ]; then
  AUTH_TOKEN="$(awk -F= '/^AUTH_TOKEN=/{print $2}' "$ROOT_DIR/.env.admin-token" | tr -d '\r')"
fi

if [ -z "$AUTH_TOKEN" ]; then
  echo "missing AUTH_TOKEN (env or .env.admin-token)"
  exit 2
fi

if [ ! -d "$ROOT_DIR/node_modules/playwright" ]; then
  echo "playwright not installed under workspace root; run: npm install"
  exit 2
fi

cd "$ROOT_DIR"
echo "▶ 校验目标服务是否已就绪 ($BASE_URL/health)"
MAX_WAIT_SEC="${MAX_WAIT_SEC:-30}"
READY=0
for i in $(seq 1 "$MAX_WAIT_SEC"); do
  if curl -fsS "$BASE_URL/health" >/dev/null 2>&1; then
    READY=1
    echo "✅ 服务已就绪 (${i}s)"
    break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "❌ 服务未在 ${MAX_WAIT_SEC}s 内就绪: $BASE_URL/health"
  echo "   当前脚本不会自动执行 make local-restart-bg；请先准备已运行的服务实例并设置 BASE_URL"
  exit 1
fi

mkdir -p "$ROOT_DIR/docs/verification"
TS="$(date +%Y%m%d-%H%M%S)"
OUT_JSON="$ROOT_DIR/docs/verification/BROWSER-REGRESSION-$TS.JSON"
OUT_MD="$ROOT_DIR/docs/verification/BROWSER-REGRESSION-$TS.MD"
OUT_PNG="$ROOT_DIR/docs/verification/BROWSER-REGRESSION-$TS.PNG"

set +e
BASE_URL="$BASE_URL" AUTH_TOKEN="$AUTH_TOKEN" HEADLESS="$HEADLESS" SCREENSHOT_PATH="$OUT_PNG" node "scripts/test/test-browser-regression.js" > "$OUT_JSON"
RC=$?
set -e

python3 - <<'PY' "$OUT_JSON" "$OUT_MD"
import json, sys, pathlib
src = pathlib.Path(sys.argv[1])
dst = pathlib.Path(sys.argv[2])
data = json.loads(src.read_text(encoding='utf-8'))
lines = []
lines.append('# 浏览器回归报告')
lines.append('')
lines.append(f"- 时间: {data.get('timestamp','')}")
lines.append(f"- 结论: {data.get('summary','FAILED')}")
lines.append(f"- BASE_URL: {data.get('baseUrl','')}")
lines.append('')

path_sections = [
    ('pathA', '路径A MCP 删除'),
    ('pathB', '路径B ChatOps 读写意图'),
    ('pathC', '路径C 失败追问'),
    ('pathD', '路径D 待确认会话自动续接'),
    ('pathE', '路径E 控制台与网络断言'),
    ('pathF', '路径F 复合句多动作预览'),
    ('pathG', '路径G 口语/错词鲁棒性'),
    ('pathH', '路径H Admin 意图可观测链路'),
    ('pathI', '路径I 专家对话调试链路'),
    ('pathJ', '路径J ChatOps 多轮上下文继承'),
    ('pathK', '路径K ChatOps 上下文写操作跟进'),
]
for key, title in path_sections:
    row = data.get(key, {})
    lines.append(f"## {title}")
    lines.append('')
    lines.append(f"- 状态: {row.get('status','FAIL')}")
    lines.append(f"- 证据: {row.get('detail','')}")
    lines.append('')
console_errors = data.get('consoleErrors', []) or []
lines.append('## 控制台错误（截断）')
lines.append('')
if console_errors:
    for e in console_errors:
        lines.append(f"- {e}")
else:
    lines.append('- 无')
lines.append('')
network = data.get('network', {}) or {}
lines.append('## 关键网络调用')
lines.append('')
for k, rows in network.items():
    lines.append(f"- {k}: {rows}")
lines.append('')
issues = data.get('issues', [])
lines.append('## 问题列表')
lines.append('')
if issues:
    for i in issues:
        lines.append(f"- {i}")
else:
    lines.append('- 无')
lines.append('')
dst.write_text('\n'.join(lines), encoding='utf-8')
PY

cat "$OUT_JSON"
echo
echo "report_json=$OUT_JSON"
echo "report_md=$OUT_MD"
if [ -f "$OUT_PNG" ]; then
  echo "report_png=$OUT_PNG"
fi
exit "$RC"
