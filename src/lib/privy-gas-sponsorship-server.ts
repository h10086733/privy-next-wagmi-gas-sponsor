import { PrivyClient } from "@privy-io/node";
import type { Address } from "viem";

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing environment variable. Expected one of: ${keys.join(", ")}`);
}

function resolvePreferredEnv(keys: string[], label: string): string {
  const values = keys
    .map((key) => [key, process.env[key]] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));

  if (values.length === 0) {
    throw new Error(
      `Missing environment variable for ${label}. Expected one of: ${keys.join(", ")}`,
    );
  }

  const normalizedValues = new Map<string, string[]>();
  for (const [key, value] of values) {
    const normalized = value.toLowerCase();
    const existingKeys = normalizedValues.get(normalized) ?? [];
    existingKeys.push(key);
    normalizedValues.set(normalized, existingKeys);
  }

  if (normalizedValues.size > 1) {
    console.warn(
      `[gas-sponsor] ${label} env mismatch detected: ${values
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}. Preferring ${values[0][0]}.`,
    );
  }

  return values[0][1];
}

export function getPrivyAppId(): string {
  return requireEnv("PRIVY_APP_ID", "NEXT_PUBLIC_PRIVY_APP_ID");
}

export function getPrivyAppSecret(): string {
  return requireEnv("PRIVY_APP_SECRET");
}

export function getBscTestnetRpcUrl(): string {
  return resolvePreferredEnv(
    [
      "NEXT_PUBLIC_BSC_TESTNET_RPC_URL",
      "NEXT_PUBLIC_RPC_URL",
      "BSC_TESTNET_RPC_URL",
      "RPC_URL",
    ],
    "BSC testnet RPC URL",
  );
}

export function getSponsorPrivateKey(): `0x${string}` {
  const privateKey = requireEnv("SPONSOR_PRIVATE_KEY", "PRIVATE_KEY");
  return (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
}

export function getPrivyAdminProxyAddress(): Address {
  return resolvePreferredEnv(
    ["NEXT_PUBLIC_PRIVY_ADMIN_PROXY_ADDRESS", "PRIVY_ADMIN_PROXY_ADDRESS"],
    "PrivyAdmin proxy address",
  ) as Address;
}

export function getPrivyLogicalAddress(): Address {
  return resolvePreferredEnv(
    ["NEXT_PUBLIC_PRIVY_LOGICAL_ADDRESS", "PRIVY_LOGICAL_ADDRESS"],
    "PrivyLogical address",
  ) as Address;
}

export const privyServerClient = new PrivyClient({
  appId: getPrivyAppId(),
  appSecret: getPrivyAppSecret(),
});
