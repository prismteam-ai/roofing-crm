import type { Query, PlaceReference } from "../../../contracts/src/index";
import type { ConstraintLedgerEntry, IntentOptions } from "./types";
export type Span = { start: number; end: number; text: string };
export type Field = ConstraintLedgerEntry["typedField"];
export type Primitive = string | number | boolean;
export type AppliedField = Exclude<
  Field,
  "center" | "countyScope" | "display" | "safety" | "expression"
>;
/** Grammar stages can only add typed bounded constraints through these methods. */
export interface RuleContext {
  prompt: string;
  text: string;
  base: Query;
  draft: Record<string, string | number | boolean | undefined>;
  ledger: ConstraintLedgerEntry[];
  maxRows: number;
  options: IntentOptions;
  take(
    pattern: RegExp,
    callback: (span: Span, match: RegExpMatchArray) => void,
  ): void;
  note(
    span: Span,
    field: Field,
    classification: ConstraintLedgerEntry["classification"],
    meaning: string,
    reason: string,
    value?: ConstraintLedgerEntry["typedValue"],
    evidence?: string[],
    material?: boolean,
  ): void;
  apply(
    span: Span,
    field: AppliedField,
    value: Primitive,
    reason: string,
    evidence?: string[],
  ): boolean;
  amount(
    span: Span,
    field: AppliedField,
    raw: string,
    min: number,
    max: number,
    scale?: number,
    integer?: boolean,
    reason?: string,
  ): void;
  setPlaceResolution(place: PlaceReference): void;
}
