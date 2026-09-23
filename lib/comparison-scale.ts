// Domain math for the pure-CSS comparison strip (docs/design.md §4.3).
// Markers are never clamped: the padded, minimum-width domain guarantees
// every plotted value lands interior to the track, including equal values.

const PADDING = 0.02;
const MIN_SPAN = 0.5;

export interface StripInputs {
  midpoint: number;
  low: number | null;
  high: number | null;
  futures: number | null;
}

export type LabelEdge = "left" | "center" | "right";

export interface StripScale {
  domainMin: number;
  domainMax: number;
  officialFraction: number;
  futuresFraction: number | null;
  rangeMinFraction: number | null;
  rangeMaxFraction: number | null;
  ticks: { value: number; fraction: number; edge: LabelEdge }[];
}

// Labels within 15% of an edge align toward the interior so outlier
// markers never push their label out of the viewport.
export function labelEdge(fraction: number): LabelEdge {
  if (fraction < 0.15) return "left";
  if (fraction > 0.85) return "right";
  return "center";
}

export function stripScale(inputs: StripInputs): StripScale | null {
  const { midpoint, low, high, futures } = inputs;
  const hasRange = low !== null && high !== null;
  if (!hasRange && futures === null) return null;

  let lo: number;
  let hi: number;
  if (hasRange && futures !== null) {
    lo = Math.min(low, futures);
    hi = Math.max(high, futures);
  } else if (hasRange) {
    lo = low;
    hi = high;
  } else {
    lo = Math.min(midpoint, futures as number);
    hi = Math.max(midpoint, futures as number);
  }

  // Equal prices must not collapse the track: widen to the minimum span
  // around the shared centre, then pad for marker breathing room.
  const centre = (lo + hi) / 2;
  const half = Math.max((hi - lo) / 2, MIN_SPAN / 2);
  const span = half * 2;
  const pad = span * PADDING;
  const domainMin = centre - half - pad;
  const domainMax = centre + half + pad;
  const fraction = (value: number) => (value - domainMin) / (domainMax - domainMin);

  const tickValues = hasRange ? [low, high] : [midpoint, futures as number];

  return {
    domainMin,
    domainMax,
    officialFraction: fraction(midpoint),
    futuresFraction: futures === null ? null : fraction(futures),
    rangeMinFraction: hasRange ? fraction(low) : null,
    rangeMaxFraction: hasRange ? fraction(high) : null,
    ticks: tickValues.map((value) => ({
      value,
      fraction: fraction(value),
      edge: labelEdge(fraction(value)),
    })),
  };
}

export function stripAria(inputs: StripInputs): string | null {
  const { midpoint, low, high, futures } = inputs;
  if (stripScale(inputs) === null) return null;

  const money = (value: number) => `$${value.toFixed(2)}`;
  if (futures === null) {
    return `Official forecast midpoint ${money(midpoint)} with a published range ${money(low as number)} to ${money(high as number)}.`;
  }

  const difference = futures - midpoint;
  const position =
    Math.abs(difference) < 0.005
      ? `matches the official midpoint ${money(midpoint)}`
      : `sits ${money(Math.abs(difference))} ${difference > 0 ? "above" : "below"} the official midpoint ${money(midpoint)}`;
  if (low === null || high === null) {
    return `Futures ${money(futures)} ${position}.`;
  }
  const within = futures >= low && futures <= high ? "inside" : "outside";
  return `Futures ${money(futures)} ${position}, ${within} the published range ${money(low)} to ${money(high)}.`;
}
