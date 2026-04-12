#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
CONTRACTS_ENV="$CONTRACTS_DIR/.env"
APP_ENV="$ROOT_DIR/.env"
DEFAULT_RPC_URL="https://bsc-testnet.bnbchain.org"
DEFAULT_CHAIN_ID="97"
CREATE2_DEPLOYER_ADDRESS="0x4e59b44847b379578588920ca78fbf26c0b4956c"
CREATE3_PROXY_INITCODE="0x67363d3d37363d34f03d5260086018f3"

UPGRADE_ADMIN=0
REDEPLOY_LOGICAL=0
LEGACY=0
SKIP_BUILD=0
LOGICAL_SALT_OVERRIDE=""

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/deploy-bsc-testnet-privy.sh [options]

Options:
  --upgrade-admin         Upgrade existing PrivyAdmin proxy implementation
  --redeploy-logical      Redeploy PrivyLogical with a fresh salt if needed
  --logical-salt <label>  Base logical salt label, e.g. PrivyLogicalVersion-7
  --legacy                Use forge --legacy for broadcast
  --skip-build            Skip forge build
  -h, --help              Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --upgrade-admin)
      UPGRADE_ADMIN=1
      ;;
    --redeploy-logical)
      REDEPLOY_LOGICAL=1
      ;;
    --logical-salt)
      shift
      LOGICAL_SALT_OVERRIDE="${1:-}"
      if [[ -z "$LOGICAL_SALT_OVERRIDE" ]]; then
        echo "Missing value for --logical-salt" >&2
        exit 1
      fi
      ;;
    --legacy)
      LEGACY=1
      ;;
    --skip-build)
      SKIP_BUILD=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

for cmd in forge cast jq node; do
  require_cmd "$cmd"
done

ensure_env_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    mkdir -p "$(dirname "$file")"
    touch "$file"
  fi
}

normalize_private_key() {
  local value="$1"
  if [[ "$value" == 0x* ]]; then
    printf '%s' "$value"
  else
    printf '0x%s' "$value"
  fi
}

