import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const registryPath = path.join(appDir, "config", "gas-sponsor-chains.json");
const generatedPath = path.join(appDir, "src", "generated", "gas-sponsor-chains.json");
const appEnvPath = path.join(appDir, ".env");

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvFile(filePath) {
  const text = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  const lines = text.length > 0 ? text.split(/\r?\n/) : [];
  const values = new Map();

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values.set(match[1], stripWrappingQuotes(match[2]));
  }

  return { lines, values };
}

function upsertEnv(lines, key, value) {
  const nextLine = `${key}=${value}`;
  const index = lines.findIndex((line) => line.match(new RegExp(`^\\s*${key}\\s*=`)));

  if (index >= 0) {
    lines[index] = nextLine;
    return;
  }

  if (lines.length > 0 && lines[lines.length - 1] !== "") {
    lines.push("");
  }

  lines.push(nextLine);
}

function writeEnvFile(filePath, lines) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${lines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
}

function readJson(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/u.test(value);
}

function normalizeChainKey(value) {
  return value.trim().toLowerCase();
}

function getChainKeyEnvSuffix(chainKey) {
  return chainKey
    .trim()
    .replace(/[^A-Za-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toUpperCase();
}

function normalizePrivateKey(value) {
  if (!value || typeof value !== "string") {
    return "";
  }

  return value.startsWith("0x") ? value : `0x${value}`;
}

function resolvePath(filePath) {
  if (!filePath) {
    return "";
  }

  return path.isAbsolute(filePath) ? filePath : path.join(appDir, filePath);
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing ${label}`);
  }

  return value.trim();
}

function toPositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return parsed;
}

const registry = readJson(registryPath);
if (!Array.isArray(registry)) {
  throw new Error("config/gas-sponsor-chains.json must be an array");
}

const appEnv = parseEnvFile(appEnvPath);
const generatedChains = [];
const warnings = [];

for (const entry of registry) {
  const key = normalizeChainKey(requireString(entry?.key, "chain key"));
  const name = requireString(entry?.name, `chain name for ${key}`);
  const chainId = toPositiveInteger(entry?.id, `chain id for ${key}`);
  const rpcUrl = requireString(entry?.rpcUrl, `rpcUrl for ${key}`);
  const nativeCurrency = {
    name: requireString(entry?.nativeCurrency?.name ?? "Native Token", `nativeCurrency.name for ${key}`),
    symbol: requireString(entry?.nativeCurrency?.symbol ?? key.toUpperCase(), `nativeCurrency.symbol for ${key}`),
    decimals: toPositiveInteger(entry?.nativeCurrency?.decimals ?? 18, `nativeCurrency.decimals for ${key}`),
  };
  const blockExplorerUrl =
    typeof entry?.blockExplorerUrl === "string" && entry.blockExplorerUrl.trim().length > 0
      ? entry.blockExplorerUrl.trim()
      : undefined;
  const contractsEnvFile = resolvePath(
    typeof entry?.contractsEnvFile === "string" && entry.contractsEnvFile.trim().length > 0
      ? entry.contractsEnvFile.trim()
      : `contracts/.env.${key}`,
  );
  const defaultSponsoredTokenAddress =
    typeof entry?.defaults?.sponsoredTokenAddress === "string"
      ? entry.defaults.sponsoredTokenAddress
      : "";
  const defaultSponsoredTransferToAddress =
    typeof entry?.defaults?.sponsoredTransferToAddress === "string"
      ? entry.defaults.sponsoredTransferToAddress
      : "";

  const chainEnv = parseEnvFile(contractsEnvFile);
  const chainEnvValues = chainEnv.values;
  const chainEnvSuffix = getChainKeyEnvSuffix(key);

  upsertEnv(chainEnv.lines, "RPC_URL", rpcUrl);
  upsertEnv(chainEnv.lines, "CHAIN_ID", String(chainId));
  if (isAddress(defaultSponsoredTokenAddress)) {
    upsertEnv(chainEnv.lines, "SPONSORED_TOKEN_ADDRESS", defaultSponsoredTokenAddress);
  }
  if (isAddress(defaultSponsoredTransferToAddress)) {
    upsertEnv(
      chainEnv.lines,
      "SPONSORED_TRANSFER_TO_ADDRESS",
      defaultSponsoredTransferToAddress,
    );
  }

  const sponsorPrivateKey = normalizePrivateKey(
    chainEnvValues.get("SPONSOR_PRIVATE_KEY") ??
      appEnv.values.get(`SPONSOR_PRIVATE_KEY__${chainEnvSuffix}`) ??
      appEnv.values.get("SPONSOR_PRIVATE_KEY") ??
      "",
  );

  if (sponsorPrivateKey) {
    upsertEnv(chainEnv.lines, "SPONSOR_PRIVATE_KEY", sponsorPrivateKey);
    upsertEnv(appEnv.lines, `SPONSOR_PRIVATE_KEY__${chainEnvSuffix}`, sponsorPrivateKey);
  }

  if (!checkOnly) {
    writeEnvFile(contractsEnvFile, chainEnv.lines);
  }

  const normalizedChainEnv = parseEnvFile(contractsEnvFile);
  const normalizedValues = normalizedChainEnv.values;
  const privyAdminProxyAddress = normalizedValues.get("PRIVY_ADMIN_PROXY_ADDRESS");
  const privyLogicalAddress = normalizedValues.get("PRIVY_LOGICAL_ADDRESS");

  if (!isAddress(privyAdminProxyAddress) || !isAddress(privyLogicalAddress)) {
    warnings.push(
      `- ${key}: skipped because PRIVY_ADMIN_PROXY_ADDRESS or PRIVY_LOGICAL_ADDRESS is missing in ${path.relative(appDir, contractsEnvFile)}`,
    );
    continue;
  }

  generatedChains.push({
    key,
    id: chainId,
    name,
    rpcUrl,
    ...(blockExplorerUrl ? { blockExplorerUrl } : {}),
    nativeCurrency,
    contracts: {
      ...(isAddress(normalizedValues.get("FACTORY_ADDRESS"))
        ? { factoryAddress: normalizedValues.get("FACTORY_ADDRESS") }
        : {}),
      ...(isAddress(normalizedValues.get("PRIVY_ADMIN_IMPLEMENTATION_ADDRESS"))
        ? {
            privyAdminImplementationAddress: normalizedValues.get(
              "PRIVY_ADMIN_IMPLEMENTATION_ADDRESS",
            ),
          }
        : {}),
      privyAdminProxyAddress,
      privyLogicalAddress,
      ...(isAddress(normalizedValues.get("SPONSORED_TOKEN_ADDRESS"))
        ? { sponsoredTokenAddress: normalizedValues.get("SPONSORED_TOKEN_ADDRESS") }
        : {}),
      ...(isAddress(normalizedValues.get("SPONSORED_TRANSFER_TO_ADDRESS"))
        ? {
            sponsoredTransferToAddress: normalizedValues.get(
              "SPONSORED_TRANSFER_TO_ADDRESS",
            ),
          }
        : {}),
    },
  });
}

const configuredDefaultChainKey = normalizeChainKey(
  appEnv.values.get("NEXT_PUBLIC_DEFAULT_GAS_SPONSOR_CHAIN_KEY") ??
    registry[0]?.key ??
    generatedChains[0]?.key ??
    "",
);
const defaultChain =
  generatedChains.find((chain) => chain.key === configuredDefaultChainKey) ??
  generatedChains[0] ??
  null;

if (defaultChain) {
  upsertEnv(appEnv.lines, "NEXT_PUBLIC_DEFAULT_GAS_SPONSOR_CHAIN_KEY", defaultChain.key);
  upsertEnv(appEnv.lines, "DEFAULT_GAS_SPONSOR_CHAIN_KEY", defaultChain.key);
  upsertEnv(appEnv.lines, "NEXT_PUBLIC_RPC_URL", defaultChain.rpcUrl);
  upsertEnv(appEnv.lines, "RPC_URL", defaultChain.rpcUrl);
  upsertEnv(
    appEnv.lines,
    "NEXT_PUBLIC_PRIVY_ADMIN_PROXY_ADDRESS",
    defaultChain.contracts.privyAdminProxyAddress,
  );
  upsertEnv(
    appEnv.lines,
    "PRIVY_ADMIN_PROXY_ADDRESS",
    defaultChain.contracts.privyAdminProxyAddress,
  );
  upsertEnv(
    appEnv.lines,
    "NEXT_PUBLIC_PRIVY_LOGICAL_ADDRESS",
    defaultChain.contracts.privyLogicalAddress,
  );
  upsertEnv(
    appEnv.lines,
    "PRIVY_LOGICAL_ADDRESS",
    defaultChain.contracts.privyLogicalAddress,
  );

  if (defaultChain.contracts.sponsoredTokenAddress) {
    upsertEnv(
      appEnv.lines,
      "NEXT_PUBLIC_SPONSORED_TOKEN_ADDRESS",
      defaultChain.contracts.sponsoredTokenAddress,
    );
  }

  if (defaultChain.contracts.sponsoredTransferToAddress) {
    upsertEnv(
      appEnv.lines,
      "NEXT_PUBLIC_SPONSORED_TRANSFER_TO_ADDRESS",
      defaultChain.contracts.sponsoredTransferToAddress,
    );
  }
}

if (!checkOnly) {
  mkdirSync(path.dirname(generatedPath), { recursive: true });
  writeFileSync(generatedPath, `${JSON.stringify(generatedChains, null, 2)}\n`, "utf8");
  writeEnvFile(appEnvPath, appEnv.lines);
}

console.log(`${checkOnly ? "Validated" : "Synced"} gas sponsor chain registry`);
console.log(`- Registry: ${path.relative(appDir, registryPath)}`);
console.log(`- Generated: ${path.relative(appDir, generatedPath)}`);
console.log(`- Active chains: ${generatedChains.length}`);
console.log(`- Default chain: ${defaultChain?.key ?? "<none>"}`);

if (warnings.length > 0) {
  console.warn(warnings.join("\n"));
}
