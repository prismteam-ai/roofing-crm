import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  reviewSchema,
  type Review,
  type ReviewStore,
  type TraceEvent,
  type TraceSink,
} from './types.js';

async function appendJsonl(file: string, row: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await appendFile(file, JSON.stringify(row) + '\n', 'utf8');
}

/** JSONL trace sink, one file per UTC day under dir. */
export class JsonlTraceSink implements TraceSink {
  constructor(private readonly dir: string) {}
  async write(event: TraceEvent): Promise<void> {
    await appendJsonl(join(this.dir, `${event.at.slice(0, 10)}.jsonl`), event);
  }
}

export class InMemoryTraceSink implements TraceSink {
  readonly events: TraceEvent[] = [];
  async write(event: TraceEvent): Promise<void> {
    this.events.push(event);
  }
}

export class JsonlReviewStore implements ReviewStore {
  constructor(private readonly file: string) {}
  async add(review: Review): Promise<void> {
    await appendJsonl(this.file, reviewSchema.parse(review));
  }
  async list(): Promise<Review[]> {
    const text = await readFile(this.file, 'utf8').catch(() => '');
    return text
      .split('\n')
      .filter(Boolean)
      .map((l) => reviewSchema.parse(JSON.parse(l)));
  }
}
