import type { DatasetState } from '../lib/dataset.js';

interface Props {
  state: DatasetState;
  /** County-wide, not radius-scoped. Null while still loading. */
  unlocatableOpenPermits: number | null;
}

/**
 * Coverage and provenance, read from the pipeline's run manifest rather than
 * recomputed in the browser. Shows which published copy is being read and how
 * much of the data actually supports the roof-age criterion.
 */
export function DataStatus({ state, unlocatableOpenPermits }: Props) {
  if (state.status === 'loading') {
    return <section className="panel"><h2 className="panel__title">Dataset</h2><p className="muted">Resolving…</p></section>;
  }

  if (state.status === 'unavailable') {
    return (
      <section className="panel">
        <h2 className="panel__title">Dataset</h2>
        <p className="alert">
          No published dataset reachable yet. The pipeline has not published its first
          snapshot, so the map is running without records.
        </p>
        <p className="muted mono">{state.error}</p>
      </section>
    );
  }

  const { manifest, source, ipfsAlternate } = state;
  const coverage = manifest.coverage;
  const basis = coverage?.roof_age_basis ?? {};
  const knownRoofAge = (basis['PERMIT'] ?? 0) + (basis['ACT_YR_BLT'] ?? 0) + (basis['EFF_YR_BLT'] ?? 0);

  return (
    <section className="panel">
      <h2 className="panel__title">Dataset</h2>
      <dl className="kv">
        <dt>Source</dt><dd>{source.label}</dd>
        <dt>Version</dt><dd className="mono">{manifest.dataset_version}</dd>
        <dt>County</dt><dd>{manifest.county} ({manifest.county_fips})</dd>
        {ipfsAlternate ? <><dt>IPFS</dt><dd className="mono trunc">{manifest.ipfs?.root_cid}</dd></> : null}
      </dl>

      <h3 className="panel__sub">Records</h3>
      <dl className="kv">
        {Object.entries(manifest.tables).map(([name, ref]) => (
          <div key={name} className="kv__row">
            <dt>{name}</dt><dd>{ref.row_count.toLocaleString()}</dd>
          </div>
        ))}
      </dl>

      {coverage ? (
        <>
          <h3 className="panel__sub">Roof-age evidence</h3>
          <dl className="kv">
            <dt>From a roofing permit</dt><dd>{(basis['PERMIT'] ?? 0).toLocaleString()}</dd>
            <dt>Building-age proxy</dt><dd>{((basis['ACT_YR_BLT'] ?? 0) + (basis['EFF_YR_BLT'] ?? 0)).toLocaleString()}</dd>
            <dt>Unknown</dt><dd>{(basis['UNKNOWN'] ?? 0).toLocaleString()}</dd>
          </dl>
          <p className="note">
            Only permit-derived ages are a true roof age. Building age is a proxy —
            at Brevard&rsquo;s housing distribution it matches about 96% of parcels at a
            15-year threshold, so it is shown as a prospecting layer, never as a filter
            on its own. {knownRoofAge > 0 ? null : 'No roof-age evidence loaded yet.'}
          </p>
        </>
      ) : null}

      <h3 className="panel__sub">Open roofing permits</h3>
      <p className="note">
        {unlocatableOpenPermits === null
          ? 'Checking how many can be located on the map…'
          : unlocatableOpenPermits > 0
            ? `${unlocatableOpenPermits.toLocaleString()} open roofing permit${unlocatableOpenPermits === 1 ? '' : 's'} county-wide could not be matched to a parcel confidently enough to place on the map, so they cannot appear as a lead here.`
            : 'Every open roofing permit county-wide is matched to a parcel and locatable on the map.'}
      </p>
    </section>
  );
}
