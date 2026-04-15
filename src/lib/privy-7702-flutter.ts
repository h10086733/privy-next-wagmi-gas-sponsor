import {
  concatHex,
  keccak256,
  numberToHex,
  parseSignature,
  toRlp,
  type Address,
  type Hex,
} from "viem";

import type { Signed7702Authorization } from "@/lib/privy-gas-sponsorship";

export type AuthorizationDigestParams = {
  chainId: number;
  contractAddress: Address;
  nonce: number | bigint;
};

export type FlutterRawHashRpcRequest = {
  method: "secp256k1_sign";
  params: [Hex];
};

export type FlutterAuthorizationRpcRequest = {
  method: "eth_sign7702Authorization";
  params: [
    {
      contract: Address;
      chain_id: number;
      nonce: number;
    },
  ];
};

function normalizeYParity(yParity: number | undefined, v: bigint | undefined): number {
  if (yParity === 0 || yParity === 1) {
    return yParity;
  }

  if (v === BigInt(27) || v === BigInt(28)) {
    return Number(v - BigInt(27));
  }

  throw new Error("Signature must contain yParity or v=27/28");
}

export function hash7702AuthorizationForFlutter({
  chainId,
  contractAddress,
  nonce,
}: AuthorizationDigestParams): Hex {
  return keccak256(
    concatHex([
      "0x05",
      toRlp([numberToHex(chainId), contractAddress, numberToHex(BigInt(nonce))]),
    ]),
  );
}

export function buildFlutter7702RawHashRequest(
  params: AuthorizationDigestParams,
): FlutterRawHashRpcRequest {
  return {
    method: "secp256k1_sign",
    params: [hash7702AuthorizationForFlutter(params)],
  };
}

export function buildFlutter7702RpcRequest(
  params: AuthorizationDigestParams,
): FlutterAuthorizationRpcRequest {
  return {
    method: "eth_sign7702Authorization",
    params: [
      {
        contract: params.contractAddress,
        chain_id: params.chainId,
        nonce: Number(params.nonce),
      },
    ],
  };
}

export function toSigned7702Authorization({
  chainId,
  contractAddress,
  nonce,
  signature,
}: AuthorizationDigestParams & {
  signature: Hex;
}): Signed7702Authorization {
  const parsed = parseSignature(signature);

  return {
    address: contractAddress,
    chainId,
    nonce: Number(nonce),
    r: parsed.r,
    s: parsed.s,
    yParity: normalizeYParity(parsed.yParity, parsed.v),
    v: parsed.v,
  };
}

export function buildSigned7702AuthorizationFromRawHashSignature(
  params: AuthorizationDigestParams & { signature: Hex },
): Signed7702Authorization {
  return toSigned7702Authorization(params);
}

export const flutter7702MigrationNotes = {
  rpcMethod: "secp256k1_sign",
  digestFormula: "keccak256(0x05 || rlp([chain_id, contract_address, nonce]))",
  warning: "Use secp256k1_sign for EIP-7702 authorization digests. Do not use personal_sign.",
} as const;

