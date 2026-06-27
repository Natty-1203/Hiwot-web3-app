use soroban_sdk::{contracttype, Address, BytesN, String};

pub type BatchId = BytesN<32>;
pub type DistributionId = BytesN<32>;
pub type Nullifier = BytesN<32>;
pub type Location = (i32, i32);

#[contracttype]
#[derive(Clone)]
pub struct Batch {
    pub batch_id: BatchId,
    pub description: String,
    pub quantity: u32,
    pub remaining: u32,
    pub created_at: u64,
    pub created_by: Address,
    pub current_custodian: Address,
    pub status: u32, // 0=Created, 1=InTransit, 2=InStorage, 3=Distributed
    pub metadata_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone)]
pub struct CustodyEvent {
    pub batch_id: BatchId,
    pub event_id: BytesN<32>,
    pub event_type: u32, // 0=Create, 1=Transfer, 2=Damage, 3=Distribute
    pub from: Option<Address>,
    pub to: Option<Address>,
    pub quantity_change: i32,
    pub quantity_new: u32,
    pub location: Location,
    pub timestamp: u64,
    pub signed_by: Address,
    pub notes: String,
}

#[contracttype]
#[derive(Clone)]
pub struct DistributionLink {
    pub distribution_id: DistributionId,
    pub nullifier: Nullifier,
    pub quantity: u32,
    pub timestamp: u64,
}