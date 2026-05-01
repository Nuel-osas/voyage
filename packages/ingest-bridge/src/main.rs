//! ingest-bridge: filter Sui mainnet checkpoints and push relevant transactions
//! to the lab's Convex backend.
//!
//! See ADR 0001 for why filtering happens here and not in Convex, and ADR 0002
//! for the filter criteria themselves.

mod config;
mod filter;
mod push;
mod sui_subscriber;

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt::init();
    let cfg = config::load()?;

    tracing::info!(
        sui_rpc = %cfg.sui_rpc_url,
        convex_endpoint = %cfg.convex_ingest_url,
        ingest_version = cfg.ingest_version,
        "starting ingest-bridge"
    );

    sui_subscriber::run(cfg).await
}
