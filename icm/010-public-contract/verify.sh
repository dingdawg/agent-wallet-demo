#!/usr/bin/env bash
set -euo pipefail
STAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$STAGE_DIR/../.." && pwd)"
if rg -n -i --glob '!verify.sh' '(/home/|sk_(live|test)_|pk_(live|test)_|whsec_|api\.dingdawg\.com|DINGDAWG_API_KEY=|keyword.?weight|score.?threshold)' "$ROOT_DIR/icm"; then
  echo "FAIL: public ICM folder contains a prohibited implementation disclosure" >&2
  exit 1
fi
test -f "$ROOT_DIR/demo.mjs"
test -f "$ROOT_DIR/demo-x402.mjs"
echo "PASS: wallet-demo ICM boundary scan is clean and both demos are present"
