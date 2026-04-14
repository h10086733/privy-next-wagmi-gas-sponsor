#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
CHAIN_REGISTRY="$ROOT_DIR/config/gas-sponsor-chains.json"

DEPLOY_ALL=0
CHAIN_LIST=""
SKIP_BUILD=0
FORWARDED_ARGS=()

usage() {
  cat <<'USAGE'
Usage:
  bash scripts/deploy-privy-batch.sh (--all | --chains <chain-a,chain-b>) [options]

Options:
  --all                   Deploy every chain from config/gas-sponsor-chains.json
  --chains <csv>          Deploy only the provided chain keys
  --upgrade-admin         Forwarded to the single-chain deploy script
  --redeploy-logical      Forwarded to the single-chain deploy script
  --logical-salt <label>  Forwarded to the single-chain deploy script
  --legacy                Forwarded to the single-chain deploy script
  --skip-build            Skip the one-time forge build in batch mode
  -h, --help              Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      ;;
    --all)
      DEPLOY_ALL=1
      ;;
    --chains)
      shift
      CHAIN_LIST="${1:-}"
      if [[ -z "$CHAIN_LIST" ]]; then
        echo "Missing value for --chains" >&2
        exit 1
      fi
      ;;
    --skip-build)
      SKIP_BUILD=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      FORWARDED_ARGS+=("$1")
      ;;
  esac
  shift
done

if [[ ! -f "$CHAIN_REGISTRY" ]]; then
  echo "Missing chain registry: $CHAIN_REGISTRY" >&2
  exit 1
fi

if (( DEPLOY_ALL == 0 )) && [[ -z "$CHAIN_LIST" ]]; then
  echo "Either --all or --chains is required" >&2
  usage
  exit 1
fi

if (( DEPLOY_ALL == 1 )) && [[ -n "$CHAIN_LIST" ]]; then
  echo "Use either --all or --chains, not both" >&2
  exit 1
fi

if (( SKIP_BUILD == 0 )); then
  echo ">>> forge build"
  (cd "$CONTRACTS_DIR" && forge build)
fi

mapfile -t TARGET_CHAINS < <(
  if (( DEPLOY_ALL == 1 )); then
    jq -r '.[].key' "$CHAIN_REGISTRY"
  else
    printf '%s\n' "$CHAIN_LIST" | tr ',' '\n' | sed -E 's/^\s+|\s+$//g' | sed '/^$/d'
  fi
)

if [[ ${#TARGET_CHAINS[@]} -eq 0 ]]; then
  echo "No chains selected for batch deploy" >&2
  exit 1
fi

for chain in "${TARGET_CHAINS[@]}"; do
  echo ">>> Deploying $chain"
  bash "$ROOT_DIR/scripts/deploy-privy-chain.sh" \
    --chain "$chain" \
    --skip-build \
    "${FORWARDED_ARGS[@]}"
done
