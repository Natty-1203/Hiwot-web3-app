use soroban_sdk::{Address, Bytes, BytesN, Env, String, Vec, contract, contractimpl};
use crate::types::*;
use crate::storage::*;
use crate::errors::Error;
use crate::events::*;

fn generate_event_id(env: &Env, batch_id: &BytesN<32>, event_type: u32, nonce: u32) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.append(&Bytes::from(batch_id));
    data.extend_from_slice(&env.ledger().timestamp().to_be_bytes());
    data.extend_from_slice(&event_type.to_be_bytes());
    data.extend_from_slice(&nonce.to_be_bytes());
    env.crypto().sha256(&data).into()
}

#[contract]
pub struct SupplyChainContract;

#[contractimpl]
impl SupplyChainContract {

    // CREATE BATCH
    pub fn create_batch(
        env: Env,
        creator: Address,
        batch_id: BytesN<32>,
        description: String,
        quantity: u32,
        metadata_hash: BytesN<32>,
    ) -> Result<(), Error> {
        creator.require_auth();

        if batch_exists(&env, &batch_id) {
            return Err(Error::BatchAlreadyExists);
        }

        let nonce = get_events(&env, &batch_id).len();
        let event_id = generate_event_id(&env, &batch_id, 0, nonce);

        let batch = Batch {
            batch_id: batch_id.clone(),
            description,
            quantity,
            remaining: quantity,
            created_at: env.ledger().timestamp(),
            created_by: creator.clone(),
            current_custodian: creator.clone(),
            status: 0, // Created
            metadata_hash,
        };

        // Create initial custody event
        let event = CustodyEvent {
            batch_id: batch_id.clone(),
            event_id,
            event_type: 0, // Create
            from: None,
            to: Some(creator.clone()),
            quantity_change: quantity as i32,
            quantity_new: quantity,
            location: (0, 0),
            timestamp: env.ledger().timestamp(),
            signed_by: creator.clone(),
            notes: String::from_str(&env, "Batch created"),
        };

        save_batch(&env, &batch);
        save_event(&env, &batch_id, event);
        
        batch_created(&env, batch_id, creator);

        Ok(())
    }

    // TRANSFER CUSTODY
    pub fn transfer_custody(
        env: Env,
        sender: Address,
        batch_id: BytesN<32>,
        new_custodian: Address,
        location: (i32, i32),
        notes: String,
    ) -> Result<(), Error> {
        sender.require_auth();

        let mut batch = get_batch(&env, &batch_id).ok_or(Error::BatchNotFound)?;

        if batch.current_custodian != sender {
            return Err(Error::NotCustodian);
        }

        // Update status to InTransit if it was Created
        if batch.status == 0 {
            batch.status = 1; // InTransit
        }

        let nonce = get_events(&env, &batch_id).len();
        let event_id = generate_event_id(&env, &batch_id, 1, nonce);

        // Create custody transfer event
        let event = CustodyEvent {
            batch_id: batch_id.clone(),
            event_id,
            event_type: 1, // Transfer
            from: Some(batch.current_custodian.clone()),
            to: Some(new_custodian.clone()),
            quantity_change: 0,
            quantity_new: batch.remaining,
            location,
            timestamp: env.ledger().timestamp(),
            signed_by: sender.clone(),
            notes,
        };

        // Update batch
        batch.current_custodian = new_custodian.clone();
        
        save_batch(&env, &batch);
        save_event(&env, &batch_id, event);
        
        custody_transferred(&env, batch_id, sender, new_custodian);

        Ok(())
    }

