import { AGENT_MARK_TONES, type AgentMarkTone } from '@repo/ai/client';
import type { TaskLabel } from '~/features/task/types';

export const LABEL_TONE_HEX: Record<AgentMarkTone, string> = {
  sea: '#17707F',
  sage: '#3F6B47',
  ochre: '#9A5B0F',
  clay: '#9C4A2A',
  dusk: '#4B609C',
  plum: '#7E4F85',
  rose: '#9B454F',
  stone: '#675F55',
};

const MIN_CHROMA = 0.05;
const HEX_COLOR = /^#([0-9a-f]{6})$/i;

interface Oklch {
  chroma: number;
  hue: number;
}

function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function hexToOklch(hex: string): Oklch | null {
  const match = HEX_COLOR.exec(hex);
  if (!match?.[1]) {
    return null;
  }
  const value = Number.parseInt(match[1], 16);
  const r = srgbToLinear(((value >> 16) & 255) / 255);
  const g = srgbToLinear(((value >> 8) & 255) / 255);
  const b = srgbToLinear((value & 255) / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;
  return { chroma: Math.hypot(a, bAxis), hue: (hue + 360) % 360 };
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

const CHROMATIC_TONES = AGENT_MARK_TONES.filter((tone) => tone !== 'stone');

function hueOf(tone: AgentMarkTone): number {
  return hexToOklch(LABEL_TONE_HEX[tone])?.hue ?? 0;
}

const TONE_HUE: Record<AgentMarkTone, number> = {
  sea: hueOf('sea'),
  sage: hueOf('sage'),
  ochre: hueOf('ochre'),
  clay: hueOf('clay'),
  dusk: hueOf('dusk'),
  plum: hueOf('plum'),
  rose: hueOf('rose'),
  stone: hueOf('stone'),
};

/** Maps any stored label colour to the closest identity tone. */
export function labelTone(label: Pick<TaskLabel, 'color'>): AgentMarkTone {
  const color = label.color;
  const exact = AGENT_MARK_TONES.find(
    (tone) => LABEL_TONE_HEX[tone].toLowerCase() === color.toLowerCase(),
  );
  if (exact) {
    return exact;
  }

  const oklch = hexToOklch(color);
  if (!oklch || oklch.chroma < MIN_CHROMA) {
    return 'stone';
  }

  let nearest: AgentMarkTone = 'stone';
  let nearestDistance = Infinity;
  for (const tone of CHROMATIC_TONES) {
    const distance = hueDistance(oklch.hue, TONE_HUE[tone]);
    if (distance < nearestDistance) {
      nearest = tone;
      nearestDistance = distance;
    }
  }
  return nearest;
}
