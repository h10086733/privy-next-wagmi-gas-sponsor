"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useConnectWallet,
  usePrivy,
  useSign7702Authorization,
  useSignMessage,
  useWallets,
} from "@privy-io/react-auth";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseUnits,
} from "viem";

import Section from "../reusables/section";
import {
  showErrorToast,
  showSuccessToast,
} from "@/components/ui/custom-toast";
import {
  buildErc20TransferCalls,
  defaultGasSponsorChainId,
  erc20Abi,
  getUserTransactionHash,
  privyAdminAbi,
  serializePrivyLogicalCalls,
  type Signed7702Authorization,
  type SerializedPrivyLogicalCall,
} from "@/lib/privy-gas-sponsorship";
import {
  getGasSponsorChainConfigByKey,
  requireSupportedChains,
} from "@/lib/gas-sponsor-chains";

const configuredChains = requireSupportedChains();
const defaultChainConfig = configuredChains[0];

type SignedSponsorRequest = {
  chainId: number;
  chainKey: string;
  address: `0x${string}`;
  calls: SerializedPrivyLogicalCall[];
  userSignature: `0x${string}`;
  authorization: Signed7702Authorization;
  walletNonce: string;
  userTransactionHash: `0x${string}`;
};

function getSubmitTransferErrorMessage(error: unknown): string {
  if (
    error instanceof TypeError &&
    error.message === "Failed to fetch"
  ) {
    return "Cannot reach /api/privy-erc20-transfer-7702. Make sure the Next.js server is running on the current origin.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Privy 7702 ERC20 transfer failed";
}

const PrivyErc20Transfer7702 = () => {
  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
  const { signAuthorization } = useSign7702Authorization();
  const { signMessage } = useSignMessage();
  const { connectWallet } = useConnectWallet({
    onSuccess: ({ wallet }) => {
      showSuccessToast(`Connected wallet: ${wallet.address.slice(0, 10)}...`);
    },
    onError: (error) => {
      console.error(error);
      showErrorToast("Failed to connect wallet");
    },
  });

  const evmWallets = useMemo(
    () => wallets.filter((wallet) => wallet.type === "ethereum"),
    [wallets],
  );

  const [selectedChainKey, setSelectedChainKey] = useState(defaultChainConfig.key);
  const [selectedAddress, setSelectedAddress] = useState("");
  const selectedChainConfig = useMemo(
    () =>
      configuredChains.find((chainConfig) => chainConfig.key === selectedChainKey) ??
      defaultChainConfig,
    [selectedChainKey],
  );
  const deployedChainConfig = useMemo(
    () => getGasSponsorChainConfigByKey(selectedChainKey),
    [selectedChainKey],
  );
  const logicalAddress = deployedChainConfig?.contracts.privyLogicalAddress;
  const adminProxyAddress = deployedChainConfig?.contracts.privyAdminProxyAddress;
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: selectedChainConfig.chain,
        transport: http(
          selectedChainConfig.rpcUrl ?? selectedChainConfig.chain.rpcUrls.default.http[0],
        ),
      }),
    [selectedChainConfig],
  );
  const [tokenAddress, setTokenAddress] = useState(
    deployedChainConfig?.contracts.sponsoredTokenAddress ?? "",
  );
  const [recipientAddress, setRecipientAddress] = useState(
    deployedChainConfig?.contracts.sponsoredTransferToAddress ?? "",
  );
  const [amount, setAmount] = useState("1");
  const [decimals, setDecimals] = useState("18");
  const [tokenMetadataLoading, setTokenMetadataLoading] = useState(false);
  const [tokenMetadataError, setTokenMetadataError] = useState<string | null>(null);
  const [senderTokenBalance, setSenderTokenBalance] = useState<bigint | null>(null);
  const [currentAuthorityNonce, setCurrentAuthorityNonce] = useState<bigint | null>(null);
  const [authorityNonceLoading, setAuthorityNonceLoading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestPreview, setRequestPreview] = useState("");
  const [signedRequest, setSignedRequest] = useState<SignedSponsorRequest | null>(
    null,
  );

  useEffect(() => {
    setTokenAddress(deployedChainConfig?.contracts.sponsoredTokenAddress ?? "");
    setRecipientAddress(deployedChainConfig?.contracts.sponsoredTransferToAddress ?? "");
    setDecimals("18");
    setTokenMetadataError(null);
    setSenderTokenBalance(null);
    setCurrentAuthorityNonce(null);
    setSignedRequest(null);
    setRequestPreview("");
  }, [deployedChainConfig, selectedChainConfig]);

  useEffect(() => {
    if (evmWallets.length === 0) {
      setSelectedAddress("");
      return;
    }

    const preferredWallet =
      evmWallets.find(
        (wallet) =>
          wallet.walletClientType === "privy" ||
          wallet.walletClientType === "privy-v2" ||
          wallet.connectorType === "embedded",
      ) ?? evmWallets[0];

    if (!selectedAddress) {
      setSelectedAddress(preferredWallet.address);
      return;
    }

    const walletStillAvailable = evmWallets.some(
      (wallet) => wallet.address === selectedAddress,
    );

    if (!walletStillAvailable) {
      setSelectedAddress(preferredWallet.address);
    }
  }, [evmWallets, selectedAddress]);

  useEffect(() => {
    let cancelled = false;

    async function loadTokenMetadata() {
      if (!selectedAddress || !isAddress(selectedAddress) || !tokenAddress || !isAddress(tokenAddress)) {
        setDecimals("18");
        setTokenMetadataError(null);
        setSenderTokenBalance(null);
        setTokenMetadataLoading(false);
        return;
      }

      setTokenMetadataLoading(true);
      try {
        const normalizedWalletAddress = getAddress(selectedAddress);
        const normalizedTokenAddress = getAddress(tokenAddress);
        const tokenCode = await publicClient.getCode({
          address: normalizedTokenAddress,
          blockTag: "latest",
        });

        if (cancelled) {
          return;
        }

        if (!tokenCode || tokenCode === "0x") {
          setDecimals("18");
          setTokenMetadataError(
            `Token address is not deployed on ${selectedChainConfig.name}. Please verify the token address for this chain.`,
          );
          setSenderTokenBalance(null);
          return;
        }

        const [tokenDecimals, tokenBalance] = await Promise.all([
          publicClient.readContract({
            address: normalizedTokenAddress,
            abi: erc20Abi,
            functionName: "decimals",
          }),
          publicClient.readContract({
            address: normalizedTokenAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [normalizedWalletAddress],
          }),
        ]);

        if (cancelled) {
          return;
        }

        setTokenMetadataError(null);
        setDecimals(String(tokenDecimals));
        setSenderTokenBalance(tokenBalance as bigint);
      } catch {
        if (cancelled) {
          return;
        }
        setDecimals("18");
        setTokenMetadataError(
          `Unable to load token decimals/balance on ${selectedChainConfig.name}. Please verify the token address for this chain.`,
        );
        setSenderTokenBalance(null);
      } finally {
        if (!cancelled) {
          setTokenMetadataLoading(false);
        }
      }
    }

    void loadTokenMetadata();

    return () => {
      cancelled = true;
    };
  }, [publicClient, selectedAddress, selectedChainConfig.name, tokenAddress]);


  useEffect(() => {
    let cancelled = false;

    async function loadAuthorityNonce() {
      if (!selectedAddress || !isAddress(selectedAddress)) {
        setCurrentAuthorityNonce(null);
        setAuthorityNonceLoading(false);
        return;
      }

      setAuthorityNonceLoading(true);
      try {
        const nonce = await publicClient.getTransactionCount({
          address: getAddress(selectedAddress),
          blockTag: "latest",
        });

        if (cancelled) {
          return;
        }

        setCurrentAuthorityNonce(BigInt(nonce));
      } catch (error) {
        console.error(error);
        if (cancelled) {
          return;
        }
        setCurrentAuthorityNonce(null);
      } finally {
        if (!cancelled) {
          setAuthorityNonceLoading(false);
        }
      }
    }

    void loadAuthorityNonce();

    return () => {
      cancelled = true;
    };
  }, [publicClient, selectedAddress, signedRequest]);

  const resetSignedRequest = () => {
    setSignedRequest(null);
    setRequestPreview("");
  };

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error(error);
      showErrorToast("Failed to connect wallet");
    }
  };

  const validateInputs = () => {
    if (!selectedAddress) {
      throw new Error("Please connect an EVM wallet first");
    }

    if (tokenMetadataLoading) {
      throw new Error("Token metadata is still loading. Please wait a moment and try again.");
    }

    if (tokenMetadataError) {
      throw new Error(tokenMetadataError);
    }

    if (senderTokenBalance === null) {
      throw new Error("Unable to load token decimals/balance from chain. Please verify the token address.");
    }

    if (authorityNonceLoading) {
      throw new Error("Authority nonce is still loading. Please wait a moment and try again.");
    }

    if (currentAuthorityNonce === null) {
      throw new Error("Unable to load the selected wallet's current chain nonce.");
    }

    if (!logicalAddress || !isAddress(logicalAddress)) {
      throw new Error(
        `Missing PrivyLogical address for chain ${selectedChainConfig.name}`,
      );
    }

    if (!adminProxyAddress || !isAddress(adminProxyAddress)) {
      throw new Error(
        `Missing PrivyAdmin proxy address for chain ${selectedChainConfig.name}`,
      );
    }

    if (!tokenAddress) {
      throw new Error("Please enter an ERC-20 token address");
    }

    if (!isAddress(tokenAddress)) {
      throw new Error("ERC-20 token address is invalid");
    }

    if (!recipientAddress) {
      throw new Error("Please enter a recipient address");
    }

    if (!isAddress(recipientAddress)) {
      throw new Error("Recipient address is invalid");
    }

    if (!amount || Number(amount) <= 0) {
      throw new Error("Amount must be greater than 0");
    }

    const decimalsNumber = Number(decimals);
    if (!Number.isInteger(decimalsNumber) || decimalsNumber < 0) {
      throw new Error("Decimals must be a non-negative integer");
    }
  };

  const handleSignWithPrivy = async () => {
    setSigning(true);
    try {
      validateInputs();
      resetSignedRequest();

      const normalizedWalletAddress = getAddress(selectedAddress);
      const normalizedTokenAddress = getAddress(tokenAddress);
      const normalizedRecipientAddress = getAddress(recipientAddress);
      const normalizedAdminProxyAddress = getAddress(adminProxyAddress!);
      const parsedAmount = parseUnits(amount, Number(decimals));

      const currentTokenBalance = (await publicClient.readContract({
        address: normalizedTokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [normalizedWalletAddress],
      })) as bigint;

      if (currentTokenBalance < parsedAmount) {
        throw new Error(
          `Insufficient token balance. Have ${formatUnits(currentTokenBalance, Number(decimals))}, need ${amount}.`,
        );
      }

      const walletNonce = (await publicClient.readContract({
        address: normalizedAdminProxyAddress,
        abi: privyAdminAbi,
        functionName: "getWalletNonce",
        args: [normalizedWalletAddress],
      })) as bigint;

      const calls = buildErc20TransferCalls({
        tokenAddress: normalizedTokenAddress,
        toAddress: normalizedRecipientAddress,
        amount: parsedAmount,
      });

      const authorization = await signAuthorization(
        {
          contractAddress: logicalAddress as `0x${string}`,
          chainId: selectedChainConfig.id,
        },
        {
          address: normalizedWalletAddress,
        },
      );

      const signedAuthorizationNonce = BigInt(authorization.nonce);
      if (signedAuthorizationNonce !== currentAuthorityNonce) {
        throw new Error(
          `Privy returned authorization.nonce=${signedAuthorizationNonce}, but the current wallet nonce is ${currentAuthorityNonce}. Please sign again immediately.`,
        );
      }

      const normalizedAuthorizationAddress = getAddress(authorization.address);
      const normalizedLogicalAddress = getAddress(logicalAddress!);
      if (normalizedAuthorizationAddress !== normalizedLogicalAddress) {
        throw new Error(
          `Privy returned authorization.address=${normalizedAuthorizationAddress}, but the configured PrivyLogical address for ${selectedChainConfig.name} is ${normalizedLogicalAddress}. Please refresh the chain config and sign again.`,
        );
      }

      const userTransactionHash = getUserTransactionHash({
        wallet: normalizedWalletAddress,
        calls,
        nonce: walletNonce,
        adminProxyAddress: normalizedAdminProxyAddress,
        chainId: selectedChainConfig.id,
      });

      const { signature: userSignature } = await signMessage(
        {
          message: userTransactionHash,
        },
        {
          address: normalizedWalletAddress,
        },
      );

      const nextSignedRequest: SignedSponsorRequest = {
        chainId: selectedChainConfig.id,
        chainKey: selectedChainConfig.key,
        address: normalizedWalletAddress,
        calls: serializePrivyLogicalCalls(calls),
        userSignature: userSignature as `0x${string}`,
        authorization: {
          address: authorization.address,
          chainId: authorization.chainId,
          nonce: authorization.nonce,
          r: authorization.r,
          s: authorization.s,
          yParity: authorization.yParity,
        },
        walletNonce: walletNonce.toString(),
        userTransactionHash,
      };

      setSignedRequest(nextSignedRequest);
      setRequestPreview(JSON.stringify(nextSignedRequest, null, 2));
      showSuccessToast("Privy signing completed");
    } catch (error) {
      console.error(error);
      showErrorToast(
        error instanceof Error ? error.message : "Privy signing failed",
      );
    } finally {
      setSigning(false);
    }
  };

  const handleSubmitSponsoredTransfer = async () => {
    if (!signedRequest) {
      showErrorToast("Please sign with Privy first");
      return;
    }

    setSubmitting(true);
    try {
      const latestAuthorityNonce = BigInt(
        await publicClient.getTransactionCount({
          address: getAddress(signedRequest.address),
          blockTag: "latest",
        }),
      );

      if (BigInt(signedRequest.authorization.nonce) !== latestAuthorityNonce) {
        resetSignedRequest();
        throw new Error(
          `Signed authorization nonce ${signedRequest.authorization.nonce} is stale. Current wallet nonce is ${latestAuthorityNonce}. Please sign with Privy again.`,
        );
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        throw new Error("Failed to fetch Privy access token");
      }

      const res = await fetch("/api/privy-erc20-transfer-7702", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          chainId: signedRequest.chainId,
          chainKey: signedRequest.chainKey,
          address: signedRequest.address,
          calls: signedRequest.calls,
          userSignature: signedRequest.userSignature,
          authorization: signedRequest.authorization,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const logicalMismatch =
          data.expectedLogicalAddress && data.receivedAuthorizationAddress
            ? ` expected=${data.expectedLogicalAddress}, received=${data.receivedAuthorizationAddress}`
            : "";
        throw new Error(
          (data.detail || data.error || "Request failed") + logicalMismatch,
        );
      }

      if (data.failedCallCount > 0 || data.expectedTransferObserved === false) {
        throw new Error(
          `Transaction mined but token transfer was not observed. hash=${data.hash}`,
        );
      }

      resetSignedRequest();
      showSuccessToast(`Transaction sent: ${data.hash.slice(0, 20)}...`);
    } catch (error) {
      console.error(error);
      showErrorToast(getSubmitTransferErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedWallet = evmWallets.find(
    (wallet) => wallet.address === selectedAddress,
  );
  const signedAuthorizationNonce = signedRequest
    ? BigInt(signedRequest.authorization.nonce)
    : null;
  const isSignedAuthorizationStale =
    signedAuthorizationNonce !== null &&
    currentAuthorityNonce !== null &&
    signedAuthorizationNonce !== currentAuthorityNonce;

  return (
    <Section
      name="Privy 7702 + Backend Sponsor"
      description="前端通过 Privy 完成 7702 authorization 和用户签名；后端再补 operator sponsor 签名并广播 executeSponsored。这里保留显式签名按钮，方便你分步操作和观察签名产物。"
      filepath="src/components/sections/privy-erc20-transfer-7702"
      actions={[
        { name: "Connect Wallet", function: handleConnectWallet },
        {
          name: signing ? "Signing with Privy..." : "Sign with Privy",
          function: handleSignWithPrivy,
          disabled:
            signing ||
            submitting ||
            tokenMetadataLoading ||
            authorityNonceLoading ||
            senderTokenBalance === null,
        },
        {
          name: submitting ? "Submitting..." : "Submit Sponsored Transfer",
          function: handleSubmitSponsoredTransfer,
          disabled:
            !signedRequest ||
            signing ||
            submitting ||
            authorityNonceLoading ||
            isSignedAuthorizationStale,
        },
      ]}
    >
      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Chain</label>
          <select
            value={selectedChainKey}
            onChange={(e) => {
              const nextChainKey = e.target.value;
              const nextDeployedChainConfig = getGasSponsorChainConfigByKey(nextChainKey);
              setSelectedChainKey(nextChainKey);
              setTokenAddress(nextDeployedChainConfig?.contracts.sponsoredTokenAddress ?? "");
              setRecipientAddress(nextDeployedChainConfig?.contracts.sponsoredTransferToAddress ?? "");
              setDecimals("18");
              setTokenMetadataError(null);
              setSenderTokenBalance(null);
              setCurrentAuthorityNonce(null);
              resetSignedRequest();
            }}
            className="w-full px-3 py-2 border border-[#E2E3F0] rounded-md bg-white text-black focus:outline-none focus:ring-1 focus:ring-black text-sm"
          >
            {configuredChains.map((chainConfig) => (
              <option key={chainConfig.key} value={chainConfig.key}>
                {chainConfig.name} ({chainConfig.id})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Sender Wallet Address
          </label>
          <select
            value={selectedAddress}
            onChange={(e) => {
              setSelectedAddress(e.target.value);
              resetSignedRequest();
            }}
            className="w-full px-3 py-2 border border-[#E2E3F0] rounded-md bg-white text-black focus:outline-none focus:ring-1 focus:ring-black text-sm"
          >
            {evmWallets.length === 0 ? (
              <option value="">No EVM wallet connected</option>
            ) : (
              evmWallets.map((wallet) => (
                <option key={wallet.address} value={wallet.address}>
                  {wallet.address} [{wallet.walletClientType}]
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            ERC-20 Token Address
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={tokenAddress}
            onChange={(e) => {
              setTokenAddress(e.target.value);
              setTokenMetadataError(null);
              resetSignedRequest();
            }}
            className="w-full px-3 py-2 border border-[#E2E3F0] rounded-md bg-white text-black focus:outline-none focus:ring-1 focus:ring-black text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Recipient Address
          </label>
          <input
            type="text"
            placeholder="0x..."
            value={recipientAddress}
            onChange={(e) => {
              setRecipientAddress(e.target.value);
              resetSignedRequest();
            }}
            className="w-full px-3 py-2 border border-[#E2E3F0] rounded-md bg-white text-black focus:outline-none focus:ring-1 focus:ring-black text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Amount</label>
            <input
              type="text"
              placeholder="1"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                resetSignedRequest();
              }}
              className="w-full px-3 py-2 border border-[#E2E3F0] rounded-md bg-white text-black focus:outline-none focus:ring-1 focus:ring-black text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Decimals</label>
            <input
              type="number"
              min="0"
              step="1"
              value={decimals}
              readOnly
              className="w-full px-3 py-2 border border-[#E2E3F0] rounded-md bg-gray-50 text-black focus:outline-none text-sm"
            />
          </div>
        </div>

        <div className="text-xs text-gray-500 space-y-1">
          <p>
            Chain key: {selectedChainConfig.key}
          </p>
          <p>Selected wallet: {selectedWallet?.address ?? "No wallet selected"}</p>
          <p>Wallet client: {selectedWallet?.walletClientType ?? "n/a"}</p>
          <p>
            Chain: {selectedChainConfig.name} ({selectedChainConfig.id})
          </p>
          <p>
            Deployment: {deployedChainConfig ? "Ready for gas sponsor" : "Chain added, contracts not deployed yet"}
          </p>
          <p>
            PrivyLogical: {logicalAddress ?? "Missing chain-specific PrivyLogical config"}
          </p>
          <p>
            PrivyAdminProxy: {adminProxyAddress ?? "Missing chain-specific PrivyAdminProxy config"}
          </p>
          <p>Flow: ERC-20 transfer(recipient, amount)</p>
          <p>Note: sponsor/operator only pays gas; token sender is the selected wallet above.</p>
          <p>Token decimals: {decimals}{tokenMetadataLoading ? " (loading...)" : ""}</p>
          <p>Token metadata: {tokenMetadataError ?? "OK"}</p>
          <p>Decimals source: auto-read from ERC-20 contract</p>
          <p>
            Sender token balance: {senderTokenBalance === null ? "Unavailable" : formatUnits(senderTokenBalance, Number(decimals))}
          </p>
          <p>
            Status: {signedRequest ? "Signed with Privy, ready to submit" : "Waiting for Privy signature"}
          </p>
          <p>
            Current authority nonce: {authorityNonceLoading ? "Loading..." : currentAuthorityNonce?.toString() ?? "Unavailable"}
          </p>
          <p>
            Signed authorization nonce: {signedAuthorizationNonce?.toString() ?? "Not signed yet"}
          </p>
          <p>
            Authorization freshness: {signedRequest ? (isSignedAuthorizationStale ? "Stale - sign again" : "Fresh") : "Not signed yet"}
          </p>
          <p>
            Authorization target: {signedRequest?.authorization.address ?? "Not signed yet"}
          </p>
          <p>
            Authorization chain: {signedRequest?.chainId ?? defaultGasSponsorChainId}
          </p>
        </div>

        {requestPreview ? (
          <div>
            <label className="block text-sm font-medium mb-1">
              Signed Sponsor Request Preview
            </label>
            <pre className="w-full max-h-72 overflow-auto rounded-md bg-[#0F172A] p-3 text-xs text-white">
              {requestPreview}
            </pre>
          </div>
        ) : null}
      </div>
    </Section>
  );
};

export default PrivyErc20Transfer7702;
