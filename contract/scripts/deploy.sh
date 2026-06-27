#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}              HIWOT PROTOCOL - FULL DEPLOYMENT${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Configuration
NETWORK=${NETWORK:-testnet}
SOURCE=${SOURCE:-alice}
DEPLOY_TOKEN=${DEPLOY_TOKEN:-true}
DEPLOY_IDENTITY=${DEPLOY_IDENTITY:-true}
DEPLOY_SUPPLY_CHAIN=${DEPLOY_SUPPLY_CHAIN:-true}
DEPLOY_DISBURSEMENT=${DEPLOY_DISBURSEMENT:-true}
SKIP_CONFIRMATION=${SKIP_CONFIRMATION:-false}

echo -e "${YELLOW}📋 Deployment Configuration:${NC}"
echo -e "   Network: $NETWORK"
echo -e "   Source: $SOURCE"
echo -e "   Deploy Token: $DEPLOY_TOKEN"
echo -e "   Deploy Identity: $DEPLOY_IDENTITY"
echo -e "   Deploy Supply Chain: $DEPLOY_SUPPLY_CHAIN"
echo -e "   Deploy Disbursement: $DEPLOY_DISBURSEMENT"
echo ""

# Get source address
SOURCE_ADDR=$(stellar keys public-key $SOURCE 2>/dev/null || echo "unknown")
echo -e "${GREEN}✅ Source account: $SOURCE_ADDR${NC}"

# Check if .env exists, create if not
if [ ! -f .env ]; then
    echo -e "${YELLOW}📝 Creating .env file...${NC}"
    touch .env
    echo "# Hiwot Contract Addresses" > .env
    echo "# Generated on $(date)" >> .env
    echo "" >> .env
fi

# Load existing addresses if any
source .env 2>/dev/null || true

# Function to update .env
update_env() {
    local key=$1
    local value=$2
    if grep -q "^$key=" .env; then
        sed -i.bak "s|^$key=.*|$key=$value|" .env
        rm -f .env.bak
    else
        echo "$key=$value" >> .env
    fi
}

