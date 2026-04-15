import { defineChain, type Address, type Chain } from "viem";
import { bscTestnet } from "viem/chains";

import registryChainConfigs from "../../config/gas-sponsor-chains.json";
import generatedChainConfigs from "@/generated/gas-sponsor-chains.json";

type SharedChainContracts = {
  factoryAddress?: Address;
  privyAdminImplementationAddress?: Address;
  privyAdminProxyAddress?: Address;
  privyLogicalAddress?: Address;
  sponsoredTokenAddress?: Address;
  sponsoredTransferToAddress?: Address;
};

type GeneratedGasSponsorChainConfig = {
  key?: unknown;
  id?: unknown;
  name?: unknown;
  rpcUrl?: unknown;
  blockExplorerUrl?: unknown;
  nativeCurrency?: {
    name?: unknown;
    symbol?: unknown;
    decimals?: unknown;
  };
  contracts?: {
    factoryAddress?: unknown;
    privyAdminImplementationAddress?: unknown;
    privyAdminProxyAddress?: unknown;
    privyLogicalAddress?: unknown;
    sponsoredTokenAddress?: unknown;
    sponsoredTransferToAddress?: unknown;
  };
};

type RegistryGasSponsorChainConfig = {
  key?: unknown;
  id?: unknown;
  name?: unknown;
  rpcUrl?: unknown;
  blockExplorerUrl?: unknown;
  nativeCurrency?: {
    name?: unknown;
    symbol?: unknown;
    decimals?: unknown;
  };
  defaults?: {
    sponsoredTokenAddress?: unknown;
    sponsoredTransferToAddress?: unknown;
  };
};

export type SupportedChainConfig = {
  key: string;
  id: number;
  name: string;
  rpcUrl: string;
  blockExplorerUrl?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  chain: Chain;
};

export type GasSponsorChainConfig = SupportedChainConfig & {
  contracts: {
    factoryAddress?: Address;
    privyAdminImplementationAddress?: Address;
    privyAdminProxyAddress: Address;
    privyLogicalAddress: Address;
    sponsoredTokenAddress?: Address;
    sponsoredTransferToAddress?: Address;
  };
};

type GasSponsorChainSelector = {
  chainId?: number | null;
  chainKey?: string | null;
};

function normalizeChainKey(value: string): string {
  return value.trim().toLowerCase();
}

function inferTestnet(config: { key: string; name: string }): boolean {
  return /(testnet|sepolia|goerli|holesky|amoy|mumbai)/i.test(
    `${config.key} ${config.name}`,
  );
}

function toChain(config: {
  id: number;
  key: string;
  name: string;
  rpcUrl: string;
  blockExplorerUrl?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}): Chain {
  return defineChain({
    id: config.id,
    name: config.name,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: {
      default: { http: [config.rpcUrl] },
      public: { http: [config.rpcUrl] },
    },
    ...(config.blockExplorerUrl
      ? {
          blockExplorers: {
            default: {
              name: `${config.name} Explorer`,
              url: config.blockExplorerUrl,
            },
          },
        }
      : {}),
    testnet: inferTestnet(config),
  });
}

function normalizeSharedChainConfig(value: {
  key?: unknown;
  id?: unknown;
  name?: unknown;
  rpcUrl?: unknown;
  blockExplorerUrl?: unknown;
  nativeCurrency?: {
    name?: unknown;
    symbol?: unknown;
    decimals?: unknown;
  };
}): SupportedChainConfig | null {
  if (
    typeof value.key !== "string" ||
    typeof value.id !== "number" ||
    typeof value.name !== "string" ||
    typeof value.rpcUrl !== "string"
  ) {
    return null;
  }

  const key = normalizeChainKey(value.key);
  const nativeCurrency = {
    name:
      typeof value.nativeCurrency?.name === "string"
        ? value.nativeCurrency.name
        : "Native Token",
    symbol:
      typeof value.nativeCurrency?.symbol === "string"
        ? value.nativeCurrency.symbol
        : key.toUpperCase(),
    decimals:
      typeof value.nativeCurrency?.decimals === "number"
        ? value.nativeCurrency.decimals
        : 18,
  };
  const blockExplorerUrl =
    typeof value.blockExplorerUrl === "string" ? value.blockExplorerUrl : undefined;

  return {
    key,
    id: value.id,
    name: value.name,
    rpcUrl: value.rpcUrl,
    blockExplorerUrl,
    nativeCurrency,
    chain: toChain({
      id: value.id,
      key,
      name: value.name,
      rpcUrl: value.rpcUrl,
      blockExplorerUrl,
      nativeCurrency,
    }),
  };
}

