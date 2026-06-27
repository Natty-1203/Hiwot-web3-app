use soroban_sdk::{contract, contractimpl, symbol_short, Address, BytesN, Env, Vec, Bytes};

use crate::types::{AidProgram, Distribution, Location};
use crate::storage;
use crate::geofence;
use crate::events;
use crate::errors::Error;

use crate::IdentityClient;
use crate::TokenClient;
use crate::SupplyChainClient;

#[contract]
pub struct DisbursementContract;

#[contractimpl]
impl DisbursementContract {
    pub fn init(env: Env, admin: Address, identity: Address, token: Address, supply: Address) {
        if storage::has_admin(&env) {
            panic!("already initialized");
        }
        admin.require_auth();
        storage::set_admin(&env, &admin);
        storage::set_identity(&env, &identity);
        storage::set_token(&env, &token);
        storage::set_supply(&env, &supply);
    }

    pub fn create_program(
        env: Env,
        donor: Address,
        program_id: BytesN<32>,
        amount_per_person: i128,
        total_budget: i128,
        frequency_days: u32,
        geofence_vertices: Vec<Location>,
        start_time: u64,
        end_time: u64,
    ) -> Result<(), Error> {
        donor.require_auth();

        if storage::get_program(&env, &program_id).is_some() {
            return Err(Error::ProgramAlreadyExists);
        }

        if amount_per_person <= 0
            || total_budget <= 0
            || total_budget < amount_per_person
            || start_time >= end_time
            || geofence_vertices.len() < 3
        {
            return Err(Error::InvalidAmount);
        }

        let token_addr = storage::get_token(&env);
        let token_client = TokenClient::new(&env, &token_addr);

        token_client.transfer(&donor, &env.current_contract_address(), &total_budget);

        let program = AidProgram {
            program_id: program_id.clone(),
            donor: donor.clone(),
            manager: donor.clone(),
            token: token_addr,
            total_budget,
            remaining_budget: total_budget,
            amount_per_person,
            frequency_days,
            is_active: true,
            geofence_vertices,
            start_time,
            end_time,
        };

        storage::save_program(&env, program_id.clone(), &program);
        events::emit_program_created(&env, program_id, donor, total_budget, amount_per_person);
        Ok(())
    }

    pub fn fund_program(
        env: Env,
        donor: Address,
        program_id: BytesN<32>,
        amount: i128,
    ) -> Result<(), Error> {
        donor.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let mut program = storage::get_program(&env, &program_id).ok_or(Error::ProgramNotFound)?;
        if program.donor != donor {
            return Err(Error::Unauthorized);
        }

        let token_addr = storage::get_token(&env);
        let token_client = TokenClient::new(&env, &token_addr);
        token_client.transfer(&donor, &env.current_contract_address(), &amount);

        let new_total = program.total_budget.checked_add(amount).ok_or(Error::InvalidAmount)?;
        let new_remaining = program
            .remaining_budget
            .checked_add(amount)
            .ok_or(Error::InvalidAmount)?;

        program.total_budget = new_total;
        program.remaining_budget = new_remaining;
        storage::save_program(&env, program_id.clone(), &program);

        events::emit_program_funded(&env, program_id, donor, amount, new_remaining);
        Ok(())
    }

