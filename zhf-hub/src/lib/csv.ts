/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  while (i < s.length) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      if (ch === "\r" && s[i + 1] === "\n") i++;
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

/** Turn rows into objects keyed by a normalised header. */
export function csvObjects(text: string) {
  const rows = parseCsv(text);
  const header = (rows.shift() ?? []).map(normKey);
  return { header, records: rows.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

export function normKey(k: string) {
  return k
    .toLowerCase()
    .replace(/\(do not modify\)/g, "dnm ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** First non-empty value among the candidate (normalised) column names. */
export function pickCol(rec: Record<string, string>, candidates: string[]) {
  for (const c of candidates) {
    const v = rec[normKey(c)];
    if (v) return v;
  }
  return "";
}
