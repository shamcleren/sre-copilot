#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

echo "==> V2 full verify (core only — compat layer removed with v1/)"
bash "$ROOT_DIR/scripts/test/verify-v2-core.sh"

echo "✅ V2 full verify passed"
