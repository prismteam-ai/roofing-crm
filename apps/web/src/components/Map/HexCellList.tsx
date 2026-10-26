// The keyboard and screen reader twin of the hexagon layer (which is drawn on a WebGL canvas and
// has no DOM): one button per cell, one tab stop (arrow keys, Home and End move between them),
// Enter, Space or a click opens the search at that cell. Visually hidden; the focused cell is
// outlined on the map by CrmMap (`onFocusCell`).
import { useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { hexCellLabel } from "./hexSearch.js";
import styles from "./HexCellList.module.css";

export interface HexListCell {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly count: number;
  readonly medianRoofAge: number | null;
}

export interface HexCellListProps {
  readonly cells: readonly HexListCell[];
  readonly onSelect: (cell: HexListCell) => void;
  /** The cell that has keyboard focus (to outline it on the map); null when focus leaves. */
  readonly onFocusCell: (id: string | null) => void;
}

export function HexCellList({
  cells,
  onSelect,
  onFocusCell,
}: HexCellListProps): ReactElement | null {
  // Reading order: north first, then west to east.
  const ordered = useMemo(() => [...cells].sort((a, b) => b.lat - a.lat || a.lng - b.lng), [cells]);
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  if (ordered.length === 0) return null;

  const move = (to: number): void => {
    const next = Math.max(0, Math.min(ordered.length - 1, to));
    setActive(next);
    refs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const keys: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: ordered.length - 1,
    };
    const to = keys[event.key];
    if (to === undefined) return;
    event.preventDefault();
    move(to);
  };

  return (
    <div
      role="group"
      aria-label="Hexagons: arrow keys move between them, Enter searches there"
      className={styles.list}
    >
      {ordered.map((cell, index) => (
        <button
          key={cell.id}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="button"
          className={styles.cell}
          tabIndex={index === Math.min(active, ordered.length - 1) ? 0 : -1}
          aria-label={hexCellLabel(cell)}
          data-hex-cell={cell.id}
          onFocus={() => {
            setActive(index);
            onFocusCell(cell.id);
          }}
          onBlur={(event) => {
            if (
              !(
                event.relatedTarget instanceof HTMLElement &&
                event.relatedTarget.dataset.hexCell !== undefined
              )
            )
              onFocusCell(null);
          }}
          onKeyDown={(event) => onKeyDown(event, index)}
          onClick={() => onSelect(cell)}
        />
      ))}
    </div>
  );
}
