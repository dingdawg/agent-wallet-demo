/**
 * dingdawg-agent-wallet — live demo
 *
 * Shows: provision → allow → deny → step-up → audit (chain_verified: true)
 * No API keys. No blockchain. Runs in 5 seconds.
 *
 * Run:
 *   npx dingdawg-agent-wallet --demo
 *   — or —
 *   npm install dingdawg-agent-wallet @modelcontextprotocol/sdk
 *   node demo.mjs
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

function fmt(label, value) {
  return `  ${DIM}${label}:${RESET} ${value}`;
}

async function call(client, tool, args) {
  const res = await client.callTool({ name: tool, arguments: args });
  return JSON.parse(res.content[0].text);
}

async function run() {
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["dingdawg-agent-wallet"],
  });

  const client = new Client({ name: "demo", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  const WALLET = `demo-wallet-${Date.now()}`;
  const VENDOR = "0xVendorABC123";

  console.log(`\n${BOLD}dingdawg-agent-wallet — live demo${RESET}`);
  console.log(`${"─".repeat(50)}\n`);

  // ── 1. Provision ──────────────────────────────────────────
  console.log(`${CYAN}▶ provision_wallet${RESET}`);
  const w = await call(client, "provision_wallet", {
    provider: "coinbase",
    wallet_id: WALLET,
    label: "Demo Agent Wallet",
    network: "base",
    daily_cap_usdc: 200,
    per_call_cap_usdc: 100,
    allowed_recipients: [VENDOR],
  });
  console.log(fmt("wallet_id", w.wallet_id));
  console.log(fmt("daily_cap", `$${w.policy.daily_cap_usdc} USDC`));
  console.log(fmt("per_call_cap", `$${w.policy.per_call_cap_usdc} USDC`));
  console.log(fmt("receipt_id", w.receipt_id));

  // ── 2. Allowed spend ──────────────────────────────────────
  console.log(`\n${CYAN}▶ governed_spend — $25 USDC (allowed)${RESET}`);
  const s1 = await call(client, "governed_spend", {
    wallet_id: WALLET,
    amount_usdc: 25,
    recipient: VENDOR,
    memo: "Invoice #INV-2026-001",
  });
  if (s1.authorized) {
    console.log(`  ${GREEN}✓ AUTHORIZED${RESET}`);
    console.log(fmt("receipt_id", s1.receipt_id));
    console.log(fmt("daily_remaining", `$${s1.daily_remaining_usdc} USDC`));
    console.log(fmt("next_step", s1.coinbase_cmd));
  }

  // ── 3. Denied — over per-call cap ─────────────────────────
  console.log(`\n${CYAN}▶ governed_spend — $150 USDC (exceeds per-call cap)${RESET}`);
  const s2 = await call(client, "governed_spend", {
    wallet_id: WALLET,
    amount_usdc: 150,
    recipient: VENDOR,
  });
  if (!s2.authorized) {
    console.log(`  ${RED}✗ DENIED${RESET}`);
    console.log(fmt("reason", s2.deny_reason));
    console.log(fmt("receipt_id", s2.receipt_id + " (denial is logged too)"));
  }

  // ── 4. Step-up required ───────────────────────────────────
  console.log(`\n${CYAN}▶ governed_spend — $75 USDC (step-up required)${RESET}`);
  const s3 = await call(client, "governed_spend", {
    wallet_id: WALLET,
    amount_usdc: 75,
    recipient: VENDOR,
  });
  if (!s3.authorized && s3.step_up_required) {
    console.log(`  ${YELLOW}⚠ STEP-UP REQUIRED${RESET}`);
    console.log(fmt("reason", s3.deny_reason));
    console.log(fmt("fix", "Pass b7_auth token from your trust gate"));
  }

  // ── 5. Blocked recipient ──────────────────────────────────
  console.log(`\n${CYAN}▶ governed_spend — unknown recipient (not in allowlist)${RESET}`);
  const s4 = await call(client, "governed_spend", {
    wallet_id: WALLET,
    amount_usdc: 10,
    recipient: "0xUnknownAddress",
  });
  if (!s4.authorized) {
    console.log(`  ${RED}✗ DENIED${RESET}`);
    console.log(fmt("reason", s4.deny_reason));
  }

  // ── 6. Audit trail ────────────────────────────────────────
  console.log(`\n${CYAN}▶ wallet_audit${RESET}`);
  const audit = await call(client, "wallet_audit", { wallet_id: WALLET });
  const verified = audit.chain_verified
    ? `${GREEN}chain_verified: true ✓${RESET}`
    : `${RED}chain_verified: false ✗${RESET}`;
  console.log(`  ${verified}`);
  console.log(fmt("total_receipts", audit.count));
  for (const r of audit.receipts) {
    const verdict = r.policy_verdict === "allow"
      ? `${GREEN}ALLOW${RESET}`
      : `${RED}DENY ${RESET}`;
    const amount = r.amount_usdc != null ? `$${r.amount_usdc} USDC` : "     ";
    console.log(`  ${DIM}[${r.ts.slice(11, 19)}]${RESET} ${verdict} ${amount.padEnd(12)} ${r.action}`);
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`${BOLD}Integration:${RESET} npm install dingdawg-agent-wallet`);
  console.log(`${BOLD}Docs:${RESET}        https://npmjs.com/package/dingdawg-agent-wallet\n`);

  await client.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
