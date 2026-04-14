import { NextRequest, NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  http,
  isAddress,
  isHex,
  verifyMessage,
} from "viem";
import { recoverAuthorizationAddress } from "viem/utils";

import {
  erc20Abi,
  getOperatorTransactionHash,
  getUserTransactionHash,
  parsePrivyLogicalCalls,
  privyAdminAbi,
  privyLogicalAbi,
  type SerializedPrivyLogicalCall,
  type Signed7702Authorization,
} from "@/lib/privy-gas-sponsorship";
import {
  requireGasSponsorChainConfig,
} from "@/lib/gas-sponsor-chains";
import {
  getSponsorPrivateKey,
  privyServerClient,
} from "@/lib/privy-gas-sponsorship-server";

type Erc20Transfer7702Body = {
  chainId?: number;
  chainKey?: string;
  address: string;
  calls: SerializedPrivyLogicalCall[];
  userSignature: `0x${string}`;
  authorization: Signed7702Authorization;
};

function getBearerToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.replace("Bearer ", "");
}

function linkedWalletsContainAddress(
  user: {
    linked_accounts?: Array<{ type?: string; chain_type?: string; address?: string }>;
  },
  address: `0x${string}`,
): boolean {
  return (user.linked_accounts ?? []).some((account) => {
    if (
      account.type !== "wallet" ||
      account.chain_type !== "ethereum" ||
      !account.address
    ) {
      return false;
    }

    try {
      return getAddress(account.address) === address;
    } catch {
      return false;
    }
  });
}

function isEip7702DelegatedCode(code: `0x${string}`): boolean {
  return code.startsWith("0xef0100") && code.length === 48;
}

function getDelegatedTargetFromCode(code: `0x${string}`): `0x${string}` | null {
  if (!isEip7702DelegatedCode(code)) {
    return null;
  }

  return getAddress(`0x${code.slice(8)}`);
}

function getErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export async function POST(req: NextRequest) {
  try {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const verifiedAccessToken = await privyServerClient
      .utils()
      .auth()
      .verifyAccessToken(accessToken);
    const privyUser = await privyServerClient.users()._get(
      verifiedAccessToken.user_id,
    );

    const body = (await req.json()) as Partial<Erc20Transfer7702Body>;
    const { address, calls, userSignature, authorization } = body;

    if (!address || !calls || calls.length === 0 || !userSignature || !authorization) {
      return NextResponse.json(
        { error: "Missing address, calls, userSignature, or authorization" },
        { status: 400 },
      );
    }

    if (!isAddress(address) || !isAddress(authorization.address)) {
      return NextResponse.json(
        { error: "Invalid address in request body" },
        { status: 400 },
      );
    }

    for (const call of calls) {
      if (!isAddress(call.to) || !isHex(call.data)) {
        return NextResponse.json(
          { error: "Each call must include a valid to and hex data" },
          { status: 400 },
        );
      }
    }

    let resolvedChainConfig;
    try {
      resolvedChainConfig = requireGasSponsorChainConfig({
        chainId: body.chainId ?? authorization.chainId,
        chainKey: body.chainKey,
      });
    } catch (error) {
      return NextResponse.json(
        { error: getErrorDetail(error) },
        { status: 400 },
      );
    }

    if (body.chainId !== undefined && body.chainId !== resolvedChainConfig.id) {
      return NextResponse.json(
        {
          error: `chainId does not match selected chain ${resolvedChainConfig.name}`,
        },
        { status: 400 },
      );
    }

    const normalizedUserAddress = getAddress(address);
    const normalizedLogicalAddress = getAddress(
      resolvedChainConfig.contracts.privyLogicalAddress,
    );
    const normalizedAdminProxyAddress = getAddress(
      resolvedChainConfig.contracts.privyAdminProxyAddress,
    );
    const normalizedAuthorizationAddress = getAddress(authorization.address);

    if (!linkedWalletsContainAddress(privyUser, normalizedUserAddress)) {
      return NextResponse.json(
        { error: "Selected wallet is not linked to the authenticated Privy user" },
        { status: 403 },
      );
    }

    if (normalizedAuthorizationAddress !== normalizedLogicalAddress) {
      return NextResponse.json(
        {
          error: "authorization.address must match the deployed PrivyLogical address",
          expectedLogicalAddress: normalizedLogicalAddress,
          receivedAuthorizationAddress: normalizedAuthorizationAddress,
        },
        { status: 400 },
      );
    }

    if (authorization.chainId !== resolvedChainConfig.id) {
      return NextResponse.json(
        {
          error: `authorization.chainId must be ${resolvedChainConfig.id} for ${resolvedChainConfig.name}`,
        },
        { status: 400 },
      );
    }

    const parsedCalls = parsePrivyLogicalCalls(calls).map((call) => ({
      to: getAddress(call.to),
      value: call.value,
      data: call.data,
    }));

    const recoveredAuthorizationSigner = await recoverAuthorizationAddress({
      authorization: {
        address: normalizedAuthorizationAddress,
        chainId: authorization.chainId,
        nonce: authorization.nonce,
        r: authorization.r,
        s: authorization.s,
        yParity: authorization.yParity,
      },
    });

    if (recoveredAuthorizationSigner !== normalizedUserAddress) {
      return NextResponse.json(
        { error: "Authorization was not signed by the selected wallet" },
        { status: 400 },
      );
    }

    const rpcUrl = resolvedChainConfig.rpcUrl;
    const sponsorAccount = privateKeyToAccount(
      getSponsorPrivateKey(resolvedChainConfig.key),
    );

    const publicClient = createPublicClient({
      chain: resolvedChainConfig.chain,
      transport: http(rpcUrl),
    });

    const walletClient = createWalletClient({
      account: sponsorAccount,
      chain: resolvedChainConfig.chain,
      transport: http(rpcUrl),
    });

    const authorizationSignerNonce = BigInt(
      await publicClient.getTransactionCount({
        address: normalizedUserAddress,
        blockTag: "latest",
      }),
    );
    const authorizationSignerCode =
      (await publicClient.getCode({
        address: normalizedUserAddress,
        blockTag: "latest",
      })) ?? "0x";
    const delegatedTarget =
      authorizationSignerCode === "0x"
        ? null
        : getDelegatedTargetFromCode(authorizationSignerCode);

    if (BigInt(authorization.nonce) !== authorizationSignerNonce) {
      return NextResponse.json(
        {
          error: "7702 authorization nonce is stale. Please sign with Privy again.",
          expectedAuthorizationNonce: authorizationSignerNonce.toString(),
          receivedAuthorizationNonce: authorization.nonce.toString(),
        },
        { status: 400 },
      );
    }

    if (authorizationSignerCode !== "0x" && delegatedTarget === null) {
      return NextResponse.json(
        {
          error:
            "Selected wallet already has non-7702 code deployed, so the authorization is invalid for delegation.",
          authorizationSignerCode,
        },
        { status: 400 },
      );
    }

    const isOperator = (await publicClient.readContract({
      address: normalizedAdminProxyAddress,
      abi: privyAdminAbi,
      functionName: "operators",
      args: [sponsorAccount.address],
    })) as boolean;

    if (!isOperator) {
      return NextResponse.json(
        {
          error: `Sponsor wallet ${sponsorAccount.address} is not a registered operator`,
        },
        { status: 500 },
      );
    }

    const walletNonce = (await publicClient.readContract({
      address: normalizedAdminProxyAddress,
      abi: privyAdminAbi,
      functionName: "getWalletNonce",
      args: [normalizedUserAddress],
    })) as bigint;

    const userTransactionHash = getUserTransactionHash({
      wallet: normalizedUserAddress,
      calls: parsedCalls,
      nonce: walletNonce,
      adminProxyAddress: normalizedAdminProxyAddress,
      chainId: resolvedChainConfig.id,
    });

    const isUserSignatureValid = await verifyMessage({
      address: normalizedUserAddress,
      message: { raw: userTransactionHash },
      signature: userSignature,
    });

    if (!isUserSignatureValid) {
      return NextResponse.json(
        { error: "Invalid user signature for current wallet nonce" },
        { status: 400 },
      );
    }

    const operatorNonceTxHash = await walletClient.writeContract({
      address: normalizedAdminProxyAddress,
      abi: privyAdminAbi,
      functionName: "nextOperatorNonce",
      args: [],
      account: sponsorAccount,
      chain: resolvedChainConfig.chain,
    });

    await publicClient.waitForTransactionReceipt({ hash: operatorNonceTxHash });

    const operatorNonce = (await publicClient.readContract({
      address: normalizedAdminProxyAddress,
      abi: privyAdminAbi,
      functionName: "getOperatorNonce",
      args: [sponsorAccount.address],
    })) as bigint;

    const operatorTransactionHash = getOperatorTransactionHash({
      wallet: normalizedUserAddress,
      calls: parsedCalls,
      operatorNonce,
      adminProxyAddress: normalizedAdminProxyAddress,
      chainId: resolvedChainConfig.id,
    });

    const operatorSignature = await sponsorAccount.signMessage({
      message: { raw: operatorTransactionHash },
    });

    const calldata = encodeFunctionData({
      abi: privyLogicalAbi,
      functionName: "executeSponsored",
      args: [
        parsedCalls,
        userSignature,
        operatorSignature,
        sponsorAccount.address,
      ],
    });

    const authorizationList = [
      {
        address: normalizedAuthorizationAddress,
        chainId: authorization.chainId,
        nonce: authorization.nonce,
        r: authorization.r,
        s: authorization.s,
        yParity: authorization.yParity,
      },
    ] as const;

    let gasLimit: bigint;

    try {
      gasLimit = await publicClient.estimateGas({
        account: sponsorAccount.address,
        to: normalizedUserAddress,
        value: BigInt(0),
        data: calldata,
        authorizationList,
      });
    } catch (error) {
      const detail = getErrorDetail(error);
      console.error("7702 preflight failed during estimateGas", error);
      return NextResponse.json(
        {
          error: "7702 preflight failed; transaction was not broadcast.",
          detail,
          authorizationNonce: authorization.nonce.toString(),
          operatorNonce: operatorNonce.toString(),
          operator: sponsorAccount.address,
          delegatedTarget,
        },
        { status: 400 },
      );
    }

    let maxFeePerGas: bigint | undefined;
    let maxPriorityFeePerGas: bigint | undefined;
    try {
      const fees = await publicClient.estimateFeesPerGas();
      maxFeePerGas = fees.maxFeePerGas;
      maxPriorityFeePerGas = fees.maxPriorityFeePerGas;
    } catch (error) {
      console.warn(
        "estimateFeesPerGas failed, letting wallet client infer fees",
        error,
      );
    }

    const hash = await walletClient.sendTransaction({
      account: sponsorAccount,
      chain: resolvedChainConfig.chain,
      type: "eip7702",
      to: normalizedUserAddress,
      value: BigInt(0),
      data: calldata,
      gas: gasLimit,
      authorizationList,
      ...(maxFeePerGas ? { maxFeePerGas } : {}),
      ...(maxPriorityFeePerGas ? { maxPriorityFeePerGas } : {}),
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    const logicalLogs = receipt.logs
      .filter((log) => {
        try {
          return getAddress(log.address) === normalizedUserAddress;
        } catch {
          return false;
        }
      })
      .map((log) => {
        try {
          return decodeEventLog({
            abi: privyLogicalAbi,
            data: log.data,
            topics: log.topics,
          });
        } catch {
          return null;
        }
      })
      .filter((log) => log !== null);

    const callExecutedLogs = logicalLogs.filter(
      (log) => log.eventName === "CallExecuted",
    );
    const callFailedLogs = logicalLogs.filter(
      (log) => log.eventName === "CallFailed",
    );

    let expectedTransferObserved: boolean | null = null;
    if (parsedCalls.length === 1) {
      try {
        const decodedTransfer = decodeFunctionData({
          abi: erc20Abi,
          data: parsedCalls[0].data,
        });

        if (decodedTransfer.functionName === "transfer") {
          const expectedRecipient = getAddress(decodedTransfer.args[0]);
          const expectedAmount = decodedTransfer.args[1];
          const normalizedTokenAddress = getAddress(parsedCalls[0].to);

          expectedTransferObserved = receipt.logs.some((log) => {
            try {
              if (getAddress(log.address) !== normalizedTokenAddress) {
                return false;
              }

              const decodedLog = decodeEventLog({
                abi: erc20Abi,
                data: log.data,
                topics: log.topics,
              });

              return (
                decodedLog.eventName === "Transfer" &&
                getAddress(decodedLog.args.from) === normalizedUserAddress &&
                getAddress(decodedLog.args.to) === expectedRecipient &&
                decodedLog.args.value === expectedAmount
              );
            } catch {
              return false;
            }
          });
        }
      } catch {
        expectedTransferObserved = null;
      }
    }

    return NextResponse.json({
      chainId: resolvedChainConfig.id,
      chainKey: resolvedChainConfig.key,
      hash,
      operator: sponsorAccount.address,
      operatorNonce: operatorNonce.toString(),
      operatorNonceTxHash,
      receiptStatus: receipt.status,
      failedCallCount: callFailedLogs.length,
      callResults: callExecutedLogs.map((log) => ({
        to: log.args.to,
        success: log.args.success,
      })),
      expectedTransferObserved,
    });
  } catch (error) {
    console.error("Privy 7702 ERC20 transfer failed:", error);
    return NextResponse.json(
      {
        error: "Privy 7702 ERC20 transfer failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
