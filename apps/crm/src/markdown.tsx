import { Fragment, type ReactNode } from "react";

/**
 * A small markdown renderer for the agent's answer text, building React elements only: no raw HTML is ever
 * interpreted (an HTML tag in the text is shown as text; React escapes it) and nothing goes through
 * dangerouslySetInnerHTML. It covers what the agent writes: paragraphs, headings, bullet and numbered lists,
 * pipe tables, fenced code, and inline bold, italic, code and links (http and https only).
 * IDs listed in `flagged` (the answer's unverified IDs) are marked wherever they appear in the text.
 */
export function Markdown({
  text,
  flagged = [],
}: {
  text: string;
  flagged?: readonly string[];
}) {
  return <>{blocks(text.replace(/\r\n?/g, "\n"), flagged)}</>;
}

const TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

const cells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

function blocks(text: string, flagged: readonly string[]): ReactNode[] {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  const key = () => `b${out.length}`;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```"))
        code.push(lines[i++]!);
      i++;
      out.push(
        <pre key={key()} className="mono">
          {code.join("\n")}
        </pre>,
      );
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      // Answer headings sit below the panel's own: level n is shown as h(n+2), at most h6.
      const level = Math.min(6, h[1]!.length + 2);
      const Tag = `h${level}` as "h3";
      out.push(<Tag key={key()}>{inline(h[2]!, flagged)}</Tag>);
      i++;
      continue;
    }
    if (line.trim().startsWith("|") && TABLE_SEP.test(lines[i + 1] ?? "")) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith("|"))
        rows.push(cells(lines[i++]!));
      out.push(
        <div key={key()} className="table-wrap">
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, flagged)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, k) => (
                <tr key={k}>
                  {head.map((_, j) => (
                    <td key={j}>{inline(r[j] ?? "", flagged)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const listKind = BULLET.test(line)
      ? BULLET
      : NUMBERED.test(line)
        ? NUMBERED
        : null;
    if (listKind) {
      const items: string[] = [];
      while (i < lines.length && listKind.exec(lines[i]!)) {
        items.push(listKind.exec(lines[i]!)![1]!);
        i++;
      }
      const List = listKind === BULLET ? "ul" : "ol";
      out.push(
        <List key={key()}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, flagged)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !HEADING.test(lines[i]!) &&
      !BULLET.test(lines[i]!) &&
      !NUMBERED.test(lines[i]!) &&
      !lines[i]!.trim().startsWith("```") &&
      !(lines[i]!.trim().startsWith("|") && TABLE_SEP.test(lines[i + 1] ?? ""))
    )
      para.push(lines[i++]!.trim());
    out.push(<p key={key()}>{inline(para.join(" "), flagged)}</p>);
  }
  return out;
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/;

/** Inline markup; plain text leaves go through flag(). */
export function inline(text: string, flagged: readonly string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(...flag(rest, flagged, out.length));
      break;
    }
    if (m.index > 0)
      out.push(...flag(rest.slice(0, m.index), flagged, out.length));
    const tok = m[0];
    const k = `i${out.length}`;
    if (m[1]) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (m[2] || m[3])
      out.push(<strong key={k}>{inline(tok.slice(2, -2), flagged)}</strong>);
    else if (m[4]) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push(
        /^https?:\/\//i.test(href!) ? (
          <a key={k} href={href} target="_blank" rel="noreferrer noopener">
            {inline(label!, flagged)}
          </a>
        ) : (
          <Fragment key={k}>{flag(tok, flagged, 0)}</Fragment>
        ),
      );
    } else out.push(<em key={k}>{inline(tok.slice(1, -1), flagged)}</em>);
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

/** The text with every flagged ID marked as unverified. */
function flag(text: string, ids: readonly string[], base: number): ReactNode[] {
  if (!ids.length) return [text];
  const re = new RegExp(
    `(${ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  );
  return text.split(re).map((part, j) =>
    ids.includes(part) ? (
      <mark
        key={`f${base}-${j}`}
        className="unverified"
        data-testid="unverified-id"
        title="Not returned by any tool in this answer: treat it as unconfirmed."
      >
        {part} (unverified)
      </mark>
    ) : (
      part
    ),
  );
}
