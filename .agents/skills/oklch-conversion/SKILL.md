---
name: oklch-conversion
description: Apply when a colour or size reaches apps/web CSS from outside (a design handoff, FigCraft, a screenshot, a brand doc) as #hex, rgb() or px, or when checking that CSS colours match a design. Converts hex to oklch and px to rem with a script, never by hand, and lists oklch values as hex for comparison.
---

`apps/web` CSS uses `oklch()` for colours and `rem` for sizes (16px = 1rem). Design tools hand over `#hex` and `px`
(FigCraft only knows sRGB hex). Never convert by hand or estimate: the script finds the shortest oklch that maps back to
the exact same sRGB colour, alpha included.

## Script

Run from the repo root. It uses `culori` from `apps/web` (dev dependency).

```bash
S=.claude/skills/oklch-conversion/scripts/convert.mjs
node $S '#17707f' '#1c19170f' 15px     # → oklch(0.5028 0.0813 212.0712), oklch(0.216 0.006 56.043 / 6%), 0.9375rem
node $S --css <file>                   # preview: every hex, and every px custom property, converted
node $S --css <file> --write           # apply in place
node $S --to-hex <file>                # every oklch() as hex, to compare with the design's values
```

## Rules

- **Tokens first.** `app/assets/css/tokens.css` is generated from the design file. Don't edit it, and don't add a
  converted colour as a new literal in a component. A value the design uses repeatedly is a missing token: ask for it
  in the design. Converting is for one-offs and for checking.
- **px stays px** only for hairlines (`ring-[1.5px]`), shadow offsets and keyframe nudges. Everything else is a
  spacing step (`h-13`, `px-2.75`) or rem.
- **Radius** only on the scale: `rounded-sm` 6, `md` 8, `lg` 12, `xl` 14, `full`. Snap in-between values to the next
  smaller step instead of converting them.
- **Checking a change:** `--to-hex` on the CSS file, then compare the hex with the design. Same hex = same colour.

## Why culori

Picked over `hex-to-oklch` on 2026-11-09: MIT, no dependencies, three maintainers, about 6 M weekly downloads, and
already in the lockfile through `@maizzle/framework`. `hex-to-oklch` (MIT, one maintainer, about 16 weekly downloads)
failed the maintenance check of the dependency-choice skill.