# Function to wait for user confirmation
confirm() {
    if [ "$SKIP_CONFIRMATION" = "true" ]; then
        return 0
    fi
    read -p "Continue? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
}

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}           DEPLOYMENT ORDER${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "   1. Token Contract (Mock USDC) - No dependencies"
echo -e "   2. Identity Contract - No dependencies"
echo -e "   3. Supply Chain Contract - No dependencies"
echo -e "   4. Disbursement Contract - Depends on Token, Identity, Supply Chain"
echo ""

if [ "$SKIP_CONFIRMATION" != "true" ]; then
    echo -e "${YELLOW}⚠️  Important: Disbursement contract requires addresses of other contracts${NC}"
    echo -e "${YELLOW}   Make sure to deploy Token, Identity, and Supply Chain first!${NC}"
    echo ""
    confirm
fi

# Counter for successful deployments
SUCCESS_COUNT=0
FAILED_COUNT=0

# ============================================================
# STEP 1: Deploy Token Contract
# ============================================================
if [ "$DEPLOY_TOKEN" = "true" ]; then
    echo -e "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}           STEP 1: TOKEN CONTRACT (Mock USDC)${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [ -f scripts/deploy_token.sh ]; then
        echo -e "${YELLOW}🚀 Running deploy_token.sh...${NC}"
        
        # Run token deployment and capture output
        # We need to run it in a way that doesn't exit on error
        set +e
        ./scripts/deploy_token.sh
        DEPLOY_EXIT=$?
        set -e
        
        if [ $DEPLOY_EXIT -eq 0 ]; then
            echo -e "${GREEN}✅ Token contract deployed successfully!${NC}"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            
            # Reload .env to get the new address
            source .env
            echo -e "   Address: ${GREEN}$TOKEN_ADDRESS${NC}"
        else
            echo -e "${RED}❌ Token contract deployment failed!${NC}"
            FAILED_COUNT=$((FAILED_COUNT + 1))
            if [ "$SKIP_CONFIRMATION" != "true" ]; then
                echo -e "${RED}Aborting deployment due to failure.${NC}"
                exit 1
            fi
        fi
    else
        echo -e "${RED}❌ deploy_token.sh not found!${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
else
    echo -e "\n${YELLOW}⏭️  Skipping Token contract deployment${NC}"
fi

# ============================================================
# STEP 2: Deploy Identity Contract
# ============================================================
if [ "$DEPLOY_IDENTITY" = "true" ]; then
    echo -e "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}           STEP 2: IDENTITY CONTRACT${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [ -f scripts/deploy_identity.sh ]; then
        echo -e "${YELLOW}🚀 Running deploy_identity.sh...${NC}"
        
        set +e
        ./scripts/deploy_identity.sh
        DEPLOY_EXIT=$?
        set -e
        
        if [ $DEPLOY_EXIT -eq 0 ]; then
            echo -e "${GREEN}✅ Identity contract deployed successfully!${NC}"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            
            # Reload .env to get the new address
            source .env
            echo -e "   Address: ${GREEN}$IDENTITY_ADDRESS${NC}"
        else
            echo -e "${RED}❌ Identity contract deployment failed!${NC}"
            FAILED_COUNT=$((FAILED_COUNT + 1))
            if [ "$SKIP_CONFIRMATION" != "true" ]; then
                exit 1
            fi
        fi
    else
        echo -e "${RED}❌ deploy_identity.sh not found!${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
else
    echo -e "\n${YELLOW}⏭️  Skipping Identity contract deployment${NC}"
fi

# ============================================================
# STEP 3: Deploy Supply Chain Contract
# ============================================================
if [ "$DEPLOY_SUPPLY_CHAIN" = "true" ]; then
    echo -e "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}           STEP 3: SUPPLY CHAIN CONTRACT${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if [ -f scripts/deploy_supply_chain.sh ]; then
        echo -e "${YELLOW}🚀 Running deploy_supply_chain.sh...${NC}"
        
        set +e
        ./scripts/deploy_supply_chain.sh
        DEPLOY_EXIT=$?
        set -e
        
        if [ $DEPLOY_EXIT -eq 0 ]; then
            echo -e "${GREEN}✅ Supply Chain contract deployed successfully!${NC}"
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            
            # Reload .env to get the new address
            source .env
            echo -e "   Address: ${GREEN}$SUPPLY_CHAIN_ADDRESS${NC}"
        else
            echo -e "${RED}❌ Supply Chain contract deployment failed!${NC}"
            FAILED_COUNT=$((FAILED_COUNT + 1))
            if [ "$SKIP_CONFIRMATION" != "true" ]; then
                exit 1
            fi
        fi
    else
        echo -e "${RED}❌ deploy_supply_chain.sh not found!${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    fi
else
    echo -e "\n${YELLOW}⏭️  Skipping Supply Chain contract deployment${NC}"
fi

# ============================================================
# STEP 4: Deploy Disbursement Contract (Depends on others)
# ============================================================
if [ "$DEPLOY_DISBURSEMENT" = "true" ]; then
    echo -e "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${MAGENTA}           STEP 4: DISBURSEMENT CONTRACT${NC}"
    echo -e "${MAGENTA}           (Depends on other contracts)${NC}"
    echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Check if dependent contracts are deployed
    MISSING_DEPS=""
    if [ -z "$TOKEN_ADDRESS" ] && [ "$DEPLOY_TOKEN" = "true" ]; then
        MISSING_DEPS="$MISSING_DEPS TOKEN_ADDRESS"
    fi
    if [ -z "$IDENTITY_ADDRESS" ] && [ "$DEPLOY_IDENTITY" = "true" ]; then
        MISSING_DEPS="$MISSING_DEPS IDENTITY_ADDRESS"
    fi
    if [ -z "$SUPPLY_CHAIN_ADDRESS" ] && [ "$DEPLOY_SUPPLY_CHAIN" = "true" ]; then
        MISSING_DEPS="$MISSING_DEPS SUPPLY_CHAIN_ADDRESS"
    fi
    
    if [ -n "$MISSING_DEPS" ]; then
        echo -e "${RED}❌ Missing dependencies for Disbursement contract:$MISSING_DEPS${NC}"
        echo -e "${YELLOW}   Please deploy Token, Identity, and Supply Chain first!${NC}"
        FAILED_COUNT=$((FAILED_COUNT + 1))
    else
        if [ -f scripts/deploy_disbursement.sh ]; then
            echo -e "${YELLOW}🚀 Running deploy_disbursement.sh...${NC}"
            echo -e "   Using Token: $TOKEN_ADDRESS"
            echo -e "   Using Identity: $IDENTITY_ADDRESS"
            echo -e "   Using Supply Chain: $SUPPLY_CHAIN_ADDRESS"
            echo ""
            
            set +e
            ./scripts/deploy_disbursement.sh
            DEPLOY_EXIT=$?
            set -e
            
            if [ $DEPLOY_EXIT -eq 0 ]; then
                echo -e "${GREEN}✅ Disbursement contract deployed successfully!${NC}"
                SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
                
                # Reload .env to get the new address
                source .env
                echo -e "   Address: ${GREEN}$DISBURSEMENT_ADDRESS${NC}"
            else
                echo -e "${RED}❌ Disbursement contract deployment failed!${NC}"
                FAILED_COUNT=$((FAILED_COUNT + 1))
            fi
        else
            echo -e "${RED}❌ deploy_disbursement.sh not found!${NC}"
            FAILED_COUNT=$((FAILED_COUNT + 1))
        fi
    fi
else
    echo -e "\n${YELLOW}⏭️  Skipping Disbursement contract deployment${NC}"
fi

# ============================================================
# DEPLOYMENT SUMMARY
# ============================================================
echo -e "\n${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${MAGENTA}                 DEPLOYMENT SUMMARY${NC}"
echo -e "${MAGENTA}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Display all deployed addresses
if [ -f .env ]; then
    echo -e "${YELLOW}📋 Deployed Contract Addresses:${NC}"
    echo ""
    
    if [ -n "$TOKEN_ADDRESS" ]; then
        echo -e "   ${GREEN}✓ Token Contract:${NC}      $TOKEN_ADDRESS"
    else
        echo -e "   ${RED}✗ Token Contract:${NC}      Not deployed"
    fi
    
    if [ -n "$IDENTITY_ADDRESS" ]; then
        echo -e "   ${GREEN}✓ Identity Contract:${NC}    $IDENTITY_ADDRESS"
    else
        echo -e "   ${RED}✗ Identity Contract:${NC}    Not deployed"
    fi
    
    if [ -n "$SUPPLY_CHAIN_ADDRESS" ]; then
        echo -e "   ${GREEN}✓ Supply Chain:${NC}         $SUPPLY_CHAIN_ADDRESS"
    else
        echo -e "   ${RED}✗ Supply Chain:${NC}         Not deployed"
    fi
    
    if [ -n "$DISBURSEMENT_ADDRESS" ]; then
        echo -e "   ${GREEN}✓ Disbursement:${NC}         $DISBURSEMENT_ADDRESS"
    else
        echo -e "   ${RED}✗ Disbursement:${NC}         Not deployed"
    fi
    
    echo ""
    echo -e "${YELLOW}📁 Addresses saved to: .env${NC}"
fi

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Deployments successful: $SUCCESS_COUNT${NC}"
if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "${RED}❌ Deployments failed: $FAILED_COUNT${NC}"
fi
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo ""
echo -e "${YELLOW}🔧 Next Steps:${NC}"
echo -e "   1. Run integration tests: ${GREEN}cargo test --test integration -- --nocapture${NC}"
echo -e "   2. View contracts on Stellar Expert:"
echo -e "      https://stellar.expert/contract/<contract-address>"
echo ""

if [ $FAILED_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 All contracts deployed successfully! Hiwot Protocol is ready!${NC}"
else
    echo -e "${YELLOW}⚠️  Some deployments failed. Check the errors above.${NC}"
    exit 1
fi