function normalizeContracts(value: {
  factoryAddress?: unknown;
  privyAdminImplementationAddress?: unknown;
  privyAdminProxyAddress?: unknown;
  privyLogicalAddress?: unknown;
  sponsoredTokenAddress?: unknown;
  sponsoredTransferToAddress?: unknown;
}): SharedChainContracts {
  return {
    factoryAddress:
      typeof value.factoryAddress === "string" ? (value.factoryAddress as Address) : undefined,
    privyAdminImplementationAddress:
      typeof value.privyAdminImplementationAddress === "string"
        ? (value.privyAdminImplementationAddress as Address)
        : undefined,
    privyAdminProxyAddress:
      typeof value.privyAdminProxyAddress === "string"
        ? (value.privyAdminProxyAddress as Address)
        : undefined,
    privyLogicalAddress:
      typeof value.privyLogicalAddress === "string"
        ? (value.privyLogicalAddress as Address)
        : undefined,
    sponsoredTokenAddress:
      typeof value.sponsoredTokenAddress === "string"
        ? (value.sponsoredTokenAddress as Address)
        : undefined,
    sponsoredTransferToAddress:
      typeof value.sponsoredTransferToAddress === "string"
        ? (value.sponsoredTransferToAddress as Address)
        : undefined,
  };
}

function normalizeGeneratedChainConfig(
  value: GeneratedGasSponsorChainConfig,
): GasSponsorChainConfig | null {
  const shared = normalizeSharedChainConfig(value);
  if (!shared) {
    return null;
  }

  const contracts = normalizeContracts(value.contracts ?? {});
  if (!contracts.privyAdminProxyAddress || !contracts.privyLogicalAddress) {
    return null;
  }

  return {
    ...shared,
    contracts: {
      factoryAddress: contracts.factoryAddress,
      privyAdminImplementationAddress: contracts.privyAdminImplementationAddress,
      privyAdminProxyAddress: contracts.privyAdminProxyAddress,
      privyLogicalAddress: contracts.privyLogicalAddress,
      sponsoredTokenAddress: contracts.sponsoredTokenAddress,
      sponsoredTransferToAddress: contracts.sponsoredTransferToAddress,
    },
  };
}

function normalizeRegistryChainConfig(
  value: RegistryGasSponsorChainConfig,
): SupportedChainConfig | null {
  const shared = normalizeSharedChainConfig(value);
  if (!shared) {
    return null;
  }

  return shared;
}

function getLegacySingleChainConfig(): GasSponsorChainConfig[] {
  const rpcUrl =
    process.env.NEXT_PUBLIC_BSC_TESTNET_RPC_URL ??
    process.env.NEXT_PUBLIC_RPC_URL ??
    process.env.BSC_TESTNET_RPC_URL ??
    process.env.RPC_URL;
  const privyAdminProxyAddress =
    process.env.NEXT_PUBLIC_PRIVY_ADMIN_PROXY_ADDRESS ??
    process.env.PRIVY_ADMIN_PROXY_ADDRESS;
  const privyLogicalAddress =
    process.env.NEXT_PUBLIC_PRIVY_LOGICAL_ADDRESS ?? process.env.PRIVY_LOGICAL_ADDRESS;

  if (!rpcUrl || !privyAdminProxyAddress || !privyLogicalAddress) {
    return [];
  }

  return [
    {
      key: "bsc-testnet",
      id: bscTestnet.id,
      name: bscTestnet.name,
      rpcUrl,
      blockExplorerUrl: bscTestnet.blockExplorers?.default.url,
      nativeCurrency: bscTestnet.nativeCurrency,
      chain: defineChain({
        ...bscTestnet,
        rpcUrls: {
          default: { http: [rpcUrl] },
          public: { http: [rpcUrl] },
        },
      }),
      contracts: {
        privyAdminProxyAddress: privyAdminProxyAddress as Address,
        privyLogicalAddress: privyLogicalAddress as Address,
        sponsoredTokenAddress: (process.env.NEXT_PUBLIC_SPONSORED_TOKEN_ADDRESS ??
          undefined) as Address | undefined,
        sponsoredTransferToAddress: (process.env.NEXT_PUBLIC_SPONSORED_TRANSFER_TO_ADDRESS ??
          undefined) as Address | undefined,
      },
    },
  ];
}

