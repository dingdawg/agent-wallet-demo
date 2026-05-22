# dingdawg-agent-wallet — live demo

Shows **governed agent wallet** enforcement in action: allow, deny, step-up, allowlist — all in 5 seconds. No API keys. No blockchain required.

---

## What it demonstrates

```
▶ provision_wallet
  wallet_id:    demo-wallet-abc123
  daily_cap:    $200 USDC
  per_call_cap: $100 USDC

▶ governed_spend — $25 USDC (allowed)
  ✓ AUTHORIZED
  receipt_id:      6aba84a6-...
  daily_remaining: $175 USDC
  next_step:       npx @coinbase/agentkit send --wallet-id ... --amount 25 --asset USDC

▶ governed_spend — $150 USDC (exceeds per-call cap)
  ✗ DENIED
  reason:      Amount 150 USDC exceeds per-call cap 100 USDC
  receipt_id:  cd7a7aa8-... (denial is logged too)

▶ governed_spend — $75 USDC (step-up required)
  ⚠ STEP-UP REQUIRED
  reason: Amount 75 USDC > step-up threshold 50 USDC — MFA required
  fix:    Pass b7_auth token from your trust gate

▶ governed_spend — unknown recipient (not in allowlist)
  ✗ DENIED
  reason: Recipient 0xUnknownAddress not in allowlist

▶ wallet_audit
  chain_verified: true ✓
  total_receipts: 5
  [17:02:18] DENY  $10 USDC    governed_spend
  [17:02:18] DENY  $75 USDC    governed_spend
  [17:02:18] DENY  $150 USDC   governed_spend
  [17:02:18] ALLOW $25 USDC    governed_spend
  [17:02:18] ALLOW              provision_wallet
```

Every action — allow AND deny — produces an immutable receipt. `chain_verified: true` means the full chain is cryptographically intact.

---

## Run it

```bash
git clone https://github.com/DingDawg/agent-wallet-demo
cd agent-wallet-demo
npm install
node demo.mjs
```

---

## The package

[dingdawg-agent-wallet](https://npmjs.com/package/dingdawg-agent-wallet) — 5 MCP tools that wrap any agent wallet with policy enforcement and an immutable audit trail.

```bash
npm install dingdawg-agent-wallet
```

| Tool | What it does |
|---|---|
| `provision_wallet` | Create wallet with spend policy (daily cap, per-call cap, allowlist) |
| `governed_spend` | Policy check → authorize → immutable receipt |
| `governed_receive` | Accept payment with tamper-proof receipt |
| `wallet_policy` | Update limits and allowlists at runtime |
| `wallet_audit` | Full receipt chain — `chain_verified: true` |

Coinbase AgentKit gives your agent a wallet. DingDawg gives it a conscience.

---

## Why this matters

AI agents can now hold USDC and spend autonomously. The infrastructure exists. What doesn't: **who enforces what the agent is allowed to spend, on what, for whom — and proves it happened correctly.**

- `governed_spend` authorizes then returns the exact `coinbase_cmd` to execute on-chain
- Every denial is logged — you can prove what your agent *didn't* do
- `chain_verified: true` means the audit trail cannot be tampered with after the fact

---

[npm](https://npmjs.com/package/dingdawg-agent-wallet) · [DingDawg](https://dingdawg.com)
