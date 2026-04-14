interface HeaderProps {
  authenticated: boolean;
}

export function Header({ authenticated }: HeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 md:px-6">
        <div>
          <div className="text-sm font-semibold text-gray-900">privy-next-wagmi-gas-sponsor</div>
          <div className="text-xs text-gray-500">
            {authenticated ? "Multi-chain / Privy 7702 / Sponsor" : "Minimal demo"}
          </div>
        </div>
        <a
          className="text-sm text-indigo-600 hover:text-indigo-500"
          href="https://docs.privy.io/"
          rel="noreferrer"
          target="_blank"
        >
          Privy Docs
        </a>
      </div>
    </header>
  );
}
