

// #![cfg(test)]

// use super::contract::TokenContractClient;
// use crate::TokenContract;
// use soroban_sdk::{Env, Address};
// use soroban_sdk::testutils::Address as _;

// #[test]
// fn test_token() {
//     let env = Env::default();
//     env.mock_all_auths();

//     let admin = Address::generate(&env);
//     let user1 = Address::generate(&env);
//     let user2 = Address::generate(&env);

//     let contract_id = env.register(TokenContract {}, ());
//     let client = TokenContractClient::new(&env, &contract_id);

//     client.initialize(&admin);

//     client.mint(&user1, &1000);
//     assert_eq!(client.balance(&user1), 1000);

//     client.transfer(&user1, &user2, &300);
//     assert_eq!(client.balance(&user1), 700);
//     assert_eq!(client.balance(&user2), 300);
// }


#![cfg(test)]

use super::contract::TokenContractClient;
use crate::TokenContract;
use soroban_sdk::{Env, Address};
use soroban_sdk::testutils::Address as _;

// Setup helper (NO client here to avoid lifetime issues)
fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);

    (env, admin, user1, user2)
}

#[test]
fn test_mint_and_balance() {
    let (env, admin, user1, _) = setup();

    let contract_id = env.register(TokenContract {}, ());
    let client = TokenContractClient::new(&env, &contract_id);

    client.initialize(&admin);
    client.mint(&user1, &1000);

    assert_eq!(client.balance(&user1), 1000);
}

#[test]
fn test_transfer() {
    let (env, admin, user1, user2) = setup();

    let contract_id = env.register(TokenContract {}, ());
    let client = TokenContractClient::new(&env, &contract_id);

    client.initialize(&admin);

    client.mint(&user1, &1000);
    client.transfer(&user1, &user2, &300);

    assert_eq!(client.balance(&user1), 700);
    assert_eq!(client.balance(&user2), 300);
}

#[test]
fn test_multiple_transfers() {
    let (env, admin, user1, user2) = setup();

    let contract_id = env.register(TokenContract {}, ());
    let client = TokenContractClient::new(&env, &contract_id);

    client.initialize(&admin);

    client.mint(&user1, &1000);

    client.transfer(&user1, &user2, &200);
    client.transfer(&user1, &user2, &300);

    assert_eq!(client.balance(&user1), 500);
    assert_eq!(client.balance(&user2), 500);
}

#[test]
fn test_zero_balance() {
    let (env, admin, user1, _) = setup();

    let contract_id = env.register(TokenContract {}, ());
    let client = TokenContractClient::new(&env, &contract_id);

    client.initialize(&admin);

    assert_eq!(client.balance(&user1), 0);
}

#[test]
#[should_panic(expected = "Insufficient balance")]
fn test_transfer_insufficient_balance() {
    let (env, admin, user1, user2) = setup();

    let contract_id = env.register(TokenContract {}, ());
    let client = TokenContractClient::new(&env, &contract_id);

    client.initialize(&admin);

    client.mint(&user1, &100);

    // Should panic
    client.transfer(&user1, &user2, &200);
}

#[test]
fn test_total_supply_behavior() {
    let (env, admin, user1, user2) = setup();

    let contract_id = env.register(TokenContract {}, ());
    let client = TokenContractClient::new(&env, &contract_id);

    client.initialize(&admin);

    client.mint(&user1, &500);
    client.mint(&user2, &500);

    assert_eq!(client.balance(&user1), 500);
    assert_eq!(client.balance(&user2), 500);
}