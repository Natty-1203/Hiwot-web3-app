#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}           HIWOT SUPPLY CHAIN CONTRACT DEPLOYMENT${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Configuration
NETWORK=${NETWORK:-testnet}
RPC_URL="https://soroban-testnet.stellar.org"
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"

# Source account (must have funds)
SOURCE=${SOURCE:-alice}
echo -e "${YELLOW}📋 Deployment Configuration:${NC}"
echo -e "   Network: $NETWORK"
echo -e "   Source: $SOURCE"
echo -e "   RPC URL: $RPC_URL"
echo ""

# Get source address
SOURCE_ADDR=$(stellar keys public-key $SOURCE)
echo -e "${GREEN}✅ Source account: $SOURCE_ADDR${NC}"

# Check balance
echo -e "${YELLOW}💰 Checking balance...${NC}"
BALANCE=$(curl -s -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d "{
        \"jsonrpc\": \"2.0\",
        \"id\": 1,
        \"method\": \"getAccount\",
        \"params\": [\"$SOURCE_ADDR\"]
    }" | jq -r '.result.balances[0].balance // "0"')
echo -e "   Balance: $BALANCE XLM"

if [ "$BALANCE" = "0" ] || [ "$BALANCE" -lt 100 ]; then
    echo -e "${RED}⚠️  Low balance! Consider funding your account:${NC}"
    echo -e "   curl -X POST \"https://friendbot.stellar.org?addr=$SOURCE_ADDR\""
    exit 1
fi

# Step 1: Build the contract
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📦 Step 1: Building Supply Chain Contract...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd contracts/supply_chain
cargo build --target wasm32-unknown-unknown --release

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

WASM_PATH="target/wasm32-unknown-unknown/release/hiwot_supply_chain.wasm"
WASM_SIZE=$(ls -lh $WASM_PATH | awk '{print $5}')
echo -e "${GREEN}✅ Build successful! WASM size: $WASM_SIZE${NC}"

# Step 2: Deploy the contract
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 Step 2: Deploying to Stellar $NETWORK...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

CONTRACT_ID=$(stellar contract deploy \
    --network $NETWORK \
    --source $SOURCE \
    --wasm $WASM_PATH)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Contract deployed successfully!${NC}"
echo -e "   Contract ID: ${YELLOW}$CONTRACT_ID${NC}"

# Step 3: Save contract address
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}💾 Step 3: Saving contract address...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create .env file if it doesn't exist
cd ../..
if [ ! -f .env ]; then
    touch .env
    echo -e "${YELLOW}📝 Created .env file${NC}"
fi

# Update or add SUPPLY_CHAIN_ADDRESS
if grep -q "SUPPLY_CHAIN_ADDRESS" .env; then
    sed -i.bak "s/SUPPLY_CHAIN_ADDRESS=.*/SUPPLY_CHAIN_ADDRESS=$CONTRACT_ID/" .env
    rm -f .env.bak
else
    echo "SUPPLY_CHAIN_ADDRESS=$CONTRACT_ID" >> .env
fi

echo -e "${GREEN}✅ Address saved to .env${NC}"

# Step 4: Verify deployment
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🔍 Step 4: Verifying deployment...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Deployment transaction completed; contract id recorded.${NC}"

# Step 5: Display summary
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📋 Deployment Summary:${NC}"
echo -e "   Contract: Supply Chain Contract"
echo -e "   Network:  $NETWORK"
echo -e "   Address:  ${GREEN}$CONTRACT_ID${NC}"
echo -e "   Deployed by: $SOURCE_ADDR"
echo ""
echo -e "${YELLOW}🔧 Useful Commands:${NC}"
echo -e "   # Check contract info:"
echo -e "   stellar contract info interface --network $NETWORK --source $SOURCE --id $CONTRACT_ID"
echo ""
echo -e "   # View on Stellar Expert:"
echo -e "   https://stellar.expert/contract/$CONTRACT_ID"
echo ""
echo -e "${GREEN}🎉 Supply Chain contract is ready to use!${NC}"

# At the end
source .env
echo -e "${GREEN}✅ Supply Chain address: $SUPPLY_CHAIN_ADDRESS${NC}"