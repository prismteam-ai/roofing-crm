import { DomainError } from "../../contracts/src/index";

/** One monotonic wall-clock budget shared across setup, reads, inference and audit. */
export class TurnDeadline {
  readonly controller = new AbortController();
  readonly signal = this.controller.signal;
  private readonly end: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  constructor(milliseconds: number) {
    if (
      !Number.isFinite(milliseconds) ||
      milliseconds <= 0 ||
      milliseconds > 27000
    )
      throw new DomainError("INVALID_INPUT", "Invalid bounded turn deadline");
    this.end = performance.now() + milliseconds;
    this.timer = setTimeout(() => this.controller.abort(), milliseconds);
  }
  remaining() {
    return Math.max(0, this.end - performance.now());
  }
  assertActive() {
    if (this.signal.aborted || this.remaining() <= 0)
      throw new DomainError(
        "QUERY_TIMEOUT",
        "Assessment turn deadline exceeded",
      );
  }
  async run<T>(work: () => Promise<T>): Promise<T> {
    this.assertActive();
    let rejectAbort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = () =>
        reject(
          new DomainError("QUERY_TIMEOUT", "Assessment turn deadline exceeded"),
        );
      this.signal.addEventListener("abort", rejectAbort, { once: true });
    });
    try {
      const result = await Promise.race([
        Promise.resolve().then(() => {
          this.assertActive();
          return work();
        }),
        cancelled,
      ]);
      this.assertActive();
      return result;
    } finally {
      this.signal.removeEventListener("abort", rejectAbort);
    }
  }
  dispose() {
    clearTimeout(this.timer);
    this.controller.abort();
  }
}
