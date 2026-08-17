#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

for legacy_path in \
  v2 eval config knowledge \
  .dockerignore Dockerfile Makefile mcp-config.json nginx-local.conf \
  LOCAL-DEV-GUIDE.MD DEPLOYMENT-GUIDE.MD \
  docs/tools docs/wecom docs/review docs/roadmap docs/security \
  docs/superpowers/specs
do
  if [[ -e "$legacy_path" ]]; then
    echo "legacy path present: $legacy_path" >&2
    exit 1
  fi
done

script_files="$(find scripts -type f -print | sort)"
if [[ "$script_files" != "scripts/test/verify-clean-start.sh" ]]; then
  printf 'unexpected scripts:\n%s\n' "$script_files" >&2
  exit 1
fi

node --input-type=commonjs <<'NODE'
const packageJson = require('./package.json');
const allowedScripts = new Set([
  'clean:start:verify',
  'agent:typecheck',
  'agent:test',
  'agent:verify',
  'agent:time:demo',
]);
for (const name of Object.keys(packageJson.scripts || {})) {
  if (!allowedScripts.has(name)) throw new Error(`unexpected npm script: ${name}`);
}
if (packageJson.scripts?.['clean:start:verify'] !== 'bash scripts/test/verify-clean-start.sh') {
  throw new Error('clean:start:verify does not invoke the stable guard');
}
for (const name of ['@playwright/test', '@types/pg', 'dotenv', 'pg', 'playwright']) {
  if (packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]) {
    throw new Error(`legacy dependency present: ${name}`);
  }
}
for (const name of ['@types/node', 'tsx', 'typescript']) {
  if (!packageJson.devDependencies?.[name]) throw new Error(`required devDependency missing: ${name}`);
}
NODE

if git ls-files | rg '(^|/)(v2|eval|config|knowledge)/|(^|/)(compare-v1-v2|workflow-orchestrator)|(^|/)verify-v2'; then
  echo 'legacy tracked asset present' >&2
  exit 1
fi

if find . -path './.git' -prune -o -path './node_modules' -prune -o -type f -name '*.md' -print | grep -q .; then
  echo 'lowercase Markdown filename present' >&2
  exit 1
fi

echo 'clean-start verification: PASS'
