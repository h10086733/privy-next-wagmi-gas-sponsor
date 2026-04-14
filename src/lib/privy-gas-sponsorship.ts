import {
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  keccak256,
  parseAbi,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { bscTestnet } from "viem/chains";

import { defaultGasSponsorChainConfig } from "@/lib/gas-sponsor-chains";

export const defaultGasSponsorChain =
  defaultGasSponsorChainConfig?.chain ?? bscTestnet;
export const defaultGasSponsorChainId = defaultGasSponsorChain.id;

export const gasSponsorChain = defaultGasSponsorChain;
export const gasSponsorChainId = defaultGasSponsorChainId;

export type Signed7702Authorization = {
  address: `0x${string}`;
  chainId: number;
  nonce: number;
  r: `0x${string}`;
  s: `0x${string}`;
  yParity: number;
  v?: bigint;
};

export type PrivyLogicalCall = {
  to: Address;
  value: bigint;
  data: Hex;
};

export type SerializedPrivyLogicalCall = {
  to: Address;
  value: string;
  data: Hex;
};

export const privyAdminAbi = parseAbi([
  "function getWalletNonce(address wallet) view returns (uint256)",
  "function getOperatorNonce(address operator) view returns (uint256)",
  "function nextOperatorNonce() returns (uint256)",
  "function operators(address operator) view returns (bool)",
]);

export const privyLogicalAbi = parseAbi([
  "function executeSponsored((address to, uint256 value, bytes data)[] calls, bytes userSignature, bytes operatorSignature, address operator) payable returns (uint256)",
  "function getUserTransactionHash(address wallet, (address to, uint256 value, bytes data)[] calls, uint256 nonce) view returns (bytes32)",
  "function getAdminTransactionHash(address wallet, (address to, uint256 value, bytes data)[] calls, uint256 operatorNonce) view returns (bytes32)",
  "function PRIVY_ADMIN() view returns (address)",
  "event CallExecuted(address indexed to, uint256 value, bytes data, bool success)",
  "event BatchExecuted(uint256 indexed timestamp, (address to, uint256 value, bytes data)[] calls)",
  "event CallFailed(address indexed to, bytes data, bytes returnData)",
]);

export const erc20Abi = parseAbi([
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

const callArrayAbi = parseAbiParameters(
  "(address to, uint256 value, bytes data)[] calls",
);

export function serializePrivyLogicalCalls(
  calls: readonly PrivyLogicalCall[],
): SerializedPrivyLogicalCall[] {
  return calls.map((call) => ({
    to: call.to,
    value: call.value.toString(),
    data: call.data,
  }));
}

export function parsePrivyLogicalCalls(
  calls: readonly SerializedPrivyLogicalCall[],
): PrivyLogicalCall[] {
  return calls.map((call) => ({
    to: call.to,
    value: BigInt(call.value),
    data: call.data,
  }));
}

export function encodePrivyLogicalCalls(
  calls: readonly PrivyLogicalCall[],
): Hex {
  return encodeAbiParameters(callArrayAbi, [calls]);
}

export function getUserTransactionHash({
  wallet,
  calls,
  nonce,
  adminProxyAddress,
  chainId = defaultGasSponsorChainId,
}: {
  wallet: Address;
  calls: readonly PrivyLogicalCall[];
  nonce: bigint;
  adminProxyAddress: Address;
  chainId?: number;
}): Hex {
  return keccak256(
    encodePacked(
      ["address", "bytes", "uint256", "uint256", "address"],
      [wallet, encodePrivyLogicalCalls(calls), nonce, BigInt(chainId), adminProxyAddress],
    ),
  );
}

export function getOperatorTransactionHash({
  wallet,
  calls,
  operatorNonce,
  adminProxyAddress,
  chainId = defaultGasSponsorChainId,
}: {
  wallet: Address;
  calls: readonly PrivyLogicalCall[];
  operatorNonce: bigint;
  adminProxyAddress: Address;
  chainId?: number;
}): Hex {
  return keccak256(
    encodePacked(
      ["address", "bytes", "uint256", "uint256", "address", "string"],
      [
        wallet,
        encodePrivyLogicalCalls(calls),
        operatorNonce,
        BigInt(chainId),
        adminProxyAddress,
        "SPONSOR",
      ],
    ),
  );
}

export function buildErc20TransferCalls({
  tokenAddress,
  toAddress,
  amount,
}: {
  tokenAddress: Address;
  toAddress: Address;
  amount: bigint;
}): PrivyLogicalCall[] {
  return [
    {
      to: tokenAddress,
      value: BigInt(0),
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [toAddress, amount],
      }),
    },
  ];
}
