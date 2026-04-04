import dotenv from 'dotenv';
dotenv.config();

function firstNonEmpty(...values) {
  const value = values.find(v => typeof v === 'string' && v.trim().length > 0);
  return value ? value.trim() : '';
}

const config = {
  port: process.env.PORT || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/hiwot',
  mockExchangeRate: Number(process.env.MOCK_EXCHANGE_RATE) || 120,
  mockBankFailureRate: Number(process.env.MOCK_BANK_FAILURE_RATE) || 0,
  mockBankDelayMs: Number(process.env.MOCK_BANK_DELAY_MS) || 800,

  stellarNetwork: process.env.STELLAR_NETWORK || 'testnet',
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org',

  // Backward-compatible aliases while migrating env variable names.
  contractId: firstNonEmpty(
    process.env.CONTRACT_ID,
    process.env.DISBURSEMENT_CONTRACT_ID,
    process.env.DISBURSEMENT_ADDRESS
  ),

  identityContractId: firstNonEmpty(process.env.IDENTITY_ADDRESS, process.env.IDENTITY_CONTRACT_ID),
  tokenContractId: firstNonEmpty(process.env.TOKEN_ADDRESS, process.env.TOKEN_CONTRACT_ID),
  supplyChainContractId: firstNonEmpty(process.env.SUPPLY_CHAIN_ADDRESS, process.env.SUPPLY_CHAIN_CONTRACT_ID),
  disbursementContractId: firstNonEmpty(
    process.env.DISBURSEMENT_ADDRESS,
    process.env.DISBURSEMENT_CONTRACT_ID,
    process.env.CONTRACT_ID
  ),

  backendSecret: firstNonEmpty(process.env.BACKEND_SECRET),
  backendPublicKey: firstNonEmpty(process.env.BACKEND_PUBLIC_KEY),
};

export default config
