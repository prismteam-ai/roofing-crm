# Deployment and rollback boundaries

The implementation has an API Gateway/Lambda read-and-lead plane, private static
assets served through CloudFront, versioned DynamoDB lead state, and shared
session/quota/campaign state and secret bindings owned by the paired Oracle
review environment. Optional map/model providers remain gated. Synthesis is local;
actual account state and final promoted identities come from the operator report.

The existing review stack may retain the historical `p3-review` environment name.
That is a resource identity, not a claim to use old parser, contract or budget
semantics. P3/P4 campaign counters remain immutable historical namespaces; the
current phase has its own approved durable request/call/spend envelope. No
redeployment, fallback or failed attempt refunds allowance. Check exact deployed
limits, Lambda reservation and API rate/burst against actual stack/function reads.

Before effects, the operator must pin clean source HEAD/tree, contract/predicate
and place digests, Oracle origin/build/snapshot, frontend asset hashes and Lambda
ZIP digest. Public/private input bytes must be pre-staged and checksum-verified
under immutable prefixes before runtime activation, with manifests last. Private
paths, account IDs, ARNs, keys and access codes stay outside Git and the return.
The operational entry points default to plans; an execution flag and the exact
existing authorization/guards are required for live deployment. Documentation is
not permission to perform account, credential, quota, Support or billing actions.

Health/evidence and loaded frontend assets must agree with the same pinned build.
Use the returned hosted report for actual URLs and operator receipts, not a
historical screenshot. A successful local package or synthesis is insufficient.
After deployment, validate first-use access, both applications, original typed/NL
examples, real source semantics, five simultaneous actors, failure/stale clearing,
leads/session isolation and real model cost accounting.

Rollback activates the previously pinned package/assets/data bindings; it does
not overwrite immutable source history or reset campaign counters. Review
resources use retention controls. Stack deletion alone does not prove buckets,
object versions, lead state, logs, secrets, map keys or recurring charges were
removed. Teardown needs the existing explicit authorization, evidence preservation,
session revocation and an actual retained-resource/billing review. No unapproved
quota increase, new IAM scope, paid service or publication is a recovery method.
