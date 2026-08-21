# Design — InkQuest

A locked design system for the app. Every production page shares this system.

## Genre

Playful with an editorial reading layer: approachable and alive, never childish.

## Macrostructure Family

- Marketing pages: Marquee Hero with an asymmetric story shelf.
- App pages: Ecosystem Index / Workbench with filters as tools, not card chrome.
- Content pages: Long Document with a calm reading sheet and decisions beneath.

## Theme

Custom “青墨纸本”: warm paper, cool ink, restrained story-teal.

- `--color-paper` oklch(97% 0.012 95)
- `--color-paper-2` oklch(94% 0.016 95)
- `--color-paper-3` oklch(91% 0.020 95)
- `--color-ink` oklch(20% 0.012 250)
- `--color-ink-2` oklch(34% 0.014 245)
- `--color-rule` oklch(78% 0.018 95)
- `--color-accent` oklch(72% 0.105 190)
- `--color-focus` oklch(45% 0.180 255)

## Typography

- Display: Plus Jakarta Sans, weight 600–700, roman.
- Body: Plus Jakarta Sans, weight 400–600.
- Reading: the platform’s CJK serif stack for story prose only.
- Mono: JetBrains Mono for metadata and compact labels.
- Display tracking: -0.045em to -0.065em.

## Spacing

4-point named scale in `tokens.css`. Production styles use tokens rather than raw theme values.

## Motion

- Transform and opacity only.
- Buttons press down; cards lift once on hover.
- No page-level scroll effects or looping ornament.
- Reduced-motion fallback: spatial motion removed, transitions capped at 150ms.

## Microinteractions Stance

- Visible instant focus rings.
- Silent success for local actions.
- Tooltips: 800ms on hover, immediate on focus/touch.
- Reversible choices do not use confirmation dialogs.

## CTA Voice

- Primary: teal rounded push button with dark ink and a solid lower edge.
- Secondary: ink outline or typographic arrow link.
- Labels are short, direct verbs and remain one line.

## Per-page Allowances

- Marketing pages may use the existing story artwork.
- App pages use function and data as the visual content.
- Reader pages use typography and story imagery only.

## What Pages Must Share

- Circular `IQ` mark, warm paper, teal anchor, display/body pairing.
- CTA shape, focus treatment, heavy ink rules, and tactile card edge.
- No gradients, glassmorphism, invented metrics, or generic three-feature rows.

## What Pages May Differ On

- Page macrostructure within its declared family.
- Story-card spans and artwork crops.
- Reading density and tool placement.

## Exports

### tokens.css

The canonical source is `tokens.css` at the project root.

### Tailwind v4 `@theme`

```css
@theme {
  --color-paper: oklch(97% 0.012 95);
  --color-paper-2: oklch(94% 0.016 95);
  --color-paper-3: oklch(91% 0.020 95);
  --color-ink: oklch(20% 0.012 250);
  --color-ink-2: oklch(34% 0.014 245);
  --color-rule: oklch(78% 0.018 95);
  --color-accent: oklch(72% 0.105 190);
  --color-focus: oklch(45% 0.180 255);
  --font-display: var(--font-jakarta), sans-serif;
  --font-body: var(--font-jakarta), sans-serif;
  --font-outlier: var(--font-jetbrains), monospace;
  --radius-card: 1.25rem;
  --radius-pill: 999px;
  --radius-input: 0.75rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG tokens.json

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "paper": { "$value": "oklch(97% 0.012 95)", "$type": "color" },
    "ink": { "$value": "oklch(20% 0.012 250)", "$type": "color" },
    "accent": { "$value": "oklch(72% 0.105 190)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Plus Jakarta Sans", "$type": "fontFamily" },
    "body": { "$value": "Plus Jakarta Sans", "$type": "fontFamily" },
    "outlier": { "$value": "JetBrains Mono", "$type": "fontFamily" }
  },
  "space": { "md": { "$value": "1.5rem", "$type": "dimension" } }
}
```

### shadcn/ui CSS variables

```css
:root {
  --background: 97% 0.012 95;
  --foreground: 20% 0.012 250;
  --card: 94% 0.016 95;
  --card-foreground: 20% 0.012 250;
  --primary: 72% 0.105 190;
  --primary-foreground: 18% 0.012 250;
  --muted: 91% 0.020 95;
  --muted-foreground: 47% 0.014 245;
  --border: 78% 0.018 95;
  --input: 78% 0.018 95;
  --ring: 45% 0.180 255;
  --radius: 1.25rem;
}
```
