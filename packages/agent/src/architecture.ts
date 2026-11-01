/** Active one-call typed retrieval protocol. Historical selection receipts cannot authorize it. */
export const ROUTING_ARCHITECTURE =
  "one-call-constrained-retrieval-v3" as const;
export type RoutingArchitecture = typeof ROUTING_ARCHITECTURE;