function getPreferredDefaultChainKey(): string | null {
  const value =
    process.env.NEXT_PUBLIC_DEFAULT_GAS_SPONSOR_CHAIN_KEY ??
    process.env.DEFAULT_GAS_SPONSOR_CHAIN_KEY ??
    null;

  return value ? normalizeChainKey(value) : null;
}

function sortByDefaultChain<T extends { key: string }>(configs: T[]): T[] {
  if (configs.length <= 1) {
    return configs;
  }

  const preferredKey = getPreferredDefaultChainKey();
  if (!preferredKey) {
    return configs;
  }

  const preferredIndex = configs.findIndex((config) => config.key === preferredKey);
  if (preferredIndex <= 0) {
    return configs;
  }

  const next = [...configs];
  const [preferredConfig] = next.splice(preferredIndex, 1);
  next.unshift(preferredConfig);
  return next;
}

function resolveSupportedChains(): SupportedChainConfig[] {
  const registry = Array.isArray(registryChainConfigs)
    ? registryChainConfigs
        .map((entry) => normalizeRegistryChainConfig(entry as RegistryGasSponsorChainConfig))
        .filter((entry): entry is SupportedChainConfig => entry !== null)
    : [];

  if (registry.length > 0) {
    return sortByDefaultChain(registry);
  }

  return sortByDefaultChain(getLegacySingleChainConfig());
}

function resolveGasSponsorChains(): GasSponsorChainConfig[] {
  const generated = Array.isArray(generatedChainConfigs)
    ? generatedChainConfigs
        .map((entry) => normalizeGeneratedChainConfig(entry as GeneratedGasSponsorChainConfig))
        .filter((entry): entry is GasSponsorChainConfig => entry !== null)
    : [];

  if (generated.length > 0) {
    return sortByDefaultChain(generated);
  }

  return sortByDefaultChain(getLegacySingleChainConfig());
}

export const supportedChains = resolveSupportedChains();
export const gasSponsorChains = resolveGasSponsorChains();
export const defaultSupportedChainConfig = supportedChains[0] ?? null;
export const defaultGasSponsorChainConfig = gasSponsorChains[0] ?? null;

export function getSupportedChains(): SupportedChainConfig[] {
  return supportedChains;
}

export function requireSupportedChains(): SupportedChainConfig[] {
  if (supportedChains.length === 0) {
    throw new Error(
      "Missing supported chain config. Check `config/gas-sponsor-chains.json` or configure the legacy single-chain env variables.",
    );
  }

  return supportedChains;
}

export function getGasSponsorChains(): GasSponsorChainConfig[] {
  return gasSponsorChains;
}

export function requireGasSponsorChains(): GasSponsorChainConfig[] {
  if (gasSponsorChains.length === 0) {
    throw new Error(
      "Missing gas sponsor chain config. Run `pnpm sync:chains` or configure the legacy single-chain env variables.",
    );
  }

  return gasSponsorChains;
}

export function getGasSponsorChainConfigByKey(
  chainKey: string | null | undefined,
): GasSponsorChainConfig | null {
  if (!chainKey) {
    return defaultGasSponsorChainConfig;
  }

  const normalizedKey = normalizeChainKey(chainKey);
  return gasSponsorChains.find((config) => config.key === normalizedKey) ?? null;
}

export function getGasSponsorChainConfigById(
  chainId: number | null | undefined,
): GasSponsorChainConfig | null {
  if (chainId === null || chainId === undefined) {
    return defaultGasSponsorChainConfig;
  }

  return gasSponsorChains.find((config) => config.id === chainId) ?? null;
}

export function requireGasSponsorChainConfig(
  selector: GasSponsorChainSelector = {},
): GasSponsorChainConfig {
  const { chainId, chainKey } = selector;

  const resolvedConfig =
    getGasSponsorChainConfigByKey(chainKey) ?? getGasSponsorChainConfigById(chainId);

  if (!resolvedConfig) {
    const availableChains = gasSponsorChains
      .map((config) => `${config.key}(${config.id})`)
      .join(", ");

    throw new Error(
      `Unsupported gas sponsor chain. Received chainKey=${chainKey ?? "<empty>"}, chainId=${chainId ?? "<empty>"}. Available chains: ${availableChains || "<none>"}`,
    );
  }

  return resolvedConfig;
}
