"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { createConfig, WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, type Chain } from "viem";

import { requireSupportedChains } from "@/lib/gas-sponsor-chains";

const queryClient = new QueryClient();
const configuredChains = requireSupportedChains();
const supportedChains = configuredChains.map((config) => config.chain) as [Chain, ...Chain[]];
const defaultChain = supportedChains[0];

const wagmiConfig = createConfig({
  chains: supportedChains,
  transports: Object.fromEntries(
    configuredChains.map((config) => [config.id, http(config.rpcUrl)]),
  ),
});

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        supportedChains,
        defaultChain,
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