    // RECORD DAMAGE
    pub fn record_damage(
        env: Env,
        custodian: Address,
        batch_id: BytesN<32>,
        damaged_quantity: u32,
        location: (i32, i32),
        notes: String,
    ) -> Result<(), Error> {
        custodian.require_auth();

        let mut batch = get_batch(&env, &batch_id).ok_or(Error::BatchNotFound)?;

        // Verify caller is current custodian
        if batch.current_custodian != custodian {
            return Err(Error::NotCustodian);
        }

        // Verify enough quantity
        if damaged_quantity > batch.remaining {
            return Err(Error::InsufficientQuantity);
        }

        // Update remaining quantity
        let new_remaining = batch.remaining - damaged_quantity;
        batch.remaining = new_remaining;

        let nonce = get_events(&env, &batch_id).len();
        let event_id = generate_event_id(&env, &batch_id, 2, nonce);

        // Create damage event
        let event = CustodyEvent {
            batch_id: batch_id.clone(),
            event_id,
            event_type: 2, // Damage
            from: Some(batch.current_custodian.clone()),
            to: None,
            quantity_change: -(damaged_quantity as i32),
            quantity_new: new_remaining,
            location,
            timestamp: env.ledger().timestamp(),
            signed_by: custodian.clone(),
            notes,
        };

        // Update status if fully damaged/distributed
        if new_remaining == 0 {
            batch.status = 3; // Distributed
        }

        save_batch(&env, &batch);
        save_event(&env, &batch_id, event);
        
        damage_recorded(&env, batch_id, damaged_quantity, location);

        Ok(())
    }

    // LINK TO DISTRIBUTION
    pub fn link_to_distribution(
        env: Env,
        custodian: Address,
        batch_id: BytesN<32>,
        distribution_id: BytesN<32>,
        nullifier: BytesN<32>,
        quantity: u32,
        location: (i32, i32),
    ) -> Result<(), Error> {
        custodian.require_auth();

        let mut batch = get_batch(&env, &batch_id)
            .ok_or(Error::BatchNotFound)?;

        if batch.current_custodian != custodian {
            return Err(Error::NotCustodian);
        }

        if quantity > batch.remaining {
            return Err(Error::InsufficientQuantity);
        }

        let new_remaining = batch.remaining - quantity;
        batch.remaining = new_remaining;

        if new_remaining == 0 {
            batch.status = 3;
        } else {
            batch.status = 2;
        }

        let nonce = get_events(&env, &batch_id).len();
        let mut data = Bytes::new(&env);
        data.append(&Bytes::from(&batch_id));
        data.append(&Bytes::from(&distribution_id));
        data.extend_from_slice(&env.ledger().timestamp().to_be_bytes());
        data.extend_from_slice(&nonce.to_be_bytes());

        let hash = env.crypto().sha256(&data);
        let event_id: BytesN<32> = hash.into();

        let notes = String::from_str(&env, "distribution recorded");
        let event = CustodyEvent {
            batch_id: batch_id.clone(),
            event_id,
            event_type: 3,
            from: Some(batch.current_custodian.clone()),
            to: None,
            quantity_change: -(quantity as i32),
            quantity_new: new_remaining,
            location,
            timestamp: env.ledger().timestamp(),
            signed_by: custodian.clone(),
            notes,
        };

        save_batch(&env, &batch);
        save_event(&env, &batch_id, event);

        batch_distributed(&env, batch_id, distribution_id, nullifier, quantity);

        Ok(())
    }

    // GET BATCH
    pub fn get_batch(
        env: Env,
        batch_id: BytesN<32>,
    ) -> Result<Batch, Error> {
        get_batch(&env, &batch_id).ok_or(Error::BatchNotFound)
    }

    // GET BATCH HISTORY
    pub fn get_batch_history(
        env: Env,
        batch_id: BytesN<32>,
    ) -> Result<Vec<CustodyEvent>, Error> {
        // Verify batch exists first
        if !batch_exists(&env, &batch_id) {
            return Err(Error::BatchNotFound);
        }
        
        Ok(get_events(&env, &batch_id))
    }

    // GET REMAINING QUANTITY
    pub fn get_remaining_quantity(
        env: Env,
        batch_id: BytesN<32>,
    ) -> Result<u32, Error> {
        let batch = get_batch(&env, &batch_id).ok_or(Error::BatchNotFound)?;
        Ok(batch.remaining)
    }

    // CHECK IF BATCH EXISTS
    pub fn batch_exists(
        env: Env,
        batch_id: BytesN<32>,
    ) -> bool {
        batch_exists(&env, &batch_id)
    }
}