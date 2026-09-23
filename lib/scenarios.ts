// Scenario price inputs persist locally per season. Source updates must
// never silently overwrite saved edits (implementation plan).

import type { OfficialForecast } from "./snapshot";

export type ScenarioKey = "low" | "midpoint" | "high";

export type ScenarioState = Record<ScenarioKey, string>;

export function storageKey(season: string): string {
  return `milkcompass:scenarios:${season}`;
}

export function scenariosFromOfficial(
  official: OfficialForecast,
): ScenarioState {
  return {
    low: official.low === null ? "" : String(official.low),
    midpoint: String(official.midpoint),
    high: official.high === null ? "" : String(official.high),
  };
}

export function loadScenarios(
  storage: Storage | null,
  season: string,
  official: OfficialForecast,
): ScenarioState {
  if (storage !== null) {
    try {
      const raw = storage.getItem(storageKey(season));
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (isScenarioState(parsed)) return parsed;
      }
    } catch {
      // Blocked or corrupt storage falls back to the official values.
    }
  }
  return scenariosFromOfficial(official);
}

export function saveScenarios(
  storage: Storage | null,
  season: string,
  state: ScenarioState,
): void {
  if (storage === null) return;
  try {
    storage.setItem(storageKey(season), JSON.stringify(state));
  } catch {
    // Blocked storage: edits stay session-only.
  }
}

export function clearScenarios(storage: Storage | null, season: string): void {
  if (storage === null) return;
  try {
    storage.removeItem(storageKey(season));
  } catch {
    // Nothing to recover; the in-memory reset still applies.
  }
}

function isScenarioState(value: unknown): value is ScenarioState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.low === "string" &&
    typeof candidate.midpoint === "string" &&
    typeof candidate.high === "string"
  );
}
