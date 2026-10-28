/** Active model protocol. Historical v1 receipts cannot authorize this version. */
export const ROUTING_ARCHITECTURE = "one-call-grounded-selection-v2" as const;
export type RoutingArchitecture = typeof ROUTING_ARCHITECTURE;
