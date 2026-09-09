#!/usr/bin/env bash
set -o pipefail
cd /workspace/wukong-3d
echo "=== Codex wukong ART start $(date -Is) ==="
codex exec \
  -m gpt-6-astra \
  --dangerously-bypass-approvals-and-sandbox \
  -C /workspace/wukong-3d \
  --add-dir /workspace/tools \
  --add-dir /home/box/bin \
  --skip-git-repo-check \
  -o /workspace/wukong-3d/codex-art-last.txt \
  "$(cat /workspace/wukong-3d/PHASE2_ART.md)" \
  2>&1 | tee /workspace/wukong-3d/codex-art-run.log
echo "EXIT:$?"
echo "=== done $(date -Is) ==="
