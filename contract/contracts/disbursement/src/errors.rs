use soroban_sdk::contracterror;

#[contracterror]
#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(u32)] // Explicit representation for safety
pub enum Error {
    Unauthorized = 1,
    ProgramNotFound = 2,
    ProgramInactive = 3,
    InsufficientBudget = 4,
    NotEligible = 5,
    AlreadyReceived = 6,
    OutsideGeofence = 7,
    InvalidAmount = 8,
    ProgramExpired = 9,
    NotStarted = 10,
    BeneficiaryNotFound = 11,
    IdentityNotVerified = 12, // Added to handle the false return from Identity
    ProgramAlreadyExists = 13,
}