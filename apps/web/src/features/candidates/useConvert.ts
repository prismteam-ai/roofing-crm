import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC, useTRPCClient } from "../../lib/trpc.ts";

export interface ConvertTarget {
  propertyId: string;
  permitId?: string;
}
export interface ConvertReport {
  created: number;
  existing: number;
  failed: string[];
}

const CHUNK = 50;

/** Converts candidates to leads in chunks of 50 (the API limit); duplicates come back as existing. */
export function useConvert() {
  const client = useTRPCClient();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [report, setReport] = useState<ConvertReport | null>(null);
  const m = useMutation({
    mutationFn: async (targets: ConvertTarget[]) => {
      const r: ConvertReport = { created: 0, existing: 0, failed: [] };
      for (let i = 0; i < targets.length; i += CHUNK) {
        const items = targets.slice(i, i + CHUNK);
        try {
          const out = await client.leads.createMany.mutate({ items });
          r.created += out.created;
          r.existing += out.existing;
        } catch (e) {
          r.failed.push(`${items.length} lead(s): ${(e as Error).message}`);
        }
      }
      return r;
    },
    onSuccess: (r) => {
      setReport(r);
      void qc.invalidateQueries({ queryKey: trpc.leads.list.pathKey() });
    },
  });
  return { convert: m.mutate, pending: m.isPending, report, clear: () => setReport(null) };
}

export function reportText(r: ConvertReport): string {
  const parts = [`Created ${r.created} lead${r.created === 1 ? "" : "s"}`];
  if (r.existing) parts.push(`${r.existing} already existed`);
  if (r.failed.length) parts.push(`failed: ${r.failed.join("; ")}`);
  return parts.join(", ") + ".";
}
