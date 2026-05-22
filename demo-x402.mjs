/**
 * dingdawg-agent-wallet — x402 demo
 *
 * Shows the governance gate sitting between an HTTP 402 and the payment signature.
 * When the agent hits a 402, it must call governed_spend BEFORE signing anything.
 * Policy violations block the payment at the gate — the PAYMENT-SIGNATURE never goes out.
 *
 * Flow:
 *   GET /api/data → 402 PAYMENT-REQUIRED
 *   → governed_spend (policy check + receipt)
 *   → authorized: retry with PAYMENT-SIGNATURE → 200 OK
 *   → denied: payment blocked, 402 never resolved
 *
 * Run:
 *   npm install dingdawg-agent-wallet @modelcontextprotocol/sdk
 *   node demo-x402.mjs
 *
 * No API keys. No blockchain. No real x402 facilitator.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import http from "http";

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

function fmt(label, value) {
  return `  ${DIM}${label}:${RESET} ${value}`;
}

async function call(client, tool, args) {
  const res = await client.callTool({ name: tool, arguments: args });
  return JSON.parse(res.content[0].text);
}

// ── Simulated x402 server ─────────────────────────────────────────────────────
// Realistic 402 response per the x402 spec:
// - PAYMENT-REQUIRED header: base64(JSON PaymentRequired object)
// - On retry with PAYMENT-SIGNATURE: returns 200 + PAYMENT-RESPONSE header
// No real blockchain. Demonstrates the protocol shape.

function buildPaymentRequired(amountUsdc, resource) {
  const payload = {
    scheme: "exact",
    network: "base",
    maxAmountRequired: String(amountUsdc),
    resource,
    description: `Access to ${resource}`,
    mimeType: "application/json",
    outputSchema: null,
    estimatedOutputBytes: null,
    payTo: "0xSimulatedVaultAddress",
    requiredDeadlineSeconds: 60,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function startX402Server() {
  return new Promise((resolve) => {
    const endpoints = {
      "/api/market-data":    { amountUsdc: 0.01, label: "Market data feed"   },
      "/api/premium-report": { amountUsdc: 90,   label: "Premium report"     },
      "/api/quick-lookup":   { amountUsdc: 0.50, label: "Quick lookup"       },
    };

    const server = http.createServer((req, res) => {
      const endpoint = endpoints[req.url];
      if (!endpoint) {
        res.writeHead(404); res.end("not found"); return;
      }

      const hasSig = !!req.headers["payment-signature"];
      if (!hasSig) {
        // First request — return 402
        const prHeader = buildPaymentRequired(endpoint.amountUsdc, req.url);
        res.writeHead(402, {
          "Content-Type": "application/json",
          "PAYMENT-REQUIRED": prHeader,
        });
        res.end(JSON.stringify({ error: "Payment required", resource: req.url }));
        return;
      }

      // Retry with signature — return 200
      const settlementResponse = Buffer.from(JSON.stringify({
        success: true,
        txHash: "0xsimulated_" + Math.random().toString(16).slice(2, 10),
        network: "base",
        payer: "0xAgentWallet",
      })).toString("base64");

      res.writeHead(200, {
        "Content-Type": "application/json",
        "PAYMENT-RESPONSE": settlementResponse,
      });
      res.end(JSON.stringify({
        data: `${endpoint.label} payload — delivered after payment`,
        resource: req.url,
      }));
    });

    server.listen(0, "127.0.0.1", () => {
      resolve({ server, port: server.address().port });
    });
  });
}

// ── Agent logic ───────────────────────────────────────────────────────────────
// Simulates an agent that:
//   1. Requests a resource
//   2. Hits 402 — extracts payment amount
//   3. Calls governed_spend (this is where DingDawg sits)
//   4. If authorized → retries with PAYMENT-SIGNATURE
//   5. If denied → aborts — the payment NEVER goes out

async function agentFetch(client, walletId, baseUrl, resource, vendor) {
  // Step 1: initial request
  const init = await fetch(`${baseUrl}${resource}`);

  if (init.status !== 402) {
    return { status: init.status, data: await init.json() };
  }

  // Step 2: parse 402
  const prHeader = init.headers.get("PAYMENT-REQUIRED");
  const paymentRequired = JSON.parse(Buffer.from(prHeader, "base64").toString());
  const amountUsdc = parseFloat(paymentRequired.maxAmountRequired);

  // Step 3: governance gate — MUST authorize before signing anything
  const auth = await call(client, "governed_spend", {
    wallet_id: walletId,
    amount_usdc: amountUsdc,
    recipient: vendor,
    memo: `x402: ${resource}`,
  });

  if (!auth.authorized) {
    return {
      status: 402,
      blocked_at_gate: true,
      deny_reason: auth.deny_reason,
      step_up_required: auth.step_up_required || false,
      receipt_id: auth.receipt_id,
      amount_usdc: amountUsdc,
    };
  }

  // Step 4: authorized — build PAYMENT-SIGNATURE and retry
  // In production this would be a real EIP-712 signed payload.
  // Here we simulate: the signature proves the governance layer approved it.
  const simulatedSignature = Buffer.from(JSON.stringify({
    scheme: "exact",
    network: "base",
    resource,
    amount: amountUsdc,
    governanceReceipt: auth.receipt_id,
    agentkit_call: auth.agentkit_call,
  })).toString("base64");

  const retry = await fetch(`${baseUrl}${resource}`, {
    headers: { "PAYMENT-SIGNATURE": simulatedSignature },
  });

  const settlement = JSON.parse(
    Buffer.from(retry.headers.get("PAYMENT-RESPONSE"), "base64").toString()
  );

  return {
    status: retry.status,
    data: await retry.json(),
    receipt_id: auth.receipt_id,
    daily_remaining_usdc: auth.daily_remaining_usdc,
    tx_hash: settlement.txHash,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run() {
  const { server, port } = await startX402Server();
  const BASE_URL = `http://127.0.0.1:${port}`;
  const VENDOR   = "0xSimulatedVaultAddress";

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["dingdawg-agent-wallet"],
  });
  const client = new Client({ name: "x402-demo", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  const WALLET = `x402-wallet-${Date.now()}`;

  console.log(`\n${BOLD}dingdawg-agent-wallet — x402 demo${RESET}`);
  console.log(`${DIM}Governance gate between HTTP 402 and PAYMENT-SIGNATURE${RESET}`);
  console.log(`${"─".repeat(55)}\n`);

  // Provision: $1 daily cap, $0.75 per-call cap, $0.50 step-up threshold
  console.log(`${CYAN}▶ provision_wallet${RESET} (daily_cap: $1 USDC)`);
  const w = await call(client, "provision_wallet", {
    provider: "coinbase",
    wallet_id: WALLET,
    label: "x402 Agent Wallet",
    network: "base",
    daily_cap_usdc: 1,
    per_call_cap_usdc: 0.75,
    step_up_thresh_usdc: 0.25,
    allowed_recipients: [VENDOR],
  });
  console.log(fmt("wallet_id",    w.wallet_id));
  console.log(fmt("daily_cap",    `$${w.policy.daily_cap_usdc} USDC`));
  console.log(fmt("per_call_cap", `$${w.policy.per_call_cap_usdc} USDC`));

  // Set step-up threshold (wallet_policy is the correct path for this)
  await call(client, "wallet_policy", {
    wallet_id: WALLET,
    step_up_thresh_usdc: 0.25,
  });

  // ── Case 1: $0.01 — authorized ──────────────────────────────────────────────
  console.log(`\n${CYAN}▶ GET /api/market-data${RESET} — server returns 402 ($0.01 USDC)`);
  const r1 = await agentFetch(client, WALLET, BASE_URL, "/api/market-data", VENDOR);
  if (r1.status === 200) {
    console.log(`  ${GREEN}✓ AUTHORIZED — PAYMENT-SIGNATURE sent — 200 OK${RESET}`);
    console.log(fmt("receipt_id",       r1.receipt_id));
    console.log(fmt("tx_hash",          r1.tx_hash));
    console.log(fmt("daily_remaining",  `$${r1.daily_remaining_usdc} USDC`));
    console.log(fmt("response",         r1.data.data));
  }

  // ── Case 2: $0.50 — step-up required ───────────────────────────────────────
  console.log(`\n${CYAN}▶ GET /api/quick-lookup${RESET} — server returns 402 ($0.50 USDC)`);
  const r2 = await agentFetch(client, WALLET, BASE_URL, "/api/quick-lookup", VENDOR);
  if (r2.blocked_at_gate && r2.step_up_required) {
    console.log(`  ${YELLOW}⚠ BLOCKED AT GATE — step-up required — PAYMENT-SIGNATURE never sent${RESET}`);
    console.log(fmt("reason",     r2.deny_reason));
    console.log(fmt("receipt_id", r2.receipt_id + " (denial logged)"));
    console.log(fmt("fix",        "Pass approval_token from your authorization flow"));
  }

  // ── Case 3: $90 — exceeds per-call cap ─────────────────────────────────────
  console.log(`\n${CYAN}▶ GET /api/premium-report${RESET} — server returns 402 ($90 USDC)`);
  const r3 = await agentFetch(client, WALLET, BASE_URL, "/api/premium-report", VENDOR);
  if (r3.blocked_at_gate) {
    console.log(`  ${RED}✗ BLOCKED AT GATE — PAYMENT-SIGNATURE never sent${RESET}`);
    console.log(fmt("reason",     r3.deny_reason));
    console.log(fmt("receipt_id", r3.receipt_id + " (denial logged)"));
  }

  // ── Audit ───────────────────────────────────────────────────────────────────
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
    const amt = r.amount_usdc != null ? `$${r.amount_usdc} USDC` : "     ";
    const resource = r.memo ? r.memo.replace("x402: ", "") : r.action;
    console.log(`  ${DIM}[${r.ts.slice(11, 19)}]${RESET} ${verdict} ${amt.padEnd(12)} ${resource}`);
  }

  console.log(`\n${"─".repeat(55)}`);
  console.log(`${BOLD}Key point:${RESET} The PAYMENT-SIGNATURE never left the agent`);
  console.log(`on denied requests. The gate is enforcement, not logging.\n`);
  console.log(`${BOLD}Integration:${RESET} npm install dingdawg-agent-wallet`);
  console.log(`${BOLD}Docs:${RESET}        https://npmjs.com/package/dingdawg-agent-wallet\n`);

  await client.close();
  server.close();
}

run().catch((e) => { console.error(e); process.exit(1); });
