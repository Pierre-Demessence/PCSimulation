import type { RuleSeverity } from './compat';
import type { CompatParts } from './parts/specs';

import { CONFIGURATION_RULES } from './compat';

/** A rule that can be met or broken, stated so the reader can check it. */
export interface Check {
  readonly id: string;
  readonly statement: string;
  /** The rule's own wording, from the one list `validateConfiguration` walks. */
  readonly rule: string;
  readonly sources: readonly string[];
  readonly met: boolean;
  /** `incompatible` (parts cannot work together) or `warning` (works, below spec). */
  readonly severity: RuleSeverity;
}

/**
 * The board's rules as rows. Only a rule that carries a `statement` becomes a
 * row, which today means the four board relations: the generation accepted,
 * channels within the board's cap, channels within its DIMM slots, and speed
 * within its cap.
 *
 * The rest of the list is the positivity guards (`channels ≥ 1`,
 * `mtPerSecond ≥ 1`, `casLatency ≥ 1` and the four outstanding-miss checks), and
 * they get no row because the editor's descriptors already have `min: 1`
 * everywhere: a row would describe a state the UI cannot produce. They keep
 * reaching the reader through `validateConfiguration`'s warnings line, which is
 * hidden while the sheet is up, so nothing is stated twice.
 *
 * A rule whose fields are not all present yields no row, so a partial build
 * lists only the checks its parts can support.
 */
export function buildChecks(parts: CompatParts): readonly Check[] {
  const checks: Check[] = [];
  for (const rule of CONFIGURATION_RULES) {
    const outcome = rule.evaluate(parts);
    if (outcome === null || outcome.statement === undefined)
      continue;
    checks.push({
      id: rule.id,
      met: outcome.violation === null,
      rule: outcome.rule,
      severity: rule.severity,
      sources: rule.sources,
      statement: outcome.statement,
    });
  }
  return checks;
}
