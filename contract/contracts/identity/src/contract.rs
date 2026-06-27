use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, Vec};

use crate::{
    events, storage, types::{Beneficiary, Error, Family, UserProfile, UserRole}
};

#[contract]
pub struct IdentityContract;

#[contractimpl]
impl IdentityContract {
    // Register a new beneficiary
    pub fn register(
        env: Env,
        agent: Address,
        nullifier: BytesN<32>,
        metadata_hash: BytesN<32>,
    ) -> Result<(), Error> {
        agent.require_auth();

        // Check if already registered
        if storage::exists(&env, &nullifier) {
            return Err(Error::AlreadyRegistered);
        }

        // Create beneficiary record
        let beneficiary = Beneficiary {
            nullifier: nullifier.clone(),
            registered_at: env.ledger().timestamp(),
            registered_by: agent.clone(),
            is_active: true,
            family_head: None,
            metadata_hash,
        };

        // Store
        storage::store_beneficiary(&env, &nullifier, &beneficiary);

        // Emit event
        events::registration(&env, &nullifier, &agent);

        Ok(())
    }

    // Verify if beneficiary exists and is active
    pub fn verify(
        env: Env,
        _agent: Address,
        nullifier: BytesN<32>,
    ) -> Result<bool, Error> {
        if !storage::exists(&env, &nullifier) {
            return Ok(false);
        }
        let beneficiary = storage::get_beneficiary(&env, &nullifier)?;
        Ok(beneficiary.is_active)
    }

    // Deactivate a beneficiary
    pub fn deactivate(
        env: Env,
        regulator: Address,
        nullifier: BytesN<32>,
    ) -> Result<(), Error> {
        regulator.require_auth();

        let mut beneficiary = storage::get_beneficiary(&env, &nullifier)?;
        beneficiary.is_active = false;
        storage::store_beneficiary(&env, &nullifier, &beneficiary);

        events::deactivation(&env, &nullifier, &regulator);

        Ok(())
    }

    // Create a family (for head + children)
    pub fn create_family(
        env: Env,
        agent: Address,
        family_id: BytesN<32>,
        head_nullifier: BytesN<32>,
    ) -> Result<(), Error> {
        agent.require_auth();

        if !storage::exists(&env, &head_nullifier) {
            return Err(Error::NotRegistered);
        }

        let family = Family {
            family_id: family_id.clone(),
            head: head_nullifier.clone(),
            members: Vec::new(&env),
            created_at: env.ledger().timestamp(),
        };

        storage::store_family(&env, &family_id, &family);

        // Update the head's record
        let mut head = storage::get_beneficiary(&env, &head_nullifier)?;
        head.family_head = Some(family_id.clone());
        storage::store_beneficiary(&env, &head_nullifier, &head);

        events::family_created(&env, &family_id, &head_nullifier);

        Ok(())
    }

    // Add a child to a family
    pub fn add_to_family(
        env: Env,
        agent: Address,
        family_id: BytesN<32>,
        child_nullifier: BytesN<32>,
    ) -> Result<(), Error> {
        agent.require_auth();

        let mut family = storage::get_family(&env, &family_id)?;
        family.members.push_back(child_nullifier.clone());
        storage::store_family(&env, &family_id, &family);

        let mut child = storage::get_beneficiary(&env, &child_nullifier)?;
        child.family_head = Some(family_id.clone());
        storage::store_beneficiary(&env, &child_nullifier, &child);

        events::family_member_added(&env, &family_id, &child_nullifier);

        Ok(())
    }

    // Get family members
    pub fn get_family_members(
        env: Env,
        family_id: BytesN<32>,
    ) -> Result<Vec<BytesN<32>>, Error> {
        let family = storage::get_family(&env, &family_id)?;
        Ok(family.members)
    }

    // Get beneficiary info
    pub fn get_beneficiary(
        env: Env,
        nullifier: BytesN<32>,
    ) -> Result<Beneficiary, Error> {
        storage::get_beneficiary(&env, &nullifier)
    }

    // Fetch a family by id
    pub fn fetch_family(env: Env, family_id: BytesN<32>) -> Family {
        super::storage::get_family(&env, &family_id).unwrap()
    }

    // Fetch a beneficiary by nullifier
    pub fn fetch_beneficiary(env: Env, nullifier: BytesN<32>) -> Result<Beneficiary, Error> {
        storage::get_beneficiary(&env, &nullifier)
    }

    // Check if beneficiary exists
    pub fn beneficiary_exists(env: Env, nullifier: BytesN<32>) -> bool {
        storage::exists(&env, &nullifier)
    }

    pub fn register_user(
        env: Env,
        address: Address,
        name: soroban_sdk::String,
        role: u32, // Passed as 0, 1, or 2 from JS
        organization: soroban_sdk::String,
    ) -> Result<(), Error> {
        // Ensure only the owner of the address can register themselves
        address.require_auth();

        let user_role = match role {
            0 => UserRole::Donor,
            1 => UserRole::Manager,
            2 => UserRole::Agent,
            _ => return Err(Error::Unauthorized), // Or a custom InvalidRole error
        };

        let profile = UserProfile {
            address: address.clone(),
            name,
            role: user_role,
            organization,
        };

        storage::store_user(&env, &address, &profile);
        Ok(())
    }

    pub fn get_user_profile(env: Env, address: Address) -> Result<UserProfile, Error> {
        storage::get_user(&env, &address).ok_or(Error::NotRegistered)
    }
}