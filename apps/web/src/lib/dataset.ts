import {
  ipfsSourceFor, resolveDataset, type DataSource, type LatestManifest, type ResolvedDataset,
} from '@roofing-crm/consumer';
import { DATA_SOURCES } from '../config.js';

export type DatasetState =
  | { status: 'loading' }
  | { status: 'ready'; source: DataSource; manifest: LatestManifest; ipfsAlternate: DataSource | null; attempts: ResolvedDataset['attempts'] }
  | { status: 'unavailable'; error: string };

export async function loadDataset(): Promise<DatasetState> {
  try {
    const resolved = await resolveDataset({
      pipelinePagesUrl: DATA_SOURCES.pipelinePagesUrl,
      localMirrorUrl: DATA_SOURCES.localMirrorUrl,
    });
    return {
      status: 'ready',
      source: resolved.source,
      manifest: resolved.manifest,
      ipfsAlternate: ipfsSourceFor(resolved.manifest, DATA_SOURCES.ipfsGateway),
      attempts: resolved.attempts,
    };
  } catch (err) {
    return { status: 'unavailable', error: err instanceof Error ? err.message : String(err) };
  }
}
