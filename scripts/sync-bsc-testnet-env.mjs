import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CHAIN_ID = "97";
const DEFAULT_RPC_URL = "https://bsc-testnet.bnbchain.org";
const DEFAULT_TOKEN_ADDRESS = "0x741022f045Bbe7d020ebEdbB376743B63fea28e6";
const DEFAULT_RECIPIENT_ADDRESS = "0x0812aba96cd9a62b38c30e33020b1a76017d9ba1";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, "..");
const contractsDir = path.join(appDir, "contracts");

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
  writeFileSync(filePath, `${lines.join("\n").replace(/\n+$/u, "")}\n`, "utf8");
}

function readJson(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getFirstContractAddress(runJson) {
  for (const tx of runJson.transactions ?? []) {
    if (typeof tx.contractAddress === "string" && tx.contractAddress.length > 0) {
      return tx.contractAddress;
    }
  }

  for (const receipt of runJson.receipts ?? []) {
    if (typeof receipt.contractAddress === "string" && receipt.contractAddress.length > 0) {
      return receipt.contractAddress;
    }
  }

  return null;
}

function getCreate3ProxyAddress(runJson) {
  return runJson.transactions?.find((tx) => tx.transactionType === "CREATE2")?.contractAddress ?? null;
}

function getAdminProxyAddress(runJson) {
  for (const tx of runJson.transactions ?? []) {
    if (tx.function === "deployDeterministicAndCall(address,address,bytes32,bytes)") {
      const proxyAddress = tx.additionalContracts?.find(
        (contract) => contract.transactionType === "CREATE2" && typeof contract.address === "string",
      )?.address;

      if (proxyAddress) {
        return proxyAddress;
      }
    }
  }

  for (const tx of runJson.transactions ?? []) {
    if (tx.function === "addOperator(address)" && typeof tx.contractAddress === "string") {
      return tx.contractAddress;
    }
  }

  return null;
}

function requireAddress(value, label) {
  if (!value || typeof value !== "string") {
    throw new Error(`Unable to resolve ${label}`);
  }

  return value;
}

const contractsEnvPath = path.join(contractsDir, ".env");
const appEnvPath = path.join(appDir, ".env");

const contractsEnv = parseEnvFile(contractsEnvPath);
const appEnv = parseEnvFile(appEnvPath);
const chainId = contractsEnv.values.get("CHAIN_ID") ?? DEFAULT_CHAIN_ID;
const rpcUrl = contractsEnv.values.get("RPC_URL") ?? DEFAULT_RPC_URL;
const sponsorPrivateKey =
  contractsEnv.values.get("SPONSOR_PRIVATE_KEY") ??
  appEnv.values.get("SPONSOR_PRIVATE_KEY") ??
  contractsEnv.values.get("PRIVATE_KEY") ??
  "";

const factoryRun = readJson(path.join(contractsDir, "broadcast", "DeployFactory.s.sol", chainId, "run-latest.json"));
const adminRun = readJson(path.join(contractsDir, "broadcast", "DeployPrivyAdmin.s.sol", chainId, "run-latest.json"));
const logicalRun = readJson(path.join(contractsDir, "broadcast", "DeployPrivyLogical.s.sol", chainId, "run-latest.json"));

const factoryAddress = requireAddress(getFirstContractAddress(factoryRun), "FACTORY_ADDRESS");
const adminImplementationAddress = requireAddress(
  adminRun.transactions?.find((tx) => tx.contractName === "PrivyAdmin")?.contractAddress ?? null,
  "PrivyAdmin implementation address",
);
const adminProxyAddress = requireAddress(getAdminProxyAddress(adminRun), "PRIVY_ADMIN_PROXY_ADDRESS");
const logicalCreate3ProxyAddress = requireAddress(getCreate3ProxyAddress(logicalRun), "PrivyLogical CREATE3 proxy address");
const logicalAddress = requireAddress(
  contractsEnv.values.get("PRIVY_LOGICAL_ADDRESS") ?? appEnv.values.get("PRIVY_LOGICAL_ADDRESS") ?? null,
  "PRIVY_LOGICAL_ADDRESS (expected in contracts/.env after deploy)",
);

upsertEnv(contractsEnv.lines, "FACTORY_ADDRESS", factoryAddress);
upsertEnv(contractsEnv.lines, "PRIVY_ADMIN_IMPLEMENTATION_ADDRESS", adminImplementationAddress);
upsertEnv(contractsEnv.lines, "PRIVY_ADMIN_PROXY_ADDRESS", adminProxyAddress);
upsertEnv(contractsEnv.lines, "PRIVY_LOGICAL_ADDRESS", logicalAddress);
if (sponsorPrivateKey) upsertEnv(contractsEnv.lines, "SPONSOR_PRIVATE_KEY", sponsorPrivateKey);
writeEnvFile(contractsEnvPath, contractsEnv.lines);

upsertEnv(appEnv.lines, "NEXT_PUBLIC_BSC_TESTNET_RPC_URL", rpcUrl);
upsertEnv(appEnv.lines, "BSC_TESTNET_RPC_URL", rpcUrl);
upsertEnv(appEnv.lines, "NEXT_PUBLIC_RPC_URL", rpcUrl);
upsertEnv(appEnv.lines, "RPC_URL", rpcUrl);
if (sponsorPrivateKey) upsertEnv(appEnv.lines, "SPONSOR_PRIVATE_KEY", sponsorPrivateKey);
upsertEnv(appEnv.lines, "NEXT_PUBLIC_PRIVY_ADMIN_PROXY_ADDRESS", adminProxyAddress);
upsertEnv(appEnv.lines, "PRIVY_ADMIN_PROXY_ADDRESS", adminProxyAddress);
upsertEnv(appEnv.lines, "NEXT_PUBLIC_PRIVY_LOGICAL_ADDRESS", logicalAddress);
upsertEnv(appEnv.lines, "PRIVY_LOGICAL_ADDRESS", logicalAddress);
upsertEnv(appEnv.lines, "NEXT_PUBLIC_SPONSORED_TOKEN_ADDRESS", DEFAULT_TOKEN_ADDRESS);
upsertEnv(appEnv.lines, "NEXT_PUBLIC_SPONSORED_TRANSFER_TO_ADDRESS", DEFAULT_RECIPIENT_ADDRESS);
writeEnvFile(appEnvPath, appEnv.lines);

console.log("Synced deployment env for BSC testnet");
console.log(`- Chain ID: ${chainId}`);
console.log(`- RPC URL: ${rpcUrl}`);
console.log(`- Factory: ${factoryAddress}`);
console.log(`- PrivyAdmin implementation: ${adminImplementationAddress}`);
console.log(`- PrivyAdmin proxy: ${adminProxyAddress}`);
console.log(`- PrivyLogical CREATE3 proxy: ${logicalCreate3ProxyAddress}`);
console.log(`- PrivyLogical: ${logicalAddress}`);
console.log(`- Sponsor private key source: ${sponsorPrivateKey ? "synced" : "missing"}`);
console.log(`- Updated: ${path.relative(appDir, contractsEnvPath)}`);
console.log(`- Updated: ${path.relative(appDir, appEnvPath)}`);
