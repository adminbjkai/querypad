"use client";

import { Fragment, type ReactNode } from "react";

/**
 * A small Markdown renderer for assistant replies: headings, paragraphs, lists, pipe
 * tables, fenced code, and inline code/bold/italic/links. Fenced blocks are handed to
 * `renderCode` so the panel can turn SQL and action blocks into interactive cards.
 */
interface Props {
  text: string;
  renderCode: (lang: string, code: string, index: number) => ReactNode;
}

type Block =
  | { kind: "code"; lang: string; code: string }
  | { kind: "heading"; level: number; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "para"; text: string };

const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

function parse(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence (or end of a still-streaming block)
      blocks.push({ kind: "code", lang: fence[1].toLowerCase(), code: body.join("\n") });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(splitRow(lines[i++]));
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const bullet = /^\s*([-*•]|\d+[.)])\s+/;
    if (bullet.test(line)) {
      const ordered = /^\s*\d/.test(line);
      const items: string[] = [];
      while (i < lines.length && bullet.test(lines[i])) {
        let item = lines[i++].replace(bullet, "");
        // Continuation lines indented under the item.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i])) item += " " + lines[i++].trim();
        items.push(item);
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !bullet.test(lines[i])) {
      para.push(lines[i++]);
    }
    blocks.push({ kind: "para", text: para.join(" ") });
  }
  return blocks;
}

/** Inline formatting: `code`, **bold**, *italic*, [links](https://…). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      out.push(
        <code key={key++} className="rounded bg-sunken px-1 py-px font-mono text-[12px] text-ink">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("**")) {
      out.push(<strong key={key++} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("[")) {
      const [, label, href] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)!;
      out.push(
        <a key={key++} href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
          {label}
        </a>
      );
    } else {
      out.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index! + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function Markdown({ text, renderCode }: Props) {
  let codeIndex = 0;
  return (
    <div className="space-y-2 text-[13px] leading-[1.55] text-ink">
      {parse(text).map((block, i) => {
        switch (block.kind) {
          case "code":
            return <Fragment key={i}>{renderCode(block.lang, block.code, codeIndex++)}</Fragment>;
          case "heading":
            return (
              <p key={i} className={`font-semibold text-ink ${block.level <= 2 ? "text-[14px]" : "text-[13px]"}`}>
                {inline(block.text)}
              </p>
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={i} className={`space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"} marker:text-faint`}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item)}</li>
                ))}
              </List>
            );
          }
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-[12px]">
                  <thead className="bg-raised">
                    <tr>
                      {block.header.map((h, j) => (
                        <th key={j} className="border-b border-line px-2 py-1 text-left font-medium text-muted">
                          {inline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-b border-line last:border-0">
                        {row.map((c, j) => (
                          <td key={j} className="px-2 py-1 align-top tabular-nums">
                            {inline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={i}>{inline(block.text)}</p>;
        }
      })}
    </div>
  );
}
