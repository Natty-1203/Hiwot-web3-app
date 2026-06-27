#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}              HIWOT IDENTITY CONTRACT DEPLOYMENT${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Configuration
NETWORK=${NETWORK:-testnet}
SOURCE=${SOURCE:-alice}

echo -e "${YELLOW}📋 Deployment Configuration:${NC}"
echo -e "   Network: $NETWORK"
echo -e "   Source: $SOURCE"
echo ""

# Get source address
echo -e "${YELLOW}🔍 Getting source account address...${NC}"
SOURCE_ADDR=$(stellar keys public-key $SOURCE)
echo -e "${GREEN}✅ Source account: $SOURCE_ADDR${NC}"

# Check balance using Horizon API
echo -e "${YELLOW}💰 Checking balance...${NC}"

# Make the Horizon API call and save to temp file
HORIZON_RESPONSE=$(curl -s "https://horizon-testnet.stellar.org/accounts/$SOURCE_ADDR")

# Check if account exists
if echo "$HORIZON_RESPONSE" | grep -q '"id":'; then
    # Extract balance - try multiple methods
    if command -v jq &> /dev/null; then
        # Use jq if available
        BALANCE=$(echo "$HORIZON_RESPONSE" | jq -r '.balances[] | select(.asset_type=="native") | .balance' 2>/dev/null)
    else
        # Fallback to grep/sed
        BALANCE=$(echo "$HORIZON_RESPONSE" | grep -o '"balance":"[0-9.]*"' | head -1 | cut -d'"' -f4)
    fi
    
    if [ -z "$BALANCE" ] || [ "$BALANCE" = "null" ]; then
        BALANCE="0"
    fi
    
    echo -e "   Balance: $BALANCE XLM"
    
    # Check if balance is sufficient
    BALANCE_INT=$(echo "$BALANCE" | cut -d'.' -f1)
    if [ -z "$BALANCE_INT" ]; then
        BALANCE_INT=0
    fi
    
    if [ "$BALANCE_INT" -lt 100 ]; then
        echo -e "${RED}⚠️  Insufficient balance! Need at least 100 XLM${NC}"
        echo -e "${YELLOW}💡 Fund your account:${NC}"
        echo -e "   curl -X POST \"https://friendbot.stellar.org?addr=$SOURCE_ADDR\""
        exit 1
    fi
    
    echo -e "${GREEN}✅ Sufficient balance found!${NC}"
else
    echo -e "${RED}⚠️  Account not found on testnet!${NC}"
    echo -e "${YELLOW}💡 Fund your account:${NC}"
    echo -e "   curl -X POST \"https://friendbot.stellar.org?addr=$SOURCE_ADDR\""
    exit 1
fi

# Step 1: Build the contract
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}📦 Step 1: Building Identity Contract...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

cargo build --target wasm32-unknown-unknown --release -p hiwot-identity

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi

WASM_PATH="target/wasm32-unknown-unknown/release/hiwot_identity.wasm"
if [ ! -f "$WASM_PATH" ]; then
    echo -e "${RED}❌ WASM file not found at $WASM_PATH${NC}"
    exit 1
fi

WASM_SIZE=$(ls -lh "$WASM_PATH" | awk '{print $5}')
echo -e "${GREEN}✅ Build successful! WASM size: $WASM_SIZE${NC}"

# Step 2: Deploy the contract
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}🚀 Step 2: Deploying to Stellar $NETWORK...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "${YELLOW}Deploying contract...${NC}"
CONTRACT_ID=$(stellar contract deploy \
    --network $NETWORK \
    --source $SOURCE \
    --wasm "$WASM_PATH" 2>&1)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Deployment failed!${NC}"
    echo "Error: $CONTRACT_ID"
    exit 1
fi

CONTRACT_ID=$(echo "$CONTRACT_ID" | tr -d '[:space:]' | tail -1)
echo -e "${GREEN}✅ Contract deployed successfully!${NC}"
echo -e "   Contract ID: ${YELLOW}$CONTRACT_ID${NC}"

# Step 3: Save contract address
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}💾 Step 3: Saving contract address...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ ! -f .env ]; then
    touch .env
    echo "# Hiwot Contract Addresses" > .env
    echo "" >> .env
fi

if grep -q "^IDENTITY_ADDRESS=" .env; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^IDENTITY_ADDRESS=.*|IDENTITY_ADDRESS=$CONTRACT_ID|" .env
    else
        sed -i "s|^IDENTITY_ADDRESS=.*|IDENTITY_ADDRESS=$CONTRACT_ID|" .env
    fi
else
    echo "IDENTITY_ADDRESS=$CONTRACT_ID" >> .env
fi

echo -e "${GREEN}✅ Address saved to .env${NC}"

# Summary
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📋 Deployment Summary:${NC}"
echo -e "   Contract: Identity Contract"
echo -e "   Network:  $NETWORK"
echo -e "   Address:  ${GREEN}$CONTRACT_ID${NC}"
echo -e "   Deployer: $SOURCE_ADDR"
echo ""
echo -e "${YELLOW}🔧 View on Stellar Expert:${NC}"
echo -e "   https://stellar.expert/contract/$CONTRACT_ID"
echo ""
echo -e "${GREEN}🎉 Identity contract is ready to use!${NC}"