// Fonterra farmgate forecast parser, adapted from the cot-analysis/tools/dairy
// proof of concept (src/fonterra.ts). Fetching lives in the collection Worker.

import type { RangeSource } from "./snapshot";

export const FONTERA_SOURCE_URL =
  "https://www.fonterra.com/nz/en/investors/financial-reports-and-farmgate-milk-price.html";

export type OfficialForecastValues = {
  season: string;
  midpoint: number;
  low: number | null;
  high: number | null;
  rangeSource: RangeSource;
  announcedAt: string;
  noChangeUpdate: { date: string } | null;
  sourceUrl: string;
};

export type OfficialForecastResult =
  | ({ status: "ok" } & OfficialForecastValues)
  | {
      status: "unavailable";
      reason:
        | "no-forecast-tables"
        | "season-mismatch"
        | "no-priced-row"
        | "invalid-range"
        | "unreadable-latest-update";
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
  // Present when the row is recognisably an announcement but its date or price
  // failed strict parsing; such a row must never be silently skipped.
  unparseable: boolean;
}

interface PriceCell {
  midpoint: number | null;
  low: number | null;
  high: number | null;
  footnoteMarker: boolean;
}

type PriceCellResult = PriceCell | "unparseable";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

type LabelCell = { label: string; date: string } | "unparseable" | null;

function validCalendarDate(year: number, month: number, day: number): boolean {
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function parseLabelCell(cell: string): LabelCell {
  const m = cell.match(
    /(Opening Forecast|Forecast Update|Final Update)\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i,
  );
  // A known label without a readable date is an announcement we cannot place.
  if (!m) {
    return /^\s*(Opening Forecast|Forecast Update|Final Update)\b/i.test(cell)
      ? "unparseable"
      : null;
  }
  const month = MONTHS[m[3].toLowerCase()];
  if (!month) return "unparseable";
  const day = parseInt(m[2], 10);
  const year = parseInt(m[4], 10);
  if (!validCalendarDate(year, month, day)) return "unparseable";
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { label: m[1].replace(/update/i, "Update"), date };
}

function parsePriceCell(cell: string): PriceCellResult {
  const footnoteMarker = /\*\s*$/.test(cell);
  const m = cell.match(PRICE_RE);
  if (!m || m.index === undefined) return "unparseable";
  const remainder = (cell.slice(0, m.index) + cell.slice(m.index + m[0].length))
    .replace(/[\s*]/g, "");
  // Leftover digits, currency marks, or range dashes mean a malformed price.
  if (/[\d$]|[-–]/.test(remainder)) return "unparseable";

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

// "Current Season 2026/2027" | "2025/2026" → season id; null for "Archives".
function parseSeasonLabel(text: string): string | null {
  const m = text.match(/(\d{4})\s*\/\s*(\d{4})/);
  if (!m) return null;
  return `${m[1]}/${String(parseInt(m[2], 10) % 100).padStart(2, "0")}`;
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

  // Tab labels name each pane's season; the pane id preceding a table binds them.
  // Attribute order and child markup vary, so parse the anchor body, not a fixed shape.
  const paneLabels = new Map<string, string>();
  for (const tag of scope.matchAll(/<a\b[^>]*>/g)) {
    const href = tag[0].match(/href="#(tabbedContent-[^"]+)"/);
    if (!href || tag.index === undefined) continue;
    const end = scope.indexOf("</a>", tag.index);
    if (end === -1) continue;
    paneLabels.set(href[1], stripTags(scope.slice(tag.index + tag[0].length, end)));
  }
  const panePositions = [...scope.matchAll(/id="(tabbedContent-[^"]+)"/g)].map(
    (m) => ({ pos: m.index ?? 0, id: m[1] }),
  );

  const tableMatches = [...scope.matchAll(/<table[\s\S]*?<\/table>/g)];
  const seasons = new Map<string, ParsedRow[]>();

  for (let i = 0; i < tableMatches.length; i++) {
    const table = tableMatches[i];
    const zoneEnd = tableMatches[i + 1]?.index ?? scope.length;
    const footnote = parseFootnoteRange(
      scope.slice((table.index ?? 0) + table[0].length, zoneEnd),
    );

    const rows: ParsedRow[] = [];
    for (const tr of table[0].match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
      const cells = [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(
        (m) => stripTags(m[1]),
      );
      if (cells.length < 2) continue;
      const label = parseLabelCell(cells[0]);
      if (label === null) continue;

      if (label === "unparseable") {
        rows.push({
          label: "",
          date: "",
          midpoint: null,
          low: null,
          high: null,
          rangeSource: "none",
          noChange: false,
          unparseable: true,
        });
        continue;
      }

      if (/^\s*no change\b/i.test(cells[1])) {
        rows.push({
          label: label.label,
          date: label.date,
          midpoint: null,
          low: null,
          high: null,
          rangeSource: "none",
          noChange: true,
          unparseable: false,
        });
        continue;
      }

      const price = parsePriceCell(cells[1]);
      if (price === "unparseable") {
        rows.push({
          label: label.label,
          date: label.date,
          midpoint: null,
          low: null,
          high: null,
          rangeSource: "none",
          noChange: false,
          unparseable: true,
        });
        continue;
      }

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
        unparseable: false,
      });
    }
    if (rows.length === 0) continue;

    const labelSeason = parseSeasonLabel(
      paneLabels.get(
        panePositions.filter((p) => p.pos < (table.index ?? 0)).at(-1)?.id ?? "",
      ) ?? "",
    );
    const earliest = rows.reduce((a, b) => (a.date <= b.date ? a : b));
    const season = labelSeason ?? seasonFromOpening(earliest.date);
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
  const latestPriced = priced[0];
  // Any unreadable announcement newer than the price we would publish breaks
  // the carry-forward chain, including ones we cannot date at all.
  if (
    rows.some(
      (r) =>
        r.unparseable &&
        (r.date === "" || latestPriced === undefined || r.date > latestPriced.date),
    )
  ) {
    return { status: "unavailable", reason: "unreadable-latest-update" };
  }
  if (priced.length === 0) {
    return { status: "unavailable", reason: "no-priced-row" };
  }
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
