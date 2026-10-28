# Review deployment and rollback

The current target is region `us-east-2`, stage `review`, stack `PrismCrmAssessmentReview`, project tag `project_name=prism-assessment`. Standard CDK bootstrap uses qualifier `prismrvw`; no manual CloudFormation deployment wrapper is the normal path.

Start with `pnpm run bootstrap --dry-run` and `pnpm run deploy --dry-run`. For authorized operations, use a private owner-only operations directory outside source/returned evidence. Pin the expected candidate account, clean source head/tree, measured Lambda ZIP, manifest digests, snapshot/build identity, Oracle origin and measured cost envelope. Approved AWS/project ceilings remain USD35/USD75; retained allowance and billing uncertainty are included conservatively.

`pnpm run bootstrap --execute` requires the exact task-scoped CloudFormation execution policy ARN, never an implicit AdministratorAccess policy. `pnpm run deploy --execute` validates the bootstrap bucket/role and upstream Oracle release, synthesizes and checks CDK assets, then invokes the actual CDK CLI against the assembly. CDK publishes the exact measured Lambda asset. The operator uploads the exact frontend asset manifest and verifies outputs, runtime configuration and authenticated behavior.

The Oracle stack is deployed and accepted first. Its new-region session/secret/table bindings are passed to the CRM. The source gates reject mixed regions, old stack identities, placeholder account IDs and source/archive drift. Default synthesis is local and makes no service call.

The actual account has a small concurrency ceiling. Shared-unreserved mode requires a fresh owner-only quota proof, a separate explicit operator mode and bounded API throttle; it is not claimed equivalent to reserved isolation. Neither service requests a quota increase.

The prior runtime is retained unchanged. Rollback means returning evaluator access to that previously accepted runtime; do not destroy either stack or rotate its secret without the required direct authorization. Teardown/rotation are guarded separate operations, never CI side effects.
