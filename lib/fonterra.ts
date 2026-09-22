// Fonterra farmgate forecast parser, adapted from the cot-analysis/tools/dairy
// proof of concept (src/fonterra.ts). Fetching lives in the collection Worker.

import type { RangeSource } from "./snapshot";

export const FONTERA_SOURCE_URL =
  "https://www.fonterra.com/nz/en/investors/financial-reports-and-farmgate-milk-price.html";

export interface OfficialForecastValues {
  season: string;
  midpoint: number;
  low: number | null;
  high: number | null;
  rangeSource: RangeSource;
  announcedAt: string;
  noChangeUpdate: { date: string } | null;
  sourceUrl: string;
}

export type OfficialForecastResult =
  | ({ status: "ok" } & OfficialForecastValues)
  | {
      status: "unavailable";
      reason:
        | "no-forecast-tables"
        | "season-mismatch"
        | "no-priced-row"
        | "invalid-range";
    };

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// "$9.60-$9.80" | "$7.00-7.60" | "$ 7.25 - $8.75" | "$9.25*"
const PRICE_RE =
  /\$\s*(\d{1,2}\.\d{2})\s*(?:[-–]\s*\$?\s*(\d{1,2}\.\d{2}))?/;

interface ParsedRow {
  label: string;
  date: string;
  midpoint: number | null;
  low: number | null;
  high: number | null;
  rangeSource: RangeSource;
  noChange: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseLabelCell(cell: string): { label: string; date: string } | null {
  const m = cell.match(
    /(Opening Forecast|Forecast Update|Final Update)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i,
  );
  if (!m) return null;
  const month = MONTHS[m[3].toLowerCase()];
  if (!month) return null;
  const date = `${m[4]}-${String(month).padStart(2, "0")}-${String(parseInt(m[2], 10)).padStart(2, "0")}`;
  return { label: m[1].replace(/update/i, "Update"), date };
}

function parsePriceCell(cell: string): {
  midpoint: number | null;
  low: number | null;
  high: number | null;
  footnoteMarker: boolean;
} {
  const footnoteMarker = /\*\s*$/.test(cell);
  const m = cell.match(PRICE_RE);
  if (!m) return { midpoint: null, low: null, high: null, footnoteMarker };
  const first = parseFloat(m[1]);
  if (m[2] !== undefined) {
    return {
      midpoint: round2((first + parseFloat(m[2])) / 2),
      low: first,
      high: parseFloat(m[2]),
      footnoteMarker,
    };
  }
  return { midpoint: first, low: null, high: null, footnoteMarker };
}

// The season's range can sit in a footnote paragraph after the table.
function parseFootnoteRange(zoneHtml: string): { low: number; high: number } | null {
  const text = stripTags(zoneHtml);
  for (const line of text.split("\n")) {
    const m = line.match(
      /\*\s*[^$]*\$\s*(\d{1,2}\.\d{2})\s*[-–]\s*\$?\s*(\d{1,2}\.\d{2})/,
    );
    if (m) return { low: parseFloat(m[1]), high: parseFloat(m[2]) };
  }
  return null;
}

function seasonFromOpening(dateIso: string): string {
  const [y, m] = dateIso.split("-").map((v) => parseInt(v, 10));
  // Openings land May–July of the season's first year; Jan–Apr rows belong to the prior start.
  const startYear = m >= 5 ? y : y - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function currentSeason(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    month: "numeric",
    year: "numeric",
  }).formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "", 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "", 10);
  // Seasons run June–May; only row attribution lets May open the new season.
  const startYear = month >= 6 ? year : year - 1;
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function parseOfficialForecast(
  html: string,
  now: Date,
): OfficialForecastResult {
  const anchor = html.indexOf('id="farmgate-milk-price"');
  const scope = anchor >= 0 ? html.slice(anchor) : html;

  const tableMatches = [...scope.matchAll(/<table[\s\S]*?<\/table>/g)];
  const seasons = new Map<string, ParsedRow[]>();

  for (let i = 0; i < tableMatches.length; i++) {
    const table = tableMatches[i][0];
    const zoneEnd = tableMatches[i + 1]?.index ?? scope.length;
    const footnote = parseFootnoteRange(
      scope.slice(tableMatches[i].index + table.length, zoneEnd),
    );

    const rows: ParsedRow[] = [];
    for (const tr of table.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
      const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(
        (m) => stripTags(m[1]),
      );
      if (cells.length < 2) continue;
      const label = parseLabelCell(cells[0]);
      if (!label) continue;

      if (/^\s*no change\b/i.test(cells[1])) {
        rows.push({
          label: label.label,
          date: label.date,
          midpoint: null,
          low: null,
          high: null,
          rangeSource: "none",
          noChange: true,
        });
        continue;
      }

      const price = parsePriceCell(cells[1]);
      if (price.midpoint === null) continue;

      let { low, high } = price;
      let rangeSource: RangeSource = "none";
      if (low !== null && high !== null) {
        rangeSource = "inline";
      } else if (price.footnoteMarker && footnote) {
        low = footnote.low;
        high = footnote.high;
        rangeSource = "footnote";
      }

      rows.push({
        label: label.label,
        date: label.date,
        midpoint: price.midpoint,
        low,
        high,
        rangeSource,
        noChange: false,
      });
    }
    if (rows.length === 0) continue;

    const earliest = rows.reduce((a, b) => (a.date <= b.date ? a : b));
    const season = seasonFromOpening(earliest.date);
    if (!seasons.has(season)) seasons.set(season, rows);
  }

  if (seasons.size === 0) {
    return { status: "unavailable", reason: "no-forecast-tables" };
  }

  const targetSeason = currentSeason(now);
  const rows = seasons.get(targetSeason);
  if (!rows) {
    return { status: "unavailable", reason: "season-mismatch" };
  }

  rows.sort((a, b) => b.date.localeCompare(a.date));
  const priced = rows.filter((r) => r.midpoint !== null);
  if (priced.length === 0) {
    return { status: "unavailable", reason: "no-priced-row" };
  }

  const latestPriced = priced[0];
  const midpoint = latestPriced.midpoint as number;
  const { low, high } = latestPriced;
  if (
    (low !== null && high !== null && low > high) ||
    (low !== null && low > midpoint) ||
    (high !== null && high < midpoint)
  ) {
    return { status: "unavailable", reason: "invalid-range" };
  }

  const newest = rows[0];
  const noChangeUpdate =
    newest.noChange && newest.date !== latestPriced.date
      ? { date: newest.date }
      : null;

  return {
    status: "ok",
    season: targetSeason,
    midpoint,
    low,
    high,
    rangeSource: low !== null && high !== null ? latestPriced.rangeSource : "none",
    announcedAt: latestPriced.date,
    noChangeUpdate,
    sourceUrl: FONTERA_SOURCE_URL,
  };
}
