/** Builds the committed RAG replay corpus from the dataset fixture. Run: pnpm tsx fixtures/rag/build-corpus.ts */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { propertySchema } from '@roofing/shared';
import { propertyToDocs } from '@roofing/rag';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
const properties = z
  .array(propertySchema)
  .parse(JSON.parse(readFileSync(join(here, '../dataset/properties.json'), 'utf8')));
// Evanston slice keeps the corpus small and the replay queries stable.
const evanston = properties.filter((p) => p.city === 'EVANSTON');
const docs = evanston.flatMap(propertyToDocs);
writeFileSync(
  join(here, 'corpus/evanston.jsonl'),
  docs.map((d) => JSON.stringify(d)).join('\n') + '\n',
);
console.log(`wrote ${docs.length} docs from ${evanston.length} properties`);
