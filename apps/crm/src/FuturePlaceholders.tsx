/**
 * Sections the CRM story lists beyond this increment, shown disabled with the reason. "Ask the agent" is a
 * section of the aside now (AskAgent.tsx), shown when config.json names the agent API.
 */
const FUTURE: Array<[string, string]> = [
  [
    "Out-of-area owner: not available",
    "Out-of-area owner data is not available in the open roll.",
  ],
  ["Outreach", "Out of scope (no messaging to owners)."],
];
export function FuturePlaceholders() {
  return (
    <section className="future">
      <h3>Coming next</h3>
      {FUTURE.map(([t, why]) => (
        <div key={t} className="card" aria-disabled="true" data-testid="future">
          <b>{t}</b>
          <div>{why}</div>
          <button disabled>Not available yet</button>
        </div>
      ))}
    </section>
  );
}
