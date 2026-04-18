"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  useConnectWallet,
  usePrivy,
  useSignMessage,
  useWallets,
} from "@privy-io/react-auth";

import Section from "../reusables/section";
import {
  showErrorToast,
  showSuccessToast,
} from "@/components/ui/custom-toast";
import {
  bindPumpkinMfa,
  fetchPumpkinMfaStatus,
  fetchPumpkinUserInfo,
  submitPumpkinWithdraw,
  type PumpkinMfaStatus,
  type PumpkinUserInfo,
  unbindPumpkinMfa,
} from "@/lib/pumpkin-api";
import { generateQrCodeDataUrl } from "@/lib/qrcode";

const pumpkinBaseUrl =
  process.env.NEXT_PUBLIC_PUMPKIN_API_BASE_URL ?? "https://test-app.pumpkin.date";

function formatJsonPreview(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function formatBooleanFlag(value: boolean | null | undefined): string {
  if (value === true) {
    return "Yes";
  }

  if (value === false) {
    return "No";
  }

  return "-";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export default function PumpkinMfaWithdraw() {
  const { wallets } = useWallets();
  const { getAccessToken } = usePrivy();
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
  const [selectedAddress, setSelectedAddress] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [manualAccessToken, setManualAccessToken] = useState("");
  const [initializingBind, setInitializingBind] = useState(false);
  const [confirmingBind, setConfirmingBind] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [submittingWithdraw, setSubmittingWithdraw] = useState(false);
  const [userInfo, setUserInfo] = useState<PumpkinUserInfo | null>(null);
  const [mfaStatus, setMfaStatus] = useState<PumpkinMfaStatus | null>(null);
  const [bindCode, setBindCode] = useState("");
  const [unbindCode, setUnbindCode] = useState("");
  const [withdrawMfaCode, setWithdrawMfaCode] = useState("");
  const [withdrawVal, setWithdrawVal] = useState("{}");
  const [pendingBindSecret, setPendingBindSecret] = useState("");
  const [pendingBindOtpAuthUrl, setPendingBindOtpAuthUrl] = useState("");
  const [pendingBindQrCodeUrl, setPendingBindQrCodeUrl] = useState("");
  const [pendingBindQrLoading, setPendingBindQrLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState("");

  const selectedWallet = evmWallets.find((wallet) => wallet.address === selectedAddress);
  const effectiveMfaBound = userInfo?.mfaBound ?? mfaStatus?.bound ?? false;

  useEffect(() => {
    if (evmWallets.length === 0) {
      if (selectedAddress) {
        setSelectedAddress("");
      }
      return;
    }

    const walletStillAvailable = evmWallets.some(
      (wallet) => wallet.address === selectedAddress,
    );

    if (!walletStillAvailable) {
      setSelectedAddress(evmWallets[0].address);
    }
  }, [evmWallets, selectedAddress]);

  useEffect(() => {
    if (!pendingBindOtpAuthUrl) {
      setPendingBindQrCodeUrl("");
      setPendingBindQrLoading(false);
      return;
    }

    let cancelled = false;

    async function buildQrCode() {
      setPendingBindQrLoading(true);
      try {
        const nextQrCodeUrl = await generateQrCodeDataUrl(pendingBindOtpAuthUrl);
        if (!cancelled) {
          setPendingBindQrCodeUrl(nextQrCodeUrl);
        }
      } catch (error) {
        console.error("Failed to generate otpauth QR code", error);
        if (!cancelled) {
          setPendingBindQrCodeUrl("");
        }
      } finally {
        if (!cancelled) {
          setPendingBindQrLoading(false);
        }
      }
    }

    void buildQrCode();

    return () => {
      cancelled = true;
    };
  }, [pendingBindOtpAuthUrl]);

  useEffect(() => {
    const abortController = new AbortController();

    async function bootstrapPumpkinState() {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          return;
        }

        const [userInfoResponse, mfaStatusResponse] = await Promise.all([
          fetchPumpkinUserInfo(accessToken, abortController.signal),
          fetchPumpkinMfaStatus(accessToken, abortController.signal),
        ]);

        setUserInfo(userInfoResponse.data);
        setMfaStatus(mfaStatusResponse.data);

        if (!mfaStatusResponse.data.pendingBind) {
          setPendingBindSecret("");
          setPendingBindOtpAuthUrl("");
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        console.error("Failed to bootstrap Pumpkin MFA state", error);
      }
    }

    void bootstrapPumpkinState();

    return () => {
      abortController.abort();
    };
  }, [getAccessToken]);

  const rememberResponse = (title: string, value: unknown) => {
    setLastResponse(`${title}\n${formatJsonPreview(value)}`);
  };

  const handleConnectWallet = async () => {
    try {
      await connectWallet();
    } catch (error) {
      console.error(error);
      showErrorToast("Failed to connect wallet");
    }
  };

  const getAccessTokenOrThrow = async () => {
    const manualToken = manualAccessToken.trim();
    if (manualToken) {
      return manualToken;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new Error("Failed to fetch Privy access token");
    }

    return accessToken;
  };

  const signFreshTimestamp = async () => {
    if (!selectedAddress) {
      throw new Error("Please connect or select an EVM wallet first");
    }

    const timestamp = Date.now();
    const { signature } = await signMessage(
      {
        message: String(timestamp),
      },
      {
        address: selectedAddress,
      },
    );

    return {
      timestamp,
      sign: signature,
    };
  };

  const refreshPumpkinState = async ({
    silent = false,
    updatePreview = true,
  }: {
    silent?: boolean;
    updatePreview?: boolean;
  } = {}) => {
    setRefreshing(true);
    try {
      const accessToken = await getAccessTokenOrThrow();
      const [userInfoResponse, mfaStatusResponse] = await Promise.all([
        fetchPumpkinUserInfo(accessToken),
        fetchPumpkinMfaStatus(accessToken),
      ]);

      setUserInfo(userInfoResponse.data);
      setMfaStatus(mfaStatusResponse.data);

      if (!mfaStatusResponse.data.pendingBind) {
        setPendingBindSecret("");
        setPendingBindOtpAuthUrl("");
      }

      if (updatePreview) {
        rememberResponse("Pumpkin state", {
          userInfo: userInfoResponse.data,
          mfaStatus: mfaStatusResponse.data,
        });
      }

      if (!silent) {
        showSuccessToast("Pumpkin state refreshed");
      }
    } catch (error) {
      console.error(error);
      if (!silent) {
        showErrorToast(getErrorMessage(error));
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleInitBind = async () => {
    setInitializingBind(true);
    try {
      const accessToken = await getAccessTokenOrThrow();
      const payload = await signFreshTimestamp();
      const response = await bindPumpkinMfa(accessToken, payload);
      const nextUserInfo = await fetchPumpkinUserInfo(accessToken);

      setMfaStatus(response.data);
      setUserInfo(nextUserInfo.data);
      setPendingBindSecret(response.data.secret ?? "");
      setPendingBindOtpAuthUrl(response.data.otpauthUrl ?? "");
      rememberResponse("MFA bind init", response.data);
      showSuccessToast("2FA 初始化成功，请导入认证器后确认绑定");
    } catch (error) {
      console.error(error);
      showErrorToast(getErrorMessage(error));
    } finally {
      setInitializingBind(false);
    }
  };

  const handleConfirmBind = async () => {
    const normalizedCode = bindCode.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      showErrorToast("Please enter the current 6-digit TOTP code");
      return;
    }

    setConfirmingBind(true);
    try {
      const accessToken = await getAccessTokenOrThrow();
      const payload = await signFreshTimestamp();
      const response = await bindPumpkinMfa(accessToken, {
        ...payload,
        code: normalizedCode,
      });

      setBindCode("");
      setPendingBindSecret("");
      setPendingBindOtpAuthUrl("");
      setMfaStatus(response.data);
      rememberResponse("MFA bind confirm", response.data);
      await refreshPumpkinState({ silent: true, updatePreview: false });
      showSuccessToast("2FA 绑定成功");
    } catch (error) {
      console.error(error);
      showErrorToast(getErrorMessage(error));
    } finally {
      setConfirmingBind(false);
    }
  };

  const handleUnbind = async () => {
    const normalizedCode = unbindCode.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      showErrorToast("Please enter the current 6-digit TOTP code");
      return;
    }

    setUnbinding(true);
    try {
      const accessToken = await getAccessTokenOrThrow();
      const payload = await signFreshTimestamp();
      const response = await unbindPumpkinMfa(accessToken, {
        ...payload,
        code: normalizedCode,
      });

      setUnbindCode("");
      setMfaStatus(response.data);
      rememberResponse("MFA unbind", response.data);
      await refreshPumpkinState({ silent: true, updatePreview: false });
      showSuccessToast("2FA 已解绑");
    } catch (error) {
      console.error(error);
      showErrorToast(getErrorMessage(error));
    } finally {
      setUnbinding(false);
    }
  };

  const handleSubmitWithdraw = async () => {
    setSubmittingWithdraw(true);
    try {
      const parsedVal = JSON.parse(withdrawVal) as unknown;
      const normalizedMfaCode = withdrawMfaCode.trim();

      if (effectiveMfaBound && !/^\d{6}$/.test(normalizedMfaCode)) {
        throw new Error("当前用户已开启 2FA，提现必须携带 6 位 mfaCode");
      }

      const accessToken = await getAccessTokenOrThrow();
      const response = await submitPumpkinWithdraw(accessToken, {
        val: parsedVal,
        ...(normalizedMfaCode ? { mfaCode: normalizedMfaCode } : {}),
      });

      setWithdrawMfaCode("");
      rememberResponse("Withdraw response", response.data);
      showSuccessToast("提现请求已提交");
    } catch (error) {
      console.error(error);
      showErrorToast(getErrorMessage(error));
    } finally {
      setSubmittingWithdraw(false);
    }
  };

  const sectionBusy =
    refreshing || initializingBind || confirmingBind || unbinding || submittingWithdraw;

  return (
    <Section
      name="Pumpkin MFA + Withdraw"
      description="基于当前 Privy 登录态获取 access token，再用已连接钱包对毫秒级 timestamp 做 signMessage(String(timestamp))，完成 Pumpkin 2FA 绑定、解绑和提现校验。请求会通过本地 /api/pumpkin/* 代理转发到 Pumpkin 后端。"
      filepath="src/components/sections/pumpkin-mfa-withdraw.tsx"
      actions={[
        {
          name: "Connect Wallet",
          function: () => {
            void handleConnectWallet();
          },
          disabled: sectionBusy,
        },
        {
          name: refreshing ? "Refreshing..." : "Refresh Pumpkin State",
          function: () => {
            void refreshPumpkinState();
          },
          disabled: sectionBusy,
        },
      ]}
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-2xl border border-gray-200 p-5">
          <div className="flex flex-col gap-3">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Manual Token Override</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                你可以直接把 Pumpkin token 粘贴到这里。只要文本框非空，MFA 和提现请求都会优先使用这个 token；清空后再回退到当前 Privy 登录态自动获取。
              </p>
            </div>
            <textarea
              value={manualAccessToken}
              onChange={(event) => {
                setManualAccessToken(event.target.value);
              }}
              placeholder="Paste token here..."
              className="min-h-28 w-full rounded-md border border-[#E2E3F0] bg-white px-3 py-2 font-mono text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
            />
            <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
              <span>{manualAccessToken.trim() ? "Using manual token" : "Using Privy access token fallback"}</span>
              {manualAccessToken ? (
                <button
                  className="button-secondary"
                  onClick={() => {
                    setManualAccessToken("");
                  }}
                  type="button"
                >
                  Clear Token
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Backend</div>
            <div className="mt-2 break-all text-sm font-medium text-gray-900">{pumpkinBaseUrl}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">Selected Wallet</div>
            <div className="mt-2 break-all text-sm font-medium text-gray-900">
              {selectedAddress || "No EVM wallet selected"}
            </div>
            {selectedWallet ? (
              <div className="mt-1 text-xs text-gray-500">{selectedWallet.walletClientType}</div>
            ) : null}
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">/ax/user/infos.mfaBound</div>
            <div className="mt-2 text-sm font-medium text-gray-900">
              {formatBooleanFlag(userInfo?.mfaBound)}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-500">/mfa/status.bound</div>
            <div className="mt-2 text-sm font-medium text-gray-900">
              {formatBooleanFlag(mfaStatus?.bound)}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-900">2FA Status</h3>
              <div className="text-xs text-gray-500">TOTP / token header / fresh timestamp</div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Signer Wallet</label>
                <select
                  value={selectedAddress}
                  onChange={(event) => {
                    setSelectedAddress(event.target.value);
                  }}
                  className="w-full rounded-md border border-[#E2E3F0] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
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
                <label className="mb-1 block text-sm font-medium">Pending Bind</label>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  {formatBooleanFlag(mfaStatus?.pendingBind)}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Type</label>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  {mfaStatus?.type ?? "-"}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Issuer</label>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  {mfaStatus?.issuer ?? "-"}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Account</label>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  {mfaStatus?.account ?? "-"}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Digits / Period</label>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  {mfaStatus ? `${mfaStatus.digits} / ${mfaStatus.periodSeconds}s` : "-"}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium">Bind Time</label>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  {mfaStatus?.bindTime ?? "-"}
                </div>
              </div>
            </div>

            {(pendingBindSecret || pendingBindOtpAuthUrl) && (
              <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <div className="text-sm font-medium text-indigo-900">Pending authenticator import</div>
                <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                  <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-indigo-200 bg-white p-4">
                    {pendingBindQrCodeUrl ? (
                      <Image
                        src={pendingBindQrCodeUrl}
                        alt="Pumpkin TOTP QR Code"
                        width={240}
                        height={240}
                        unoptimized
                        className="h-60 w-60 rounded-lg"
                      />
                    ) : pendingBindQrLoading ? (
                      <div className="text-sm text-gray-500">Generating QR code...</div>
                    ) : (
                      <div className="text-center text-sm text-gray-500">
                        QR code is unavailable. You can still copy the secret or otpauthUrl below.
                      </div>
                    )}
                  </div>
                  <div>
                    {pendingBindSecret ? (
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-indigo-700">
                          Secret
                        </label>
                        <textarea
                          readOnly
                          value={pendingBindSecret}
                          className="min-h-20 w-full rounded-md border border-indigo-200 bg-white px-3 py-2 font-mono text-xs text-gray-900 focus:outline-none"
                        />
                      </div>
                    ) : null}
                    {pendingBindOtpAuthUrl ? (
                      <div className={pendingBindSecret ? "mt-3" : ""}>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-indigo-700">
                          otpauthUrl
                        </label>
                        <textarea
                          readOnly
                          value={pendingBindOtpAuthUrl}
                          className="min-h-24 w-full rounded-md border border-indigo-200 bg-white px-3 py-2 font-mono text-xs text-gray-900 focus:outline-none"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-gray-200 p-5">
              <h3 className="text-lg font-semibold text-gray-900">Bind 2FA</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                初始化和确认绑定都会重新生成毫秒级 timestamp，并让当前所选钱包重新签名，避免重复使用同一组 timestamp + sign。
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="button-secondary"
                  disabled={sectionBusy || !selectedAddress}
                  onClick={() => {
                    void handleInitBind();
                  }}
                >
                  {initializingBind ? "Initializing..." : "Init Bind"}
                </button>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium">Authenticator Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="493350"
                  value={bindCode}
                  onChange={(event) => {
                    setBindCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  }}
                  className="w-full rounded-md border border-[#E2E3F0] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="button-primary"
                  disabled={sectionBusy || !selectedAddress}
                  onClick={() => {
                    void handleConfirmBind();
                  }}
                >
                  {confirmingBind ? "Confirming..." : "Confirm Bind"}
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 p-5">
              <h3 className="text-lg font-semibold text-gray-900">Unbind 2FA</h3>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                解绑也会重新生成 timestamp 并重新签名，同时必须提交当前认证器里最新的 6 位验证码。
              </p>
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium">Current TOTP Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="171169"
                  value={unbindCode}
                  onChange={(event) => {
                    setUnbindCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  }}
                  className="w-full rounded-md border border-[#E2E3F0] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  className="button-secondary"
                  disabled={sectionBusy || !selectedAddress}
                  onClick={() => {
                    void handleUnbind();
                  }}
                >
                  {unbinding ? "Unbinding..." : "Unbind"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-900">Withdraw</h3>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            val 会按原接口逻辑原样透传给 POST /ax/user/withdraw。这个 demo 不猜测业务字段结构，只要求你填入合法 JSON；如果当前用户已开启 2FA，则会强制补 mfaCode。
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <div>
              <label className="mb-1 block text-sm font-medium">Withdraw val JSON</label>
              <textarea
                value={withdrawVal}
                onChange={(event) => {
                  setWithdrawVal(event.target.value);
                }}
                className="min-h-48 w-full rounded-md border border-[#E2E3F0] bg-white px-3 py-2 font-mono text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">MFA Required</label>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
                  {formatBooleanFlag(effectiveMfaBound)}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Withdraw mfaCode</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={effectiveMfaBound ? "Required when MFA is on" : "Optional"}
                  value={withdrawMfaCode}
                  onChange={(event) => {
                    setWithdrawMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                  }}
                  className="w-full rounded-md border border-[#E2E3F0] bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-1 focus:ring-black"
                />
              </div>
              <button
                className="button-primary"
                disabled={sectionBusy}
                onClick={() => {
                  void handleSubmitWithdraw();
                }}
              >
                {submittingWithdraw ? "Submitting..." : "Submit Withdraw"}
              </button>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                同一个时间步里的 TOTP 验证码不能重复提交；如果上一次已经用过，请等待认证器刷新下一组 6 位验证码。
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Last Response</h3>
            <div className="text-xs text-gray-500">Debug preview</div>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-6 text-green-200">
            {lastResponse || "No Pumpkin response yet."}
          </pre>
        </div>
      </div>
    </Section>
  );
}
