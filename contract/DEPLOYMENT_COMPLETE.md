# Hiwot Protocol - Complete Deployment Summary
## Deployed on: Thu Mar 26 12:37:44 PM EAT 2026
## Network: Testnet

## Contract Addresses

### 1. Identity Contract
- **Address**: ``
- **Explorer**: https://stellar.expert/contract/
- **Functions**: register, verify, deactivate, create_family, add_to_family, get_beneficiary, get_family_members

### 2. Token Contract (Mock USDC)
- **Address**: `CA6J2CUEOAEANNR36FDJ7NNUWBLH62XM3K62IQQYG6VWW4DZ2UH7W7HV`
- **Explorer**: https://stellar.expert/contract/CA6J2CUEOAEANNR36FDJ7NNUWBLH62XM3K62IQQYG6VWW4DZ2UH7W7HV
- **Functions**: initialize, mint, balance, transfer

### 3. Supply Chain Contract
- **Address**: `CBCRMR7WAUX3V6SO7GS2EJOVOV6UINBFTPJNJBLKUUISCYO6VBSBWFZW`
- **Explorer**: https://stellar.expert/contract/CBCRMR7WAUX3V6SO7GS2EJOVOV6UINBFTPJNJBLKUUISCYO6VBSBWFZW

### 4. Disbursement Contract
- **Address**: `CDKIQP5RENAN2GEGLM2YAX6T7ROKVHUOUBSCI2VDBNHSI7NTZXYCGBZG`
- **Explorer**: https://stellar.expert/contract/CDKIQP5RENAN2GEGLM2YAX6T7ROKVHUOUBSCI2VDBNHSI7NTZXYCGBZG

## Deployer Information
- **Account**: GAP7ZZT6AP2IMQCBIBIVEE6C77W5OAXQDWVA3RPL564L5VIOQJY2JFCG
- **Balance**: 19997.4018570 XLM

## Testing Commands

### Test Identity Contract
```bash
# Generate test data
NULLIFIER=$(openssl rand -hex 32)
METADATA_HASH=$(openssl rand -hex 32)

# Register a beneficiary
soroban contract invoke \
    --network testnet \
    --source alice \
    --id  \
    --fn register \
    --arg GAP7ZZT6AP2IMQCBIBIVEE6C77W5OAXQDWVA3RPL564L5VIOQJY2JFCG \
    --arg $NULLIFIER \
    --arg $METADATA_HASH

# Verify the beneficiary
soroban contract invoke \
    --network testnet \
    --source alice \
    --id  \
    --fn verify \
    --arg GAP7ZZT6AP2IMQCBIBIVEE6C77W5OAXQDWVA3RPL564L5VIOQJY2JFCG \
    --arg $NULLIFIER
```

### Test Token Contract
```bash
# Check token balance
soroban contract invoke \
    --network testnet \
    --source alice \
    --id CA6J2CUEOAEANNR36FDJ7NNUWBLH62XM3K62IQQYG6VWW4DZ2UH7W7HV \
    --fn balance \
    --arg GAP7ZZT6AP2IMQCBIBIVEE6C77W5OAXQDWVA3RPL564L5VIOQJY2JFCG
```

## Useful Links
- **Stellar Expert**: https://stellar.expert/explorer/testnet
- **Soroban RPC**: https://soroban-testnet.stellar.org
- **Horizon API**: https://horizon-testnet.stellar.org

## Next Steps
1. Configure cross-contract dependencies in disbursement contract
2. Set up proper authorization for contracts
3. Run integration tests
4. Document API for frontend integration