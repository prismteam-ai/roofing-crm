// The primary destinations (bottom bar below 600 px, rail from 600 px; boards CrmShell1440 and
// CrmBottomNav). One list, drawn once: each destination says where it shows (navigation.ts) and
// the stylesheet hides the other layout's items. The map's modes are part of the URL, so a link
// is current when its route matches and, for the map, when `?mode=` is one of its modes.
import { Icon } from "@crm/ui";
import type { ReactElement } from "react";
import { Link, useLocation } from "react-router";
import { DESTINATIONS, shellModeOf, type Destination } from "./navigation.js";
import styles from "../AppShell.module.css";

function isCurrent(destination: Destination, pathname: string, search: string): boolean {
  if (pathname !== destination.route) return false;
  if (destination.modes === undefined) return true;
  return destination.modes.includes(shellModeOf(search));
}

export function ShellNav(): ReactElement {
  const { pathname, search } = useLocation();
  return (
    <>
      {DESTINATIONS.map((destination) => {
        const current = isCurrent(destination, pathname, search);
        const classes = [
          styles.item,
          current ? styles.itemActive : "",
          destination.where === "bar" ? styles.itemBarOnly : "",
          destination.where === "rail" ? styles.itemRailOnly : "",
          destination.nested === true ? styles.itemNested : "",
        ]
          .filter((c) => c !== "")
          .join(" ");
        return (
          <Link
            key={`${destination.label}:${destination.to}`}
            to={destination.to}
            className={classes}
            aria-current={current ? "page" : undefined}
            data-nested={destination.nested === true ? "" : undefined}
          >
            <span className={styles.pill}>
              <Icon
                name={destination.icon}
                size={destination.nested === true ? "medium" : "large"}
              />
            </span>
            <span className={styles.label}>{destination.label}</span>
          </Link>
        );
      })}
    </>
  );
}
