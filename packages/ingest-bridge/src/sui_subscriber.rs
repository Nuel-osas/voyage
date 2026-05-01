//! Sui mainnet checkpoint subscriber.
//!
//! Pulls checkpoints from a JSON-RPC full node, filters them, and hands
//! filtered checkpoints to the pusher. The hot path is single-threaded by
//! design — Sui's checkpoint cadence is well within what one async task
//! can handle, and serializing prevents out-of-order Convex writes.
//!
//! Backfill (replaying historical checkpoints) is a separate mode controlled
//! by `START_CHECKPOINT`. In backfill mode the subscriber walks forward from
//! the start checkpoint to the current head, then transitions to live mode.

use crate::config::Config;
use crate::filter::Filter;
use crate::push::Pusher;
use anyhow::Result;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct CheckpointTx {
    pub digest: String,
    #[serde(rename = "timestampMs")]
    pub timestamp_ms: u64,
    pub sender: String,
    #[serde(rename = "touchedSharedObjects")]
    pub touched_shared_objects: Vec<String>,
    #[serde(rename = "valueDelta")]
    pub value_delta: Vec<ValueDelta>,
    pub flags: Flags,
    #[serde(rename = "gasUsed")]
    pub gas_used: u64,

    #[serde(skip)]
    pub touched_objects: Vec<String>,
    #[serde(skip)]
    pub shared_object_mutations: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ValueDelta {
    #[serde(rename = "objectId")]
    pub object_id: String,
    #[serde(rename = "objectType")]
    pub object_type: String,
    #[serde(rename = "deltaMicroSui")]
    pub delta_micro_sui: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Flags {
    #[serde(rename = "touchesDex")]
    pub touches_dex: bool,
    #[serde(rename = "touchesOracle")]
    pub touches_oracle: bool,
    #[serde(rename = "touchesLending")]
    pub touches_lending: bool,
    #[serde(rename = "isMultiHop")]
    pub is_multi_hop: bool,
}

pub struct FilteredCheckpoint {
    pub checkpoint: u64,
    pub transactions: Vec<CheckpointTx>,
}

pub async fn run(cfg: Config) -> Result<()> {
    let _filter = build_filter().await?;
    let _pusher = Pusher::new(cfg.clone());

    // Wiring placeholder. The actual implementation will:
    //   1. Resolve the starting checkpoint (from cfg or by querying Convex watermark).
    //   2. Walk checkpoints in order.
    //   3. For each checkpoint: pull transactions, run Filter, build FilteredCheckpoint, push.
    //   4. On live tail, switch to a checkpoint subscription stream.
    //
    // Implemented in week 1. Schema and contracts above are the stable
    // surface against which the rest of the system is being built.
    tracing::info!("ingest-bridge wiring placeholder; implementation lands in week 1");
    Ok(())
}

async fn build_filter() -> Result<Filter> {
    // The DEX and oracle registries are loaded from a versioned JSON file checked
    // into the repo at packages/ingest-bridge/registry/. Updates are tracked in git,
    // not in a database, so reviewers can audit which protocols the lab is watching.
    Ok(Filter {
        dex_pool_ids: Default::default(),
        oracle_ids: Default::default(),
    })
}
