#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

NETWORK=${NETWORK:-testnet}
SOURCE=${SOURCE:-alice}
ADMIN_ADDRESS=${ADMIN_ADDRESS:-$(stellar keys public-key "$SOURCE")}

echo "Building token contract..."
cargo build --target wasm32-unknown-unknown --release -p hiwot-token

WASM_PATH="target/wasm32-unknown-unknown/release/hiwot_token.wasm"
if [ ! -f "$WASM_PATH" ]; then
	echo "Token wasm not found at $WASM_PATH"
	exit 1
fi

echo "Deploying token contract to $NETWORK..."
TOKEN_ADDRESS=$(stellar contract deploy \
	--network "$NETWORK" \
	--source "$SOURCE" \
	--wasm "$WASM_PATH")
TOKEN_ADDRESS=$(echo "$TOKEN_ADDRESS" | tr -d '[:space:]')

echo "Initializing token admin..."
stellar contract invoke \
	--network "$NETWORK" \
	--source "$SOURCE" \
	--id "$TOKEN_ADDRESS" \
	-- initialize --admin "$ADMIN_ADDRESS" >/dev/null

if [ ! -f .env ]; then
	touch .env
fi

if grep -q '^TOKEN_ADDRESS=' .env; then
	sed -i.bak "s|^TOKEN_ADDRESS=.*|TOKEN_ADDRESS=$TOKEN_ADDRESS|" .env
	rm -f .env.bak
else
	echo "TOKEN_ADDRESS=$TOKEN_ADDRESS" >> .env
fi

echo "Token deployed: $TOKEN_ADDRESS"