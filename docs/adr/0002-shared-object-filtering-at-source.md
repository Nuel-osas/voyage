# ADR 0002: Filter at the bridge, not in Convex

Sui's parallel execution rests on a specific property: transactions touching only owned objects bypass consensus. Only shared-object access is sequenced.

If MEV exists on Sui, it almost certainly involves shared-object access. So a transaction that touches no shared objects is almost certainly noise for our purposes.

The bridge keeps a transaction if any of these are true:

- It mutates a shared object.
- It touches a known DEX pool object (curated allow-list).
- It touches a known oracle object (curated allow-list).
- It overlaps in touched objects with another transaction in the same checkpoint by a different sender (sandwich-shape pre-filter).

Everything else is dropped before Convex sees it. In practice this kills 60-90% of mainnet volume.

## What this costs us

Selection bias. Any MEV pattern that doesn't involve shared objects is invisible to this lab. That's a real limitation. If we publish a null result, it applies only to shared-object-mediated MEV. We say so.

The DEX/oracle allow-lists need maintenance as protocols launch. A weekly audit and a 1% sample of dropped transactions into a "control" bucket is the safety net for the obvious failure mode (a new protocol uses an unfamiliar pool object pattern).

## Why not in Convex

Filtering 7K TPS in TypeScript Convex functions burns function time on cheap rejections. The bridge is doing it in Rust against the canonical Sui types anyway. The right boundary.