upsert_env() {
  local file="$1"
  local key="$2"
  local value="$3"
  ensure_env_file "$file"

  local escaped
  escaped=$(printf '%s' "$value" | sed -e 's/[\\&/]/\\&/g')

  if grep -Eq "^[[:space:]]*${key}=" "$file"; then
    sed -i "s|^[[:space:]]*${key}=.*|${key}=${escaped}|" "$file"
  else
    if [[ -s "$file" ]]; then
      printf '\n' >> "$file"
    fi
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

load_env() {
  local file="$1"
  if [[ -f "$file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$file"
    set +a
  fi
}

read_env_value() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 | sed -E "s/^[[:space:]]*${key}=//"
}

split_csv() {
  local csv="$1"
  csv="${csv// /}"
  IFS=',' read -r -a __CSV_PARTS <<< "$csv"
  for value in "${__CSV_PARTS[@]}"; do
    if [[ -n "$value" ]]; then
      printf '%s\n' "$value"
    fi
  done
}

has_code() {
  local address="$1"
  if [[ -z "$address" ]]; then
    return 1
  fi
  local code
  code=$(cast code "$address" --rpc-url "$RPC_URL" 2>/dev/null || true)
  [[ -n "$code" && "$code" != "0x" ]]
}

first_contract_address() {
  local file="$1"
  jq -r '
    (.transactions[]? | select(.contractAddress != null) | .contractAddress),
    (.receipts[]? | select(.contractAddress != null) | .contractAddress)
  ' "$file" | grep -E '^0x' | head -n1
}

logical_address_from_broadcast() {
  local file="$1"
  local proxy
  proxy=$(jq -r '.transactions[]? | select(.transactionType == "CREATE2" and .contractAddress != null) | .contractAddress' "$file" | grep -E '^0x' | head -n1)
  [[ -n "$proxy" ]] || return 1
  cast compute-address "$proxy" --nonce 1 | awk '{print $3}'
}

predict_create3_proxy_address() {
  local salt_hex="$1"
  cast create2 --deployer "$CREATE2_DEPLOYER_ADDRESS" --salt "$salt_hex" --init-code "$CREATE3_PROXY_INITCODE" | tail -n1
}

predict_logical_address_from_salt() {
  local salt_label="$1"
  local salt_hex
  local proxy

  salt_hex=$(cast keccak "$salt_label")
  proxy=$(predict_create3_proxy_address "$salt_hex")
  cast compute-address "$proxy" --nonce 1 | awk '{print $3}'
}

choose_fresh_logical_salt() {
  local preferred_label="$1"
  local base_label="$preferred_label"
  local candidate_label="$preferred_label"
  local candidate_address=""
  local attempt=0

  if [[ -z "$base_label" ]]; then
    base_label="PrivyLogicalVersion"
    candidate_label="${base_label}-$(date +%Y%m%d%H%M%S)"
  fi

  while true; do
    candidate_address=$(predict_logical_address_from_salt "$candidate_label")
    if ! has_code "$candidate_address"; then
      printf '%s\n' "$candidate_label"
      return
    fi
    attempt=$((attempt + 1))
    candidate_label="${base_label}-$(date +%Y%m%d%H%M%S)-$attempt"
  done
}

admin_proxy_address_from_broadcast() {
  local file="$1"
  jq -r '
    (.transactions[]? | select(.function == "deployDeterministicAndCall(address,address,bytes32,bytes)")
      | .additionalContracts[]? | select(.transactionType == "CREATE2" and .address != null) | .address),
    (.transactions[]? | select(.function == "addOperator(address)" and .contractAddress != null) | .contractAddress)
  ' "$file" | grep -E '^0x' | head -n1
}

run_forge_script() {
  local script_name="$1"
  shift
  local cmd=(forge script "$script_name" --rpc-url "$RPC_URL" --chain "$CHAIN_ID" --private-key "$PRIVATE_KEY" --broadcast)
  if (( LEGACY )); then
    cmd+=(--legacy)
  fi
  echo ">>> ${cmd[*]}"
  (cd "$CONTRACTS_DIR" && "${cmd[@]}")
}

ensure_env_file "$CONTRACTS_ENV"
ensure_env_file "$APP_ENV"
load_env "$CONTRACTS_ENV"

RPC_URL="${RPC_URL:-$DEFAULT_RPC_URL}"
CHAIN_ID="${CHAIN_ID:-$DEFAULT_CHAIN_ID}"
PRIVATE_KEY_RAW="${PRIVATE_KEY:-}"
if [[ -z "$PRIVATE_KEY_RAW" ]]; then
  echo "contracts/.env is missing PRIVATE_KEY" >&2
  exit 1
fi
PRIVATE_KEY="$(normalize_private_key "$PRIVATE_KEY_RAW")"
DEPLOYER_ADDRESS="${DEPLOYER_ADDRESS:-$(cast wallet address --private-key "$PRIVATE_KEY")}" 
upsert_env "$CONTRACTS_ENV" "RPC_URL" "$RPC_URL"
upsert_env "$CONTRACTS_ENV" "CHAIN_ID" "$CHAIN_ID"
upsert_env "$CONTRACTS_ENV" "PRIVATE_KEY" "$PRIVATE_KEY"
upsert_env "$CONTRACTS_ENV" "DEPLOYER_ADDRESS" "$DEPLOYER_ADDRESS"
export RPC_URL CHAIN_ID PRIVATE_KEY DEPLOYER_ADDRESS

SPONSOR_PRIVATE_KEY="${SPONSOR_PRIVATE_KEY:-$(read_env_value "$CONTRACTS_ENV" "SPONSOR_PRIVATE_KEY")}" 
if [[ -z "$SPONSOR_PRIVATE_KEY" ]]; then
  SPONSOR_PRIVATE_KEY="$(read_env_value "$APP_ENV" "SPONSOR_PRIVATE_KEY")"
fi
if [[ -n "$SPONSOR_PRIVATE_KEY" ]]; then
  SPONSOR_PRIVATE_KEY="$(normalize_private_key "$SPONSOR_PRIVATE_KEY")"
  upsert_env "$CONTRACTS_ENV" "SPONSOR_PRIVATE_KEY" "$SPONSOR_PRIVATE_KEY"
fi

OPERATORS_ADDRESSES="${OPERATORS_ADDRESSES:-$(read_env_value "$CONTRACTS_ENV" "OPERATORS_ADDRESSES")}" 
if [[ -z "$OPERATORS_ADDRESSES" ]]; then
  if [[ -n "$SPONSOR_PRIVATE_KEY" ]]; then
    OPERATORS_ADDRESSES="$(cast wallet address --private-key "$SPONSOR_PRIVATE_KEY")"
    echo "Using sponsor wallet as operator: $OPERATORS_ADDRESSES"
  else
    OPERATORS_ADDRESSES="$DEPLOYER_ADDRESS"
    echo "OPERATORS_ADDRESSES not set; defaulting to deployer: $OPERATORS_ADDRESSES"
  fi
fi
upsert_env "$CONTRACTS_ENV" "OPERATORS_ADDRESSES" "$OPERATORS_ADDRESSES"
export OPERATORS_ADDRESSES

if (( SKIP_BUILD == 0 )); then
  echo ">>> forge build"
  (cd "$CONTRACTS_DIR" && forge build)
fi

FACTORY_ADDRESS="${FACTORY_ADDRESS:-$(read_env_value "$CONTRACTS_ENV" "FACTORY_ADDRESS")}" 
if ! has_code "$FACTORY_ADDRESS"; then
  run_forge_script "script/DeployFactory.s.sol:DeployFactoryScript"
  FACTORY_ADDRESS="$(first_contract_address "$CONTRACTS_DIR/broadcast/DeployFactory.s.sol/$CHAIN_ID/run-latest.json")"
  if [[ -z "$FACTORY_ADDRESS" ]]; then
    echo "Failed to resolve FACTORY_ADDRESS from broadcast" >&2
    exit 1
  fi
  upsert_env "$CONTRACTS_ENV" "FACTORY_ADDRESS" "$FACTORY_ADDRESS"
else
  echo ">>> Reusing existing FACTORY_ADDRESS=$FACTORY_ADDRESS"
fi
export FACTORY_ADDRESS

PRIVY_ADMIN_PROXY_ADDRESS="${PRIVY_ADMIN_PROXY_ADDRESS:-$(read_env_value "$CONTRACTS_ENV" "PRIVY_ADMIN_PROXY_ADDRESS")}" 
if ! has_code "$PRIVY_ADMIN_PROXY_ADDRESS"; then
  run_forge_script "script/DeployPrivyAdmin.s.sol:DeployPrivyAdminScript"
  ADMIN_RUN="$CONTRACTS_DIR/broadcast/DeployPrivyAdmin.s.sol/$CHAIN_ID/run-latest.json"
  PRIVY_ADMIN_PROXY_ADDRESS="$(admin_proxy_address_from_broadcast "$ADMIN_RUN")"
  PRIVY_ADMIN_IMPLEMENTATION_ADDRESS="$(jq -r '.transactions[]? | select(.contractName == "PrivyAdmin") | .contractAddress' "$ADMIN_RUN" | grep -E '^0x' | head -n1)"
  upsert_env "$CONTRACTS_ENV" "PRIVY_ADMIN_PROXY_ADDRESS" "$PRIVY_ADMIN_PROXY_ADDRESS"
  if [[ -n "$PRIVY_ADMIN_IMPLEMENTATION_ADDRESS" ]]; then
    upsert_env "$CONTRACTS_ENV" "PRIVY_ADMIN_IMPLEMENTATION_ADDRESS" "$PRIVY_ADMIN_IMPLEMENTATION_ADDRESS"
  fi
else
  echo ">>> Reusing existing PRIVY_ADMIN_PROXY_ADDRESS=$PRIVY_ADMIN_PROXY_ADDRESS"
  if (( UPGRADE_ADMIN )); then
    run_forge_script "script/UpgradePrivyAdmin.s.sol:UpgradePrivyAdminScript"
    ADMIN_UPGRADE_RUN="$CONTRACTS_DIR/broadcast/UpgradePrivyAdmin.s.sol/$CHAIN_ID/run-latest.json"
    if [[ -f "$ADMIN_UPGRADE_RUN" ]]; then
      PRIVY_ADMIN_IMPLEMENTATION_ADDRESS="$(jq -r '.transactions[]? | select(.contractName == "PrivyAdmin") | .contractAddress' "$ADMIN_UPGRADE_RUN" | grep -E '^0x' | head -n1)"
      if [[ -n "$PRIVY_ADMIN_IMPLEMENTATION_ADDRESS" ]]; then
        upsert_env "$CONTRACTS_ENV" "PRIVY_ADMIN_IMPLEMENTATION_ADDRESS" "$PRIVY_ADMIN_IMPLEMENTATION_ADDRESS"
      fi
    fi
  fi
fi
export PRIVY_ADMIN_PROXY_ADDRESS

while IFS= read -r operator; do
  [[ -n "$operator" ]] || continue
  registered=$(cast call "$PRIVY_ADMIN_PROXY_ADDRESS" 'operators(address)(bool)' "$operator" --rpc-url "$RPC_URL")
  if [[ "$registered" != "true" ]]; then
    echo ">>> Adding operator $operator"
    cast send "$PRIVY_ADMIN_PROXY_ADDRESS" 'addOperator(address)' "$operator" --rpc-url "$RPC_URL" --private-key "$PRIVATE_KEY" >/dev/null
  else
    echo ">>> Operator already registered: $operator"
  fi
done < <(split_csv "$OPERATORS_ADDRESSES")

PRIVY_LOGICAL_ADDRESS="${PRIVY_LOGICAL_ADDRESS:-$(read_env_value "$CONTRACTS_ENV" "PRIVY_LOGICAL_ADDRESS")}" 
CURRENT_LOGICAL_SALT="${PRIVY_LOGICAL_SALT:-$(read_env_value "$CONTRACTS_ENV" "PRIVY_LOGICAL_SALT")}" 
if (( REDEPLOY_LOGICAL )); then
  if [[ -n "$LOGICAL_SALT_OVERRIDE" ]]; then
    CURRENT_LOGICAL_SALT="$LOGICAL_SALT_OVERRIDE"
  elif [[ -z "$CURRENT_LOGICAL_SALT" ]]; then
    CURRENT_LOGICAL_SALT="PrivyLogicalVersion-$(date +%Y%m%d%H%M%S)"
  fi

  REQUESTED_LOGICAL_SALT="$CURRENT_LOGICAL_SALT"
  CURRENT_LOGICAL_SALT="$(choose_fresh_logical_salt "$CURRENT_LOGICAL_SALT")"
  if [[ "$CURRENT_LOGICAL_SALT" != "$REQUESTED_LOGICAL_SALT" ]]; then
    COLLIDED_LOGICAL_ADDRESS="$(predict_logical_address_from_salt "$REQUESTED_LOGICAL_SALT")"
    echo ">>> Logical salt already used: $REQUESTED_LOGICAL_SALT -> $COLLIDED_LOGICAL_ADDRESS"
    echo ">>> Using fresh logical salt: $CURRENT_LOGICAL_SALT"
  fi
  upsert_env "$CONTRACTS_ENV" "PRIVY_LOGICAL_SALT" "$CURRENT_LOGICAL_SALT"
fi

if (( REDEPLOY_LOGICAL )) || ! has_code "$PRIVY_LOGICAL_ADDRESS"; then
  if [[ -n "$LOGICAL_SALT_OVERRIDE" && $REDEPLOY_LOGICAL -eq 0 ]]; then
    CURRENT_LOGICAL_SALT="$LOGICAL_SALT_OVERRIDE"
    upsert_env "$CONTRACTS_ENV" "PRIVY_LOGICAL_SALT" "$CURRENT_LOGICAL_SALT"
  fi
  if [[ -n "$CURRENT_LOGICAL_SALT" ]]; then
    PREDICTED_LOGICAL_ADDRESS="$(predict_logical_address_from_salt "$CURRENT_LOGICAL_SALT")"
    echo ">>> Deploying PrivyLogical with salt $CURRENT_LOGICAL_SALT"
    echo ">>> Predicted PrivyLogical address: $PREDICTED_LOGICAL_ADDRESS"
    export PRIVY_LOGICAL_SALT="$CURRENT_LOGICAL_SALT"
  fi
  run_forge_script "script/DeployPrivyLogical.s.sol:DeployPrivyLogicalScript"
  PRIVY_LOGICAL_ADDRESS="$(logical_address_from_broadcast "$CONTRACTS_DIR/broadcast/DeployPrivyLogical.s.sol/$CHAIN_ID/run-latest.json")"
  if [[ -z "$PRIVY_LOGICAL_ADDRESS" ]]; then
    echo "Failed to resolve PRIVY_LOGICAL_ADDRESS from broadcast" >&2
    exit 1
  fi
  upsert_env "$CONTRACTS_ENV" "PRIVY_LOGICAL_ADDRESS" "$PRIVY_LOGICAL_ADDRESS"
else
  echo ">>> Reusing existing PRIVY_LOGICAL_ADDRESS=$PRIVY_LOGICAL_ADDRESS"
fi
export PRIVY_LOGICAL_ADDRESS

node "$ROOT_DIR/scripts/sync-bsc-testnet-env.mjs"

LOGICAL_ADMIN=$(cast call "$PRIVY_LOGICAL_ADDRESS" 'PRIVY_ADMIN()(address)' --rpc-url "$RPC_URL")
OWNER=$(cast call "$PRIVY_ADMIN_PROXY_ADDRESS" 'owner()(address)' --rpc-url "$RPC_URL")

if [[ "${LOGICAL_ADMIN,,}" != "${PRIVY_ADMIN_PROXY_ADDRESS,,}" ]]; then
  echo "PrivyLogical admin mismatch: expected $PRIVY_ADMIN_PROXY_ADDRESS, got $LOGICAL_ADMIN" >&2
  exit 1
fi

cat <<SUMMARY

Deployment summary
- RPC_URL: $RPC_URL
- CHAIN_ID: $CHAIN_ID
- DEPLOYER_ADDRESS: $DEPLOYER_ADDRESS
- FACTORY_ADDRESS: $FACTORY_ADDRESS
- PRIVY_ADMIN_PROXY_ADDRESS: $PRIVY_ADMIN_PROXY_ADDRESS
- PRIVY_LOGICAL_ADDRESS: $PRIVY_LOGICAL_ADDRESS
- PRIVY_LOGICAL.PRIVY_ADMIN: $LOGICAL_ADMIN
- PRIVY_ADMIN.owner: $OWNER
- OPERATORS_ADDRESSES: $OPERATORS_ADDRESSES

Next
- Restart Next dev server so new env is picked up
- Re-sign with Privy before submitting sponsored transfer
- One-click command: bash scripts/deploy-bsc-testnet-privy.sh --redeploy-logical
- Optional base salt: bash scripts/deploy-bsc-testnet-privy.sh --redeploy-logical --logical-salt PrivyLogicalVersion-7
SUMMARY
