import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '../lib/api.js';
import { describeError, formatCount, formatDateTime } from '../lib/format.js';
import { Notice, Spinner } from './fields.js';

const isHttpUrl = (url: string | null): url is string => url !== null && /^https?:\/\//i.test(url);
const isCid = (cid: string): boolean => /^[A-Za-z0-9]{32,120}$/.test(cid);

/** Public gateways for the manifest. Plain-HTTP ones first: they also work from scripts. */
const GATEWAYS: readonly { host: string; kind: string }[] = [
  { host: 'latam.orbitor.dev', kind: 'independent gateway, plain HTTP' },
  { host: 'gateway.pinata.cloud', kind: 'pinning vendor, plain HTTP' },
  { host: 'ipfs.filebase.io', kind: 'pinning vendor, plain HTTP' },
  { host: 'ipfs.io', kind: 'interactive browsers only' },
  { host: 'dweb.link', kind: 'interactive browsers only' },
];

/** What the CRM is standing on: record counts, sources and their limits, published manifest. */
export function DataView() {
  const trpc = useTRPC();
  const query = useQuery(trpc.meta.dataset.queryOptions());
  const health = useQuery(trpc.meta.health.queryOptions());
  const data = query.data;

  return (
    <div className="page data" data-testid="data-view">
      <div className="page-head">
        <div>
          <h2>Data</h2>
          <p className="muted">
            This CRM reads property and permit data from a separate pipeline. It does not collect or
            edit that data; it only adds your leads.
          </p>
        </div>
      </div>

      {query.isLoading && (
        <div className="empty">
          <Spinner label="Loading dataset summary…" />
        </div>
      )}
      {query.error && (
        <Notice
          kind="error"
          testId="data-error"
          action={
            <button
              type="button"
              className="btn btn-small"
              data-testid="data-retry"
              onClick={() => {
                void query.refetch();
              }}
            >
              Retry
            </button>
          }
        >
          <strong>Could not load the dataset summary.</strong> {describeError(query.error)}
        </Notice>
      )}

      {data && (
        <>
          <dl className="stat-grid">
            <div className="stat">
              <dt>County</dt>
              <dd data-testid="data-county">{data.county}</dd>
            </div>
            <div className="stat">
              <dt>Data as of</dt>
              <dd data-testid="data-asof">{formatDateTime(data.asOf)}</dd>
            </div>
            <div className="stat">
              <dt>Last pipeline run</dt>
              <dd>{data.lastRunId ?? 'Not reported'}</dd>
            </div>
            <div className="stat">
              <dt>Agent model</dt>
              <dd data-testid="data-agent-model">
                {health.data ? (health.data.agentModel ?? 'Not configured') : '…'}
              </dd>
            </div>
          </dl>

          <section aria-labelledby="data-counts">
            <h3 id="data-counts">Records per table</h3>
            <div className="table-scroll table-narrow">
              <table className="mini-table" data-testid="data-counts">
                <thead>
                  <tr>
                    <th scope="col">Table</th>
                    <th scope="col" className="num">
                      Rows
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.counts.map((count) => (
                    <tr key={count.table}>
                      <td>{count.table}</td>
                      <td className="num">{formatCount(count.rows)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="data-sources">
            <h3 id="data-sources">Sources</h3>
            {data.sources.length === 0 ? (
              <p className="muted">The pipeline did not report its sources.</p>
            ) : (
              <div className="table-scroll">
                <table className="mini-table" data-testid="data-sources">
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col" className="num">
                        Rows
                      </th>
                      <th scope="col">Fetched</th>
                      <th scope="col">Known limits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sources.map((source) => (
                      <tr key={source.name}>
                        <td>
                          {isHttpUrl(source.url) ? (
                            <a href={source.url} target="_blank" rel="noopener noreferrer">
                              {source.name}
                            </a>
                          ) : (
                            source.name
                          )}
                        </td>
                        <td className="num">
                          {source.rows === null ? '-' : formatCount(source.rows)}
                        </td>
                        <td>{formatDateTime(source.fetchedAt)}</td>
                        <td>{source.limits ?? 'None reported'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="data-manifest">
            <h3 id="data-manifest">Published manifest</h3>
            {data.manifestCid && isCid(data.manifestCid) ? (
              <div data-testid="data-manifest">
                <p>
                  Content ID <code>{data.manifestCid}</code>
                </p>
                <ul className="gateways">
                  {GATEWAYS.map((gateway) => (
                    <li key={gateway.host}>
                      <a
                        href={`https://${gateway.host}/ipfs/${data.manifestCid ?? ''}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open on {gateway.host}
                      </a>{' '}
                      <span className="muted">({gateway.kind})</span>
                    </li>
                  ))}
                </ul>
                <p className="muted" data-testid="data-manifest-note">
                  ipfs.io and dweb.link serve only interactive browsers (they show a bot check to
                  scripts); the first three gateways return the file over plain HTTP.
                </p>
              </div>
            ) : (
              <p className="muted" data-testid="data-manifest-none">
                No manifest has been published for this dataset.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
