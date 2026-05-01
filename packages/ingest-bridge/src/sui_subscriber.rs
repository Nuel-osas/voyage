// Single async task pulls checkpoints, filters, hands off to the pusher.
// Sui's cadence is well within what one task can handle and serializing
// keeps writes in order downstream. Backfill (replay older checkpoints)
// is the same loop with a different starting point.

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

    // Wiring placeholder. Lands week 1:
    //   - resolve start checkpoint from cfg or watermark
    //   - walk checkpoints in order, pull, filter, push
    //   - on tail, switch to subscription
    tracing::info!("subscriber wiring placeholder");
    Ok(())
}

async fn build_filter() -> Result<Filter> {
    // DEX/oracle registries are versioned JSON in packages/ingest-bridge/registry/.
    // Updates land via PR so reviewers can audit which protocols we're watching.
    Ok(Filter {
        dex_pool_ids: Default::default(),
        oracle_ids: Default::default(),
    })
}
