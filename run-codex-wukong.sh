#!/usr/bin/env bash
set -o pipefail
cd /workspace/wukong-3d
echo "=== Codex wukong-3d start $(date -Is) ==="
codex exec \
  -m gpt-6-astra \
  --dangerously-bypass-approvals-and-sandbox \
  -C /workspace/wukong-3d \
  --add-dir /workspace/wukong-3d-ref \
  --skip-git-repo-check \
  -o /workspace/wukong-3d/codex-last-message.txt \
  "$(cat /workspace/wukong-3d/CODEX_TASK.md)" \
  2>&1 | tee /workspace/wukong-3d/codex-run.log
echo "EXIT:$?"
echo "=== done $(date -Is) ==="
