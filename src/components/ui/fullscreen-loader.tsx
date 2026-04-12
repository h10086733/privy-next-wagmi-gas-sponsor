export function FullScreenLoader() {
  return (
    <div className="loader-overlay">
      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-black" />
        <span className="text-sm text-gray-700">Loading Privy…</span>
      </div>
    </div>
  );
}
