# Stage 010 — public contract

## Goal

Give an agent a deterministic boundary for this demonstration without exposing
private MiLA or DingDawg internals.

## Procedure

Read `contract.json`, run `done.sh` for the structural predicate, then run
`verify.sh` for the independent source boundary scan. Follow `NEXT` exactly.

## Boundary

The demo can illustrate policy outcomes and receipt-like records. It cannot
authorize, sign, transmit, settle, custody, or reconcile a real payment.
