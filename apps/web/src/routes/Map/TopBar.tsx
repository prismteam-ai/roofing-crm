// B-03 map search/context bar (CRM-HANDOFF §4.2, boards CrmMap390/1440, CrmMapPin390): the search
// combobox (SearchBox) plus the "Travis County" coverage context. Render-only; the search
// callbacks come from the Map route.
import type { ReactElement } from "react";
import { Icon } from "@crm/ui";
import { COUNTY_NAME } from "../../components/AppShell/navigation.js";
import { SearchBox, type SearchBoxProps } from "./SearchBox.js";
import styles from "./TopBar.module.css";

export function TopBar(search: SearchBoxProps): ReactElement {
  return (
    <div className={styles.bar}>
      <SearchBox {...search} />
      <span className={styles.county}>
        <Icon name="location_on" size="small" />
        {COUNTY_NAME}
      </span>
    </div>
  );
}
