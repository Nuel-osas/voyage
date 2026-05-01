// Pulls mainnet checkpoints, filters, posts to Convex.
// See ADR 0001 for why this lives outside Convex.

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
        convex = %cfg.convex_ingest_url,
        ingest_version = cfg.ingest_version,
        "starting"
    );

    sui_subscriber::run(cfg).await
}