    pub fn distribute(
        env: Env,
        agent: Address,
        program_id: BytesN<32>,
        nullifier: BytesN<32>,
        location: Location,
        batch_id: Option<BytesN<32>>,
    ) -> Result<(), Error> {
        agent.require_auth();

        // Debug Event
        env.events().publish((symbol_short!("DB_START"),), symbol_short!("INIT"));

        let identity_addr = storage::get_identity(&env);
        let identity_client = IdentityClient::new(&env, &identity_addr);
        
        // Verify identity, return error if not verified
        let is_verified = identity_client.verify(&agent, &nullifier);
        
        if is_verified == false {
            return Err(Error::IdentityNotVerified);
        }

        // Check Eligibility (Time, Budget, Geofence, Frequency)
        // Note: Passing location by value since it's Copy
        let eligible = Self::check_eligibility(env.clone(), program_id.clone(), nullifier.clone(), location)?;
        if !eligible {
            return Err(Error::NotEligible);
        }

        let mut program = storage::get_program(&env, &program_id).ok_or(Error::ProgramNotFound)?;
        let amount = program.amount_per_person;

        if program.remaining_budget < amount {
            return Err(Error::InsufficientBudget);
        }

        // Token Transfer
        let token_addr = storage::get_token(&env);
        let token_client = TokenClient::new(&env, &token_addr);
        // token_client.transfer(&program.donor, &agent, &amount);
        token_client.transfer(&env.current_contract_address(), &agent, &amount);
        // Generate Distribution ID
        let mut data = Bytes::new(&env);
        data.append(&program_id.clone().into());
        data.append(&nullifier.clone().into());
        data.extend_from_slice(&env.ledger().timestamp().to_be_bytes());
        let distribution_id: BytesN<32> = env.crypto().sha256(&data).into();

        let distribution = Distribution {
            distribution_id: distribution_id.clone(),
            program_id: program_id.clone(),
            nullifier: nullifier.clone(),
            amount,
            timestamp: env.ledger().timestamp(),
            location,
            distributed_by: agent.clone(),
            batch_id: batch_id.clone(),
        };

        // Update State
        program.remaining_budget -= amount;
        storage::save_program(&env, program_id.clone(), &program);
        storage::save_distribution(&env, &distribution);
        storage::update_last_distribution_time(&env, &program_id, &nullifier, env.ledger().timestamp());

        // Supply Chain Integration
        if let Some(batch) = batch_id {
            let supply_addr = storage::get_supply(&env);
            let supply_client = SupplyChainClient::new(&env, &supply_addr);
            
            // Scaled coordinates for the supply chain (expects i32)
            let lat_i32 = (location.lat / 1) as i32; 
            let lon_i32 = (location.lon / 1) as i32;

            supply_client.link_to_distribution(
                &agent,
                &batch,
                &distribution_id,
                &nullifier,
                &1u32, 
                &(lat_i32, lon_i32),
            );
        }

        events::emit_distribution(&env, distribution_id, program_id, nullifier, amount, location, agent);
        env.events().publish((symbol_short!("DB_END"),), symbol_short!("SUCCESS"));
        
        Ok(())
    }

    pub fn check_eligibility(env: Env, program_id: BytesN<32>, nullifier: BytesN<32>, location: Location) -> Result<bool, Error> {
        let program = storage::get_program(&env, &program_id).ok_or(Error::ProgramNotFound)?;
        if !program.is_active { return Ok(false); }
        
        let current_time = env.ledger().timestamp();
        if current_time < program.start_time || current_time > program.end_time { return Ok(false); }
        if program.remaining_budget < program.amount_per_person { return Ok(false); }
        
        // Geofence check using the struct-compatible function
        if !geofence::point_in_polygon(location, program.geofence_vertices) { 
            return Err(Error::OutsideGeofence); 
        }

        if let Some(last_time) = storage::get_last_distribution_time(&env, &program_id, &nullifier) {
            if (current_time - last_time) / 86400 < program.frequency_days as u64 { 
                return Err(Error::AlreadyReceived); 
            }
        }
        Ok(true)
    }

    pub fn get_program(env: Env, program_id: BytesN<32>) -> Result<AidProgram, Error> {
        storage::get_program(&env, &program_id).ok_or(Error::ProgramNotFound)
    }

    pub fn get_remaining_budget(env: Env, program_id: BytesN<32>) -> Result<i128, Error> {
        let program = Self::get_program(env, program_id)?;
        Ok(program.remaining_budget)
    }

    pub fn get_claim_status(env: Env, program_id: BytesN<32>, nullifier: BytesN<32>) -> Result<bool, Error> {
        if storage::get_program(&env, &program_id).is_none() {
            return Ok(false);
        }

        Ok(storage::get_last_distribution_time(&env, &program_id, &nullifier).is_some())
    }
}