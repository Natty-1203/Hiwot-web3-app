use soroban_sdk::{contracttype, contracterror, BytesN, Address, Vec};

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Beneficiary {
    pub nullifier: BytesN<32>,
    pub registered_at: u64,
    pub registered_by: Address,
    pub is_active: bool,
    pub family_head: Option<BytesN<32>>,
    pub metadata_hash: BytesN<32>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Family {
    pub family_id: BytesN<32>,
    pub head: BytesN<32>,
    pub members: Vec<BytesN<32>>, 
    pub created_at: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyRegistered = 1,
    NotRegistered = 2,
    Unauthorized = 3,
    Inactive = 4,
    FamilyNotFound = 5,
    AlreadyInFamily = 6,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[contracttype]
#[repr(u32)]
pub enum UserRole {
    Donor = 0,
    Manager = 1,
    Agent = 2,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct UserProfile {
    pub address: Address,
    pub name: soroban_sdk::String,
    pub role: UserRole,
    pub organization: soroban_sdk::String,
}