// Idempotency on the Convex side keys on (digest, ingest_version), so retries
// here are safe.

use crate::config::Config;
use crate::sui_subscriber::FilteredCheckpoint;
use anyhow::{Context, Result};
use reqwest::Client;

pub struct Pusher {
    client: Client,
    cfg: Config,
}

impl Pusher {
    pub fn new(cfg: Config) -> Self {
        Self { client: Client::new(), cfg }
    }

    pub async fn push(&self, ckpt: &FilteredCheckpoint) -> Result<()> {
        let body = serde_json::json!({
            "checkpoint": ckpt.checkpoint,
            "transactions": ckpt.transactions,
            "ingestVersion": self.cfg.ingest_version,
        });

        let resp = self
            .client
            .post(&self.cfg.convex_ingest_url)
            .header("x-ingest-secret", &self.cfg.convex_ingest_secret)
            .json(&body)
            .send()
            .await
            .context("push failed")?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("ingest rejected: {status} {text}");
        }
        Ok(())
    }
}
