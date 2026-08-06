#!/usr/bin/env bash
set -euo pipefail
STAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$STAGE_DIR/../.." && pwd)"
for file in "$ROOT_DIR/package.json" "$STAGE_DIR/contract.json" "$STAGE_DIR/NEXT"; do test -s "$file"; done
node - "$STAGE_DIR/contract.json" "$ROOT_DIR/package.json" <<'NODE'
const fs = require("fs");
const contract = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const pkg = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
for (const key of ["schema_version", "contract_id", "package_name", "scope", "demo_only", "real_wallet_creation", "transaction_transmission", "payment_authority", "custody", "secret_sauce_disclosure", "evidence"]) if (!(key in contract)) throw new Error(`missing ${key}`);
if (contract.package_name !== pkg.name) throw new Error("package mismatch");
for (const key of ["demo_only", "real_wallet_creation", "transaction_transmission", "payment_authority", "custody", "secret_sauce_disclosure"]) if (contract[key] !== (key === "demo_only")) throw new Error(`unsafe ${key}`);
NODE
echo "PASS: wallet-demo public ICM contract is structurally valid"
