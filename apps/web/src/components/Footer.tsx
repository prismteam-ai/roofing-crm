import type { DatasetInfo, DatasetSource } from '@roofing/shared';
import { publishedSuffix, shortCid } from '../lib/ui.js';

export type DatasetMeta = DatasetInfo & {
  agentMode: 'llm' | 'offline';
  build: { commit: string; builtAt: string };
};

interface Props {
  meta: DatasetMeta | null;
  resultCount: number | null;
  totalInRadius: number | null;
  source: DatasetSource | null;
  leadCount: number | null;
}

/** Full CID on wide screens, `bafy…isce` on narrow ones (CSS), full value always in `title`. */
export function Cid({ cid, testId }: { cid: string; testId?: string }) {
  const short = shortCid(cid);
  return (
    <code title={cid} data-testid={testId}>
      {short === cid ? (
        cid
      ) : (
        <>
          <span className="cid-full">{cid}</span>
          <span className="cid-short" aria-hidden="true">
            {short}
          </span>
        </>
      )}
    </code>
  );
}

export function Footer({ meta, resultCount, totalInRadius, source, leadCount }: Props) {
  const runId = source?.runId ?? meta?.runId ?? 'loading…';
  const rootCid = source?.rootCid ?? meta?.rootCid ?? null;
  return (
    <footer className="footer" data-testid="footer">
      <span data-testid="footer-provenance">
        Data: {meta ? (meta.client === 'mcp' ? 'pipeline MCP' : 'fixture dataset') : '…'} · run{' '}
        <code>{runId}</code> · root CID <Cid cid={rootCid ?? 'pending (placeholder)'} />
        {publishedSuffix(source ?? meta)}
        {source?.syncedAt && <> · synced {source.syncedAt.slice(0, 10)}</>}
      </span>
      <span data-testid="footer-counts">
        {meta
          ? Object.entries(meta.counts)
              .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.toLocaleString('en-US')}`)
              .join(' · ')
          : 'counts: …'}
        {resultCount !== null && (
          <>
            {' '}
            · showing {resultCount.toLocaleString('en-US')}
            {totalInRadius !== null && <> of {totalInRadius.toLocaleString('en-US')} in radius</>}
          </>
        )}
        {leadCount !== null && <> · leads: {leadCount}</>}
      </span>
      <span data-testid="footer-build">
        agent: {meta?.agentMode ?? '…'} · build <code>{meta?.build.commit.slice(0, 7) ?? '…'}</code>
      </span>
      {meta && meta.limitations.length > 0 && (
        <details className="limitations" data-testid="footer-limitations">
          <summary>Data limitations ({meta.limitations.length})</summary>
          <ul>
            {meta.limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </details>
      )}
    </footer>
  );
}
