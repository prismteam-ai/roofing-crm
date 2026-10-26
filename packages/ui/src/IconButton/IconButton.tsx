// B-03 map-controls UI primitive (zoom +/-, locate/recentre, layers trigger). A plain 48x48
// Atlas icon button — Material Symbols glyph, surface-container background, on-surface icon,
// visible focus ring (constitution: 48 px targets, visible focus). Render-only; the caller
// decides what the click does.
import type { ButtonHTMLAttributes, ReactElement } from "react";
import { Icon } from "../Icon/Icon.js";
import styles from "./IconButton.module.css";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Material Symbols Rounded glyph name. */
  readonly icon: string;
  /** Accessible name (visible text is icon-only). */
  readonly label: string;
  readonly active?: boolean;
}

export function IconButton({
  icon,
  label,
  active = false,
  className,
  ...rest
}: IconButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={`${styles.button} ${active ? styles.active : ""} ${className ?? ""}`}
      aria-label={label}
      title={label}
      {...rest}
    >
      <Icon name={icon} size="medium" />
    </button>
  );
}
