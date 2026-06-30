#!/bin/bash
set -euo pipefail

if [ -f "$CLAUDE_PROJECT_DIR/package.json" ]; then
  (cd "$CLAUDE_PROJECT_DIR" && npm install)
fi

npx --yes @tech-leads-club/agent-skills install --skill tlc-spec-driven
