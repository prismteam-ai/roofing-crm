import { COUNTY_LABEL } from "@crm/shared";

export function App() {
  return (
    <main>
      <h1>Roofing Leads</h1>
      <p data-testid="county">{COUNTY_LABEL}</p>
    </main>
  );
}
