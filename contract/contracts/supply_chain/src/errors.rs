use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    BatchNotFound = 1,
    BatchAlreadyExists = 2,
    NotCustodian = 3,
    InsufficientQuantity = 4,
    AlreadyDistributed = 5,
    Unauthorized = 6,
    InvalidTransfer = 7,
}