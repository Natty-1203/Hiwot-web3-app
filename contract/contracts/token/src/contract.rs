use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    TotalSupply,
    Balance(Address),
    // Allowances are now stored using a Tuple key: (Symbol, Address, Address)
}

#[contract]
pub struct TokenContract;

#[contractimpl]
impl TokenContract {
    /// Initializes the contract with an admin. 
    /// Run this once via CLI after deployment.
    pub fn initialize(env: Env, admin: Address) {
        env.storage().persistent().set(&DataKey::Admin, &admin);
        env.storage().persistent().set(&DataKey::TotalSupply, &0i128);
    }

    /// Mints new tokens. Only the Admin can call this.
    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().persistent().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let total_supply: i128 = env.storage().persistent().get(&DataKey::TotalSupply).unwrap_or(0);
        env.storage().persistent().set(&DataKey::TotalSupply, &(total_supply + amount));

        let balance: i128 = env.storage().persistent().get(&DataKey::Balance(to.clone())).unwrap_or(0);
        env.storage().persistent().set(&DataKey::Balance(to), &(balance + amount));
    }

    /// Sets an allowance for a spender (like the Disbursement Contract).
    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, _expiration_ledger: u32) {
        from.require_auth();
        
        // Using a Tuple key (Symbol, From, Spender) to avoid VM alignment traps
        let key = (symbol_short!("allow"), from, spender);
        env.storage().persistent().set(&key, &amount);
        
        // Ensure the data stays on the ledger for testing
        env.storage().persistent().extend_ttl(&key, 5000, 10000);
    }

    /// Returns the current allowance for a spender.
    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let key = (symbol_short!("allow"), from, spender);
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    /// Moves tokens from one account to another.
    /// Supports both direct transfers and contract-to-contract calls via Auth.
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();

        let from_balance: i128 = env.storage().persistent().get(&DataKey::Balance(from.clone())).unwrap_or(0);
        if from_balance < amount {
            panic!("Insufficient balance");
        }

        // Deduct from sender
        env.storage().persistent().set(&DataKey::Balance(from), &(from_balance - amount));

        // Add to recipient
        let to_balance: i128 = env.storage().persistent().get(&DataKey::Balance(to.clone())).unwrap_or(0);
        env.storage().persistent().set(&DataKey::Balance(to), &(to_balance + amount));
    }

    /// Returns the balance of a specific account.
    pub fn balance(env: Env, account: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Balance(account)).unwrap_or(0)
    }
}