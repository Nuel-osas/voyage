// Loaded once at startup. Every dial is one env var.

use anyhow::{Context, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub sui_rpc_url: String,
    pub convex_ingest_url: String,
    pub convex_ingest_secret: String,
    pub ingest_version: u32,
    pub start_checkpoint: Option<u64>,
}

pub fn load() -> Result<Config> {
    Ok(Config {
        sui_rpc_url: env_required("SUI_RPC_URL")?,
        convex_ingest_url: env_required("CONVEX_INGEST_URL")?,
        convex_ingest_secret: env_required("CONVEX_INGEST_SECRET")?,
        ingest_version: std::env::var("INGEST_VERSION")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(1),
        start_checkpoint: std::env::var("START_CHECKPOINT")
            .ok()
            .and_then(|s| s.parse().ok()),
    })
}

fn env_required(name: &str) -> Result<String> {
    std::env::var(name).with_context(|| format!("missing env var {name}"))
}
