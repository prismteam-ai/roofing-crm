# Kit usage and deviations

The [Soofi XYZ Team Kit](https://github.com/soofi-xyz/soofi-xyz-team-kit) was used as
reference documentation: its agent and skill files were read and their rules applied by
hand. The plugin itself was not installed. For a web application with an agent the kit
routes to `metagross` (`build-frontend-backends`) and `alakazam` (`build-rag-systems`,
`build-ai-agents`), with `donphan` / `use-elephant-mcp` defining how data is consumed and
`apply-engineering-guidelines` as the baseline.

## Followed

| Kit rule | Where |
|---|---|
| TypeScript for every workload | Whole repository |
| Vercel AI SDK for all model calls, Zod tool schemas, no provider SDK | `lib/assistant.ts` |
| Tools registered explicitly; the model cannot discover others (`build-ai-agents`) | `lib/assistant.ts`: four pipeline tools and two lead tools, named in code |
| Data only through the MCP endpoint: no direct database, file or IPFS access (`use-elephant-mcp`, `donphan`) | `lib/oracle.ts` is the only place property or permit data enters |
| Every answer shows where its records came from | Assistant answers list each record retrieved, with the snapshot and county record |
| Zod at every boundary (`build-frontend-backends`) | Every API route and tool input |
| AWS in `us-east-2`, CDK as the only infrastructure tool, cost tags | `infra/` |
| DynamoDB for application state | Leads table, partitioned by workspace |
| Vitest, type check and lint in GitHub Actions | `.github/workflows/check.yml` |
| No secrets in logs or the repository | Model key in an encrypted SSM parameter |

## Deviations, and why

| Kit rule | What this repository does | Reason |
|---|---|---|
| Turborepo with `apps/web`, `apps/api` (tRPC) and a shared client package | One Next.js application with route handlers | One small product with one client. The split adds structure with nothing yet to share |
| API on API Gateway, frontend on Amplify | One Lambda function with a function URL | The smallest runtime with no idle cost |
| Retrieval through OpenSearch with embeddings and hybrid search | Retrieval by calling the pipeline's search tools (radius, roof age, permit age, licence standing) | The questions are about structured records. "Within five miles and open more than five years" is a filter, not a similarity search. A vector index would add cost and a second copy of the data |
| `CorpusStore`, `EmbeddingService`, `RetrievalIndex`, `ReviewStore`, `TraceSink` interfaces | Not implemented | Follows from the row above |
| Bedrock models with prompt caching | Gemini through the Vercel AI SDK | Free tier. The provider is one line in `lib/assistant.ts` |
| LangSmith tracing; conversation memory in AgentCore | Neither. Each question stands alone; the tool calls behind an answer are returned to the page | Not built in the time available |
| Powertools, PagerDuty, dead-letter queue alarms | Plain logs to CloudWatch with one-week retention | One function and no queue; a real gap for production use |
