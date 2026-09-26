/**
 * Palette and fonts shared by every view.
 *
 * Red, orange and green are the requested family, but a red/green weakness
 * makes hue alone unreliable, so nothing may carry meaning in colour without a
 * length, a hatch density, a shape or a word alongside it. The colour is the
 * bonus cue, never the cue.
 */
export const COLOURS = {
  background: '#11151c',
  band: '#1a2029',
  bandEdge: '#2a333f',
  boardIo: '#1f2733',
  busy: '#d98a2b',
  contextEdge: '#333c47',
  contextFill: '#1a1f27',
  fillOutline: '#b9a7ff',
  hatchStroke: 'rgba(255, 255, 255, 0.55)',
  link: '#5b6f88',
  muted: '#96a3b2',
  nameChip: 'rgba(17, 21, 28, 0.78)',
  ok: '#2f9e44',
  packet: '#79b8ff',
  partEdge: '#4a5a6e',
  partFill: '#243040',
  partFillCpu: '#2b3846',
  saturated: '#c8322b',
  stripEdge: '#5a7290',
  stripEmptyEdge: '#2a333f',
  stripFill: '#33445c',
  /** A recessed surface: the board plate, a meter track, an empty slot. */
  recess: '#161b23',
  text: '#e8eef5',
  wait: '#d9b36c',
};

export const FONT_SANS = 'system-ui, -apple-system, Segoe UI, sans-serif';
export const FONT_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * Colour for a utilisation figure. Only ever a bonus cue: every caller pairs it
 * with a bar length and a hatch density, so a red/green weakness loses nothing.
 */
export function utilisationColour(utilisation: number): string {
  return utilisation >= 0.8 ? COLOURS.saturated : utilisation >= 0.5 ? COLOURS.busy : COLOURS.ok;
}

/** Hatch spacing for a utilisation figure: the denser the hatch, the busier. */
export function utilisationHatch(utilisation: number): number {
  return utilisation >= 0.8 ? 3 : utilisation >= 0.5 ? 6 : utilisation > 0 ? 12 : 0;
}
