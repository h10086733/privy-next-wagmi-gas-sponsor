import { PrivyClient } from "@privy-io/node";

function requireEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing environment variable. Expected one of: ${keys.join(", ")}`);
}

export function getPrivyAppId(): string {
  return requireEnv("PRIVY_APP_ID", "NEXT_PUBLIC_PRIVY_APP_ID");
}

export function getPrivyAppSecret(): string {
  return requireEnv("PRIVY_APP_SECRET");
}

function getChainKeyEnvSuffix(chainKey: string): string {
  return chainKey
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function getSponsorPrivateKey(chainKey?: string): `0x${string}` {
  const chainSpecificKeys = chainKey
    ? (() => {
        const suffix = getChainKeyEnvSuffix(chainKey);
        return [
          `SPONSOR_PRIVATE_KEY__${suffix}`,
          `PRIVATE_KEY__${suffix}`,
          `SPONSOR_PRIVATE_KEY_${suffix}`,
          `PRIVATE_KEY_${suffix}`,
        ];
      })()
    : [];

  const privateKey = requireEnv(...chainSpecificKeys, "SPONSOR_PRIVATE_KEY", "PRIVATE_KEY");
  return (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
}

export const privyServerClient = new PrivyClient({
  appId: getPrivyAppId(),
  appSecret: getPrivyAppSecret(),
});
