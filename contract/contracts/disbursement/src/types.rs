

use soroban_sdk::{contracttype, Address, BytesN, Vec};

// let (lat, lon) = location;
// (lat as i32, lon as i32)

#[contracttype]
#[derive(Clone, Debug, Copy)] // Added Copy for easier handling
pub struct Location {
    pub lat: i128,
    pub lon: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct AidProgram {
    pub program_id: BytesN<32>,
    pub donor: Address,
    pub manager: Address,
    pub token: Address,
    pub total_budget: i128,
    pub remaining_budget: i128,
    pub amount_per_person: i128,
    pub frequency_days: u32,
    pub is_active: bool,
    pub geofence_vertices: Vec<Location>,
    pub start_time: u64,
    pub end_time: u64,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Distribution {
    pub distribution_id: BytesN<32>,
    pub program_id: BytesN<32>,
    pub nullifier: BytesN<32>,
    pub amount: i128,
    pub timestamp: u64,
    pub location: Location,
    pub distributed_by: Address,
    pub batch_id: Option<BytesN<32>>,
}