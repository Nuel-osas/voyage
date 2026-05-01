//! Filter logic.
//!
//! A transaction passes the filter and is forwarded to Convex if and only if
//! at least one of:
//!
//! - It mutates a shared object.
//! - It touches a known DEX pool object.
//! - It touches a known oracle object.
//! - It is one of multiple transactions in the same checkpoint with overlapping
//!   touched-object sets and distinct senders (sandwich-shape signature).
//!
//! See ADR 0002.

use crate::sui_subscriber::CheckpointTx;

pub struct Filter {
    pub dex_pool_ids: std::collections::HashSet<String>,
    pub oracle_ids: std::collections::HashSet<String>,
}

impl Filter {
    pub fn passes(&self, tx: &CheckpointTx) -> bool {
        if !tx.shared_object_mutations.is_empty() {
            return true;
        }
        for obj in &tx.touched_objects {
            if self.dex_pool_ids.contains(obj) {
                return true;
            }
            if self.oracle_ids.contains(obj) {
                return true;
            }
        }
        false
    }

    /// Sandwich-shape pre-filter applied at checkpoint level: keep transactions
    /// that share touched objects with at least one other transaction in the
    /// same checkpoint by a different sender.
    pub fn sandwich_overlap_pass(&self, txs: &[CheckpointTx]) -> Vec<bool> {
        let mut keep = vec![false; txs.len()];
        for i in 0..txs.len() {
            for j in 0..txs.len() {
                if i == j {
                    continue;
                }
                if txs[i].sender == txs[j].sender {
                    continue;
                }
                if has_overlap(&txs[i].touched_objects, &txs[j].touched_objects) {
                    keep[i] = true;
                    break;
                }
            }
        }
        keep
    }
}

fn has_overlap(a: &[String], b: &[String]) -> bool {
    let set: std::collections::HashSet<&String> = a.iter().collect();
    b.iter().any(|x| set.contains(x))
}
