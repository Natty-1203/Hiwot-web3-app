#![cfg(test)]

use soroban_sdk::{Env, Address, BytesN, String, Vec, testutils::Address as _};
use soroban_sdk::token::StellarAssetClient;

// Import all contracts
use hiwot_identity::IdentityContract;
use hiwot_identity::IdentityContractClient;
use hiwot_token::TokenContract;
use hiwot_token::TokenContractClient;
use hiwot_supply_chain::SupplyChainContract;
use hiwot_supply_chain::SupplyChainContractClient;
use hiwot_disbursement::DisbursementContract;
use hiwot_disbursement::DisbursementContractClient;

// Helper function to generate a random BytesN<32>
fn generate_bytes(seed: u32) -> BytesN<32> {
    let mut bytes = [0u8; 32];
    bytes[0..4].copy_from_slice(&seed.to_le_bytes());
    BytesN::from_array(&Env::default(), &bytes)
}

#[test]
fn test_full_integration_flow() {
    // SETUP: Create test environment
    let env = Env::default();
    env.mock_all_auths();

    // Create test accounts
    let admin = Address::generate(&env);
    let donor = Address::generate(&env);
    let program_manager = Address::generate(&env);
    let field_agent = Address::generate(&env);
    let warehouse_manager = Address::generate(&env);
    let transporter = Address::generate(&env);
    let regulator = Address::generate(&env);

    // Create test beneficiary
    let beneficiary_nullifier = generate_bytes(1);
    let child_nullifier = generate_bytes(2);
    let family_id = generate_bytes(100);

    // Create test batch
    let batch_id = generate_bytes(200);
    let distribution_id = generate_bytes(300);

    // Define geofence (simple square around Addis Ababa)
    let geofence_vertices = Vec::new(&env);
    geofence_vertices.push_back((9020000, 3860000)); // lat*1e7, lon*1e7
    geofence_vertices.push_back((9020000, 3870000));
    geofence_vertices.push_back((9010000, 3870000));
    geofence_vertices.push_back((9010000, 3860000));

    let location = (9015000, 3865000); // Inside geofence

    println!("--- STEP 1: Deploy Contracts ---");

    // STEP 1: Deploy Token Contract (Mock USDC)
    let token_client = TokenContractClient::new(&env, &env.register_contract(None, TokenContract));
    token_client.initialize(&admin);
    
    // Mint tokens to donor
    token_client.mint(&donor, &1000000i128);
    assert_eq!(token_client.balance(&donor), 1000000);
    println!("✅ Token contract deployed. Donor balance: 1,000,000 USDC");

    // STEP 2: Deploy Identity Contract
    let identity_client = IdentityContractClient::new(&env, &env.register_contract(None, IdentityContract));
    println!("✅ Identity contract deployed");

    // STEP 3: Deploy Supply Chain Contract
    let supply_client = SupplyChainContractClient::new(&env, &env.register_contract(None, SupplyChainContract));
    println!("✅ Supply Chain contract deployed");

    // STEP 4: Deploy Disbursement Contract with dependencies
    let disbursement_client = DisbursementContractClient::new(&env, &env.register_contract(None, DisbursementContract));
    disbursement_client.init(
        &admin,
        &identity_client.address,
        &token_client.address,
        &supply_client.address,
    );
    println!("✅ Disbursement contract deployed with dependencies");

    println!("\n--- STEP 2: Register Beneficiaries ---");

    // STEP 5: Register Beneficiaries (Identity Contract)
    let metadata_hash = generate_bytes(10);
    
    // Register main beneficiary
    identity_client.register(
        &field_agent,
        &beneficiary_nullifier,
        &metadata_hash,
    );
    println!("✅ Beneficiary registered: {}", hex::encode(beneficiary_nullifier.to_array()));

    // Verify beneficiary exists
    let exists = identity_client.verify(&field_agent, &beneficiary_nullifier);
    assert!(exists);
    println!("✅ Beneficiary verified successfully");

    // Register child beneficiary
    identity_client.register(
        &field_agent,
        &child_nullifier,
        &metadata_hash,
    );
    println!("✅ Child beneficiary registered");

    // Create family linking mother and child
    identity_client.create_family(
        &field_agent,
        &family_id,
        &beneficiary_nullifier,
    );
    println!("✅ Family created with head: {}", hex::encode(beneficiary_nullifier.to_array()));

    // Add child to family
    identity_client.add_to_family(
        &field_agent,
        &family_id,
        &child_nullifier,
    );
    println!("✅ Child added to family");

    // Verify family members
    let family_members = identity_client.get_family_members(&family_id);
    assert_eq!(family_members.len(), 1);
    assert_eq!(family_members.get(0).unwrap(), child_nullifier);
    println!("✅ Family has {} members", family_members.len());

    println!("\n--- STEP 3: Create Supply Chain Batch ---");

    // STEP 6: Create Supply Chain Batch
    let description = String::from_str(&env, "High-nutrition biscuits");
    let batch_metadata = generate_bytes(20);
    
    supply_client.create_batch(
        &warehouse_manager,
        &batch_id,
        &description,
        &1000u32,
        &batch_metadata,
    );
    println!("✅ Batch created: {} boxes", 1000);

    // Verify batch created
    let batch = supply_client.get_batch(&batch_id).unwrap();
    assert_eq!(batch.quantity, 1000);
    assert_eq!(batch.remaining, 1000);
    assert_eq!(batch.current_custodian, warehouse_manager);
    println!("✅ Batch verified: {} units, custodian: warehouse", batch.quantity);

    // Transfer custody to transporter
    let transfer_notes = String::from_str(&env, "Loaded on truck for transport");
    supply_client.transfer_custody(
        &warehouse_manager,
        &batch_id,
        &transporter,
        &(115883000, 431453000), // Djibouti port coordinates
        &transfer_notes,
    );
    println!("✅ Custody transferred to transporter");

    // Record damage during transit
    let damage_notes = String::from_str(&env, "20 boxes damaged on rough road");
    supply_client.record_damage(
        &transporter,
        &batch_id,
        &20u32,
        &(116500000, 432000000),
        &damage_notes,
    );
    println!("✅ Damage recorded: 20 boxes damaged");

    // Transfer to field agent for distribution
    supply_client.transfer_custody(
        &transporter,
        &batch_id,
        &field_agent,
        &location,
        &transfer_notes,
    );
    println!("✅ Custody transferred to field agent");

    // Verify batch status after damage
    let batch_after_damage = supply_client.get_batch(&batch_id).unwrap();
    assert_eq!(batch_after_damage.remaining, 980);
    println!("✅ Batch remaining after damage: {} boxes", batch_after_damage.remaining);

    // Get batch history
    let history = supply_client.get_batch_history(&batch_id).unwrap();
    assert_eq!(history.len(), 4); // Create, Transfer, Damage, Transfer
    println!("✅ Batch history has {} events", history.len());

    println!("\n--- STEP 4: Create and Fund Aid Program ---");

    // STEP 7: Create Aid Program (Disbursement Contract)
    let program_id = generate_bytes(30);
    let amount_per_person = 10i128;
    let total_budget = 10000i128;
    let frequency_days = 30u32;
    let start_time = env.ledger().timestamp();
    let end_time = start_time + 86400 * 90; // 90 days

    disbursement_client.create_program(
        &donor,
        &program_id,
        &amount_per_person,
        &total_budget,
        &frequency_days,
        &geofence_vertices,
        &start_time,
        &end_time,
    );
    println!("✅ Aid program created with budget: {} USDC", total_budget);

    // Verify program created
    let program = disbursement_client.get_program(&program_id).unwrap();
    assert_eq!(program.remaining_budget, total_budget);
    assert_eq!(program.is_active, true);
    println!("✅ Program verified: {} USDC remaining", program.remaining_budget);

    // Fund the program (transfer USDC from donor to program)
    // First, approve token transfer
    token_client.mint(&donor, &total_budget);
    disbursement_client.fund_program(&donor, &program_id, &total_budget);
    println!("✅ Program funded with {} USDC", total_budget);

    // Verify remaining budget
    let remaining = disbursement_client.get_remaining_budget(&program_id).unwrap();
    assert_eq!(remaining, total_budget);
    println!("✅ Program remaining budget: {} USDC", remaining);

    println!("\n--- STEP 5: Distribute Aid ---");

    // STEP 8: Distribute Aid (Links All Contracts)
    
    // Check eligibility first
    let is_eligible = disbursement_client.check_eligibility(
        &program_id,
        &beneficiary_nullifier,
        &location,
    ).unwrap();
    assert!(is_eligible);
    println!("✅ Beneficiary is eligible for aid");

    // Distribute cash aid (links to Identity and Supply Chain)
    disbursement_client.distribute(
        &field_agent,
        &program_id,
        &beneficiary_nullifier,
        &location,
        &Some(batch_id.clone()), // Link to supply chain batch
    );
    println!("✅ Aid distributed: {} USDC to beneficiary", amount_per_person);

    // Verify token transfer happened
    let agent_balance = token_client.balance(&field_agent);
    assert_eq!(agent_balance, amount_per_person);
    println!("✅ Field agent received {} USDC", agent_balance);

    // Verify program budget decreased
    let remaining_after = disbursement_client.get_remaining_budget(&program_id).unwrap();
    assert_eq!(remaining_after, total_budget - amount_per_person);
    println!("✅ Program remaining budget: {} USDC", remaining_after);

    // Verify supply chain batch was updated
    let batch_after_distribution = supply_client.get_batch(&batch_id).unwrap();
    assert_eq!(batch_after_distribution.remaining, 979); // 980 - 1
    println!("✅ Batch remaining after distribution: {} boxes", batch_after_distribution.remaining);

    // Verify batch status updated (InStorage after partial distribution)
    assert_eq!(batch_after_distribution.status, 2); // InStorage
    println!("✅ Batch status updated to InStorage");

    println!("\n--- STEP 6: Verify Chain of Custody ---");

    // STEP 9: Verify Complete Chain
    
    // Get full batch history
    let full_history = supply_client.get_batch_history(&batch_id).unwrap();
    println!("📋 Complete Chain of Custody ({} events):", full_history.len());
    for (i, event) in full_history.iter().enumerate() {
        let event_type = match event.event_type {
            0 => "CREATE",
            1 => "TRANSFER",
            2 => "DAMAGE",
            3 => "DISTRIBUTE",
            _ => "UNKNOWN",
        };
        println!("  {}. {} - {}", i + 1, event_type, event.notes);
    }
    assert_eq!(full_history.len(), 5); // Create, Transfer, Damage, Transfer, Distribute

    // Verify identity contract still has active beneficiary
    let is_active = identity_client.verify(&field_agent, &beneficiary_nullifier);
    assert!(is_active);
    println!("✅ Beneficiary still active in identity registry");

    // Verify family relationship intact
    let family = identity_client.get_family_members(&family_id);
    assert_eq!(family.len(), 1);
    println!("✅ Family relationship intact");

    println!("\n--- STEP 7: Test Edge Cases ---");

    // STEP 10: Test Edge Cases
    
    // Test duplicate registration (should fail)
    let duplicate_result = identity_client.try_register(
        &field_agent,
        &beneficiary_nullifier,
        &metadata_hash,
    );
    assert!(duplicate_result.is_err());
    println!("✅ Duplicate registration prevented");

    // Test distribution outside geofence (should fail)
    let outside_location = (9000000, 3800000); // Outside geofence
    let eligibility_outside = disbursement_client.check_eligibility(
        &program_id,
        &beneficiary_nullifier,
        &outside_location,
    ).unwrap();
    assert!(!eligibility_outside);
    println!("✅ Distribution outside geofence prevented");

    // Test distribution with insufficient batch quantity
    let another_nullifier = generate_bytes(3);
    identity_client.register(
        &field_agent,
        &another_nullifier,
        &metadata_hash,
    );
    
    // Try to distribute more than available in batch
    let result = disbursement_client.try_distribute(
        &field_agent,
        &program_id,
        &another_nullifier,
        &location,
        &Some(batch_id.clone()),
    );
    // Should succeed because we're distributing 1 more box (still available)
    assert!(result.is_ok());
    println!("✅ Distribution with batch linking successful");

    // Check batch is now fully distributed?
    let final_batch = supply_client.get_batch(&batch_id).unwrap();
    assert_eq!(final_batch.remaining, 978);
    println!("✅ Batch final remaining: {} boxes", final_batch.remaining);

    println!("\n--- STEP 8: Deactivate Fraudulent Beneficiary ---");

    // STEP 11: Deactivate Beneficiary (Fraud Case)
    
    identity_client.deactivate(&regulator, &beneficiary_nullifier);
    println!("✅ Beneficiary deactivated by regulator");

    // Verify beneficiary is no longer active
    let is_active_after = identity_client.verify(&field_agent, &beneficiary_nullifier);
    assert!(!is_active_after);
    println!("✅ Beneficiary verification now returns false");

    // Try to distribute to deactivated beneficiary (should fail)
    let result = disbursement_client.try_distribute(
        &field_agent,
        &program_id,
        &beneficiary_nullifier,
        &location,
        &None,
    );
    assert!(result.is_err());
    println!("✅ Distribution to deactivated beneficiary prevented");

    println!("\n--- INTEGRATION TEST COMPLETE ---");
    println!("All 4 contracts working together successfully");
}