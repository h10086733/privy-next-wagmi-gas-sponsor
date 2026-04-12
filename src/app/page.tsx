"use client";

import { ToastContainer } from "react-toastify";
import { usePrivy } from "@privy-io/react-auth";

import PrivyErc20Transfer7702 from "@/components/sections/privy-erc20-transfer-7702";
import { FullScreenLoader } from "@/components/ui/fullscreen-loader";
import { Header } from "@/components/ui/header";

export default function HomePage() {
  const { ready, authenticated, login, logout } = usePrivy();

  if (!ready) {
    return <FullScreenLoader />;
  }

  return (
    <div className="min-h-screen">
      <Header authenticated={authenticated} />
      {authenticated ? (
        <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-12 pt-24 md:px-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Privy 7702 + Backend Sponsor</h1>
              <p className="mt-2 text-sm text-gray-600">
                当前新项目只保留已验证可用的 ERC-20 transfer sponsor 流程。
              </p>
            </div>
            <div className="flex gap-3">
              <button className="button-secondary" onClick={logout}>
                Logout
              </button>
            </div>
          </div>

          <PrivyErc20Transfer7702 />
        </main>
      ) : (
        <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center">
          <div className="card w-full p-8">
            <div className="mx-auto mb-3 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
              Minimal Demo
            </div>
            <h1 className="text-3xl font-semibold text-gray-900">
              Privy 7702 Gas Sponsor
            </h1>
            <p className="mt-3 text-sm leading-6 text-gray-600">
              前端用 Privy 完成 7702 授权和用户签名，后端 sponsor/operator 负责签名并代付 gas。
            </p>
            <button className="button-primary mt-6 w-full" onClick={login}>
              Login with Privy
            </button>
          </div>
        </main>
      )}

      <ToastContainer
        position="top-center"
        autoClose={5000}
        hideProgressBar
        newestOnTop={false}
        closeOnClick={false}
        rtl={false}
        pauseOnFocusLoss
        draggable={false}
        pauseOnHover
        limit={1}
      />
    </div>
  );
}
