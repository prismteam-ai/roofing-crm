// Typed lead errors shared by the Data layer (adapters/leadRepo.ts), the Application layer
// (services/leads.ts) and the Entry layer (routers/leads.ts), which maps them to tRPC codes.
// Messages carry the dedupe key only: never an address, note text or owner name (ADR-03).

/** A second create for an existing `{fips}:tcad:{request_identifier}` key (ADR-04). `code` is the
 *  DynamoDB cancellation reason the transaction produced. */
export class LeadAlreadyExistsError extends Error {
  readonly code = "ConditionalCheckFailed";
  constructor(readonly leadKey: string) {
    super(`A lead already exists for ${leadKey}`);
    this.name = "LeadAlreadyExistsError";
  }
}

/** The event append lost the race: another write already took `EVT#{eventSequence + 1}`. */
export class LeadSequenceConflictError extends Error {
  readonly code = "ConditionalCheckFailed";
  constructor(readonly leadKey: string) {
    super(`Lead ${leadKey} changed since it was read; retry with its current eventSequence`);
    this.name = "LeadSequenceConflictError";
  }
}

export class LeadNotFoundError extends Error {
  constructor(readonly leadKey: string) {
    super(`No lead exists for ${leadKey}`);
    this.name = "LeadNotFoundError";
  }
}

/** A geo/roof-age/permit filter was requested but no LeadIndex is wired into this Lambda. */
export class LeadIndexUnavailableError extends Error {
  constructor() {
    super("LeadIndex is not available; geo, roof-age and permit filters cannot be applied");
    this.name = "LeadIndexUnavailableError";
  }
}
