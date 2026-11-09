#!/usr/bin/env node
// Hex → oklch and px → rem for apps/web CSS, using culori from apps/web.
//
//   node convert.mjs '#17707f' '#1c19170f' 15px     convert values
//   node convert.mjs --css <file>                   show every hex and px custom property converted
//   node convert.mjs --css <file> --write           rewrite them in place
//   node convert.mjs --to-hex <file>                list every oklch() as sRGB hex, to compare with the design
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const webPackage = fileURLToPath(new URL('../../../../apps/web/package.json', import.meta.url));
const culoriEntry = createRequire(webPackage).resolve('culori');
const { formatHex, formatHex8, oklch: toOklch, parse } = (await import(culoriEntry)).default;

const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})\b/gi;
const OKLCH = /oklch\([^)]*\)/g;
const PX_PROPERTY = /^(\s*--[\w-]+:\s*)(-?\d+(?:\.\d+)?)px;/gm;

function trim(value, digits) {
  const text = value.toFixed(digits).replace(/\.?0+$/, '');
  return text === '-0' ? '0' : text;
}

function sameColor(a, b) {
  return formatHex8(a) === formatHex8(b);
}

export function hexToOklch(hex) {
  const source = parse(hex);
  if (!source) throw new Error(`not a colour: ${hex}`);
  const { l, c, h = 0, alpha = 1 } = toOklch(source);
  for (const digits of [3, 4, 5, 6]) {
    const chroma = Number(c.toFixed(digits));
    const hue = chroma === 0 ? 0 : Number(h.toFixed(digits));
    for (const alphaDigits of [0, 1, 2]) {
      const alphaPart = alpha < 1 ? ` / ${trim(alpha * 100, alphaDigits)}%` : '';
      const text = `oklch(${trim(l, digits)} ${trim(chroma, digits)} ${trim(hue, digits)}${alphaPart})`;
      if (sameColor(parse(text), source)) return text;
    }
  }
  throw new Error(`no exact oklch for ${hex}`);
}

export function pxToRem(px) {
  return `${trim(px / 16, 4)}rem`;
}

function convertValue(value) {
  const px = value.match(/^(-?\d+(?:\.\d+)?)px$/);
  return px ? pxToRem(Number(px[1])) : hexToOklch(value);
}

function convertCss(path, write) {
  const before = readFileSync(path, 'utf8');
  const after = before
    .replace(HEX, (hex) => hexToOklch(hex))
    .replace(PX_PROPERTY, (_, property, px) => `${property}${pxToRem(Number(px))};`);
  if (write) writeFileSync(path, after);
  const changed = after.split('\n').filter((line, i) => line !== before.split('\n')[i]);
  console.log(changed.length ? changed.join('\n') : 'nothing to convert');
}

function listHex(path) {
  const css = readFileSync(path, 'utf8');
  for (const line of css.split('\n')) {
    const values = line.match(OKLCH);
    if (!values) continue;
    const name = line.match(/--[\w-]+/)?.[0] ?? line.trim();
    const hex = values.map((value) => {
      const color = parse(value);
      return color.alpha !== undefined && color.alpha < 1 ? formatHex8(color) : formatHex(color);
    });
    console.log(`${name} ${hex.join(' ')}`);
  }
}

const args = process.argv.slice(2);
if (args[0] === '--css') convertCss(args[1], args.includes('--write'));
else if (args[0] === '--to-hex') listHex(args[1]);
else if (args.length) for (const value of args) console.log(`${value} → ${convertValue(value)}`);
else console.log('usage: convert.mjs <#hex|px ...> | --css <file> [--write] | --to-hex <file>');
