# ADR 0003: Replay runs in a separate Rust worker

A candidate from a pattern matcher is not yet a finding. Calling it a finding requires replaying the slot against forked Sui state and confirming the proposed extraction is real.

Replay needs the canonical Sui Move VM, not an approximation. It links against `sui-execution`, `move-vm`, and Move stdlib at the protocol version active at the candidate slot. Replays observed in practice take 5-60 seconds.

I considered running this inside a Convex action with WASM-compiled Move VM. Two problems: the VM isn't built for that target, and 30+ second jobs at Convex pricing for hundreds of candidates a day get expensive fast.

So replay is a separate binary. It subscribes to `replay_queue`, claims jobs atomically, runs replays locally, writes results back into `finding.replayResult`. Worker pool of 2-4 processes against one Convex deployment, scaled out if a backlog forms.

## Trade-offs

More moving parts. The replay-engine is a separate thing to build, deploy, monitor.

There's a hop between candidate creation and verification result. Convex query subscriptions make pickup near-instant in the common case, so this is mostly a non-issue, but a stuck worker queue is an alert worth wiring up.

The worker is single-binary, no state of its own. Deploys are atomic. That's the part I care about: I don't want a second stateful service.
