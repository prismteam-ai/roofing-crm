import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">That page or record does not exist.</p>
      <Link href="/" className="mt-4 inline-block text-sm text-[var(--brand)] underline">
        Back to the map
      </Link>
    </div>
  );
}
