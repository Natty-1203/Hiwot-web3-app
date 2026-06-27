#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

NETWORK=${NETWORK:-testnet}
SOURCE=${SOURCE:-alice}
ADMIN_ADDRESS=${ADMIN_ADDRESS:-$(stellar keys public-key "$SOURCE")}

if [ ! -f .env ]; then
  echo ".env is missing in $PROJECT_ROOT"
  exit 1
fi

source .env

: "${IDENTITY_ADDRESS:?IDENTITY_ADDRESS is required in .env}"
: "${TOKEN_ADDRESS:?TOKEN_ADDRESS is required in .env}"
: "${SUPPLY_CHAIN_ADDRESS:?SUPPLY_CHAIN_ADDRESS is required in .env}"

echo "Building disbursement contract..."
cargo build --target wasm32-unknown-unknown --release -p hiwot-disbursement

WASM_PATH="target/wasm32-unknown-unknown/release/hiwot_disbursement.wasm"
if [ ! -f "$WASM_PATH" ]; then
  echo "Disbursement wasm not found at $WASM_PATH"
  exit 1
fi

echo "Deploying disbursement contract to $NETWORK..."
DISBURSEMENT_ADDRESS=$(stellar contract deploy \
  --network "$NETWORK" \
  --source "$SOURCE" \
  --wasm "$WASM_PATH")
DISBURSEMENT_ADDRESS=$(echo "$DISBURSEMENT_ADDRESS" | tr -d '[:space:]')

echo "Initializing disbursement dependencies..."
stellar contract invoke \
  --network "$NETWORK" \
  --source "$SOURCE" \
  --id "$DISBURSEMENT_ADDRESS" \
  -- init \
  --admin "$ADMIN_ADDRESS" \
  --identity "$IDENTITY_ADDRESS" \
  --token "$TOKEN_ADDRESS" \
  --supply "$SUPPLY_CHAIN_ADDRESS" >/dev/null

if grep -q '^DISBURSEMENT_ADDRESS=' .env; then
  sed -i.bak "s|^DISBURSEMENT_ADDRESS=.*|DISBURSEMENT_ADDRESS=$DISBURSEMENT_ADDRESS|" .env
  rm -f .env.bak
else
  echo "DISBURSEMENT_ADDRESS=$DISBURSEMENT_ADDRESS" >> .env
fi

echo "Disbursement deployed: $DISBURSEMENT_ADDRESS"
