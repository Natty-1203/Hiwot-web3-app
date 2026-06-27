use soroban_sdk::{contracttype, Address, BytesN, Env, Symbol};

#[contracttype]
pub struct RegisterEvent {
    pub nullifier: BytesN<32>,
    pub agent: Address,
    pub timestamp: u64,
}

#[contracttype]
pub struct DeactivateEvent {
    pub nullifier: BytesN<32>,
    pub regulator: Address,
}

#[contracttype]
pub struct FamilyCreatedEvent {
    pub family_id: BytesN<32>,
    pub head: BytesN<32>,
}

#[contracttype]
pub struct FamilyMemberAddedEvent {
    pub family_id: BytesN<32>,
    pub member: BytesN<32>,
}

// Register event
pub fn registration(env: &Env, nullifier: &BytesN<32>, agent: &Address) {
    let event = RegisterEvent {
        nullifier: nullifier.clone(),
        agent: agent.clone(),
        timestamp: env.ledger().timestamp(),
    };

    env.events().publish(
        (Symbol::new(env, "register"), nullifier.clone()),
        event,
    );
}

// Deactivation event
pub fn deactivation(env: &Env, nullifier: &BytesN<32>, regulator: &Address) {
    let event = DeactivateEvent {
        nullifier: nullifier.clone(),
        regulator: regulator.clone(),
    };

    env.events().publish(
        (Symbol::new(env, "deactivate"), nullifier.clone()),
        event,
    );
}

// Family created event
pub fn family_created(env: &Env, family_id: &BytesN<32>, head: &BytesN<32>) {
    let event = FamilyCreatedEvent {
        family_id: family_id.clone(),
        head: head.clone(),
    };

    env.events().publish(
        (Symbol::new(env, "family_created"), family_id.clone()),
        event,
    );
}

// Family member added event
pub fn family_member_added(env: &Env, family_id: &BytesN<32>, member: &BytesN<32>) {
    let event = FamilyMemberAddedEvent {
        family_id: family_id.clone(),
        member: member.clone(),
    };

    env.events().publish(
        (Symbol::new(env, "family_member_added"), family_id.clone()),
        event,
    );
}