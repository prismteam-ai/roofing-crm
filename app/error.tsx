"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="mt-2 break-words text-sm text-red-700">{error.message}</p>
      <p className="mt-2 text-xs text-[var(--muted)]">
        Check that the Elephant MCP server (ORACLE_MCP_URL) and the CRM database (DATABASE_URL) are
        reachable.
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-md bg-[var(--brand)] px-3 py-1.5 text-sm text-white"
      >
        Try again
      </button>
    </div>
  );
}
