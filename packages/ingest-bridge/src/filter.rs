// Filter rules in ADR 0002.

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
            if self.dex_pool_ids.contains(obj) || self.oracle_ids.contains(obj) {
                return true;
            }
        }
        false
    }

    // Sandwich pre-filter at checkpoint scope: keep transactions sharing
    // touched objects with another sender in the same checkpoint.
    pub fn sandwich_overlap_pass(&self, txs: &[CheckpointTx]) -> Vec<bool> {
        let mut keep = vec![false; txs.len()];
        for i in 0..txs.len() {
            for j in 0..txs.len() {
                if i == j || txs[i].sender == txs[j].sender {
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
