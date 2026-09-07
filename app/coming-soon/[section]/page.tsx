import Link from "next/link";
import { notFound } from "next/navigation";
import { FUTURE_SECTIONS, findFutureSection } from "@/lib/config/sections";

export function generateStaticParams() {
  return FUTURE_SECTIONS.map((s) => ({ section: s.slug }));
}

/** Placeholder page for a disabled future section. */
export default async function ComingSoonPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const s = findFutureSection(section);
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-2xl p-6 md:p-10">
      <span className="inline-block rounded border border-gray-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        Disabled - coming soon
      </span>
      <h1 className="mt-3 text-2xl font-semibold">{s.label}</h1>
      <p className="mt-1 text-[var(--muted)]">{s.description}</p>
      <section className="mt-6 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
        <h2 className="text-sm font-semibold">What this section would do</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {s.wouldDo.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <h2 className="mt-5 text-sm font-semibold">Depends on</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
          {s.dependsOn.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <p className="mt-6 text-sm text-[var(--muted)]">
        The initial release is scoped to lead identification. Continue in the{" "}
        <Link href="/" className="text-[var(--brand)] underline">
          Map CRM
        </Link>{" "}
        or the{" "}
        <Link href="/leads" className="text-[var(--brand)] underline">
          Leads
        </Link>{" "}
        pipeline.
      </p>
    </div>
  );
}
