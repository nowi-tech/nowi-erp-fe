# Style Intake Form — Redesign

The `/styles/new` page was rewritten to match the locked Stitch design
(screen `8a4234547ab34f998c71309a1949e17b`, project
`2170436398981638100` — "New Style Intake — Sampling").

## Layout

```
max-w-[1100px], centered, sticky footer.

Breadcrumb · H1 · SourceToggle
ReviewerCard (full-width, navy left-accent)
Inspiration card  |  Article card           (lg: 2-up grid)
Sampling specifics                          (full-width, sampling only)
Sticky footer: hint · Save draft · Submit to <reviewer>
```

Mobile (`<md`) collapses to a single column, content order preserved.

## Components (under `src/components/styles/intake/`)

- `IntakeCard` — shared section chrome (border, header, optional `action`).
- `ReviewerCard` — slim top card surfacing the routed Approval #1 reviewer.
- `GenderSegment` — three-button pill bound to `Gender` (women/men/unisex).
- `CategoryPicker` — searchable combobox merging seed codes
  (`DRESS|PANT|TSHIRT|BLAZER|JACKET`) with whatever the BE returns.
  Includes a `+ Add new category` inline modal that POSTs to
  `/api/categories` and auto-selects the new row.
- `FabricPicker` — searchable combobox with a stock pill per row
  ("Stock OK" / "No stock — procurement first"). Includes a `+ Add fabric`
  inline modal (minimal name + uom + gsm + notes) that POSTs to
  `/api/fabrics` and auto-selects.
- `ReferenceImageGrid` — up to 5 tiles. Paste/drop/click to upload.
  Reference-link change → debounced 300ms `extractLink()` → background
  fetch, the result becomes a new tile. Drag-to-reorder, × to remove.
  Tile 0 is the "primary" (sticky border + badge).
- `categoryOptions.ts` — `GENDER_CATEGORIES` map (women/men/unisex →
  valid fine codes) and `deriveArticleCategory(gender, code)` which
  mirrors the server fallback so the FE can send both
  `articleCategory` (slug) and `categoryId` (int).

## Wire format

`POST /api/styles` body — sampling source:

```jsonc
{
  "source": "sampling",
  "category": "<slug>",          // legacy field, still required by FE type
  "articleCategory": "<slug>",   // explicit slug, derived from gender+code
  "categoryId": 7,               // preferred when known
  "workingName": "…",
  "gender": "women",
  "primaryColour": "…",
  "referenceLink": "…",
  "referenceImages": ["paths/0.jpg", "https://…/1.jpg"],  // new multi-image
  "referenceImageUrl": "https://…",
  "developmentReason": "<reason>\nSampling timeline: 5 days",
  "fabricId": 12,
  "sampleFabricRequired": 1.2,
  "collectionId": 3,
  "patternCadPaths": ["…"]
}
```

We deliberately **do not** send the legacy `referenceImage` single-string
field. The server mirrors `referenceImages[0]` into it for back-compat.

China-Import source drops the sampling-specific fields and adds `remark`.

## Behaviour notes

- **Gender → Category cascade.** Switching gender to a bucket that
  doesn't include the current category snaps to the first valid code
  (e.g. men → DRESS removed → falls back to JACKET).
- **Sample qty unit.** The unit suffix in the sample-fabric input is
  driven by the selected fabric's `unitOfMeasure` (`meter` → `m`,
  `kg` → `kg`, `oz` → `oz`). Disabled until a fabric is picked.
- **Reviewer routing.** `china_import` → Dheeraj; `men` → Pradyuman;
  `women`/`unisex` → Parul. Same name flows into the submit button.
- **Sampling timeline.** No dedicated BE column yet — currently
  appended to `developmentReason` as `"Sampling timeline: <value>"`.
  Promote to a real column when the BE adds one.

## Out of scope (per spec)

- Parent Style picker — lives on the Add-Colour modal, not this form.
- Pattern Master manual override — auto-route only.
- `hi.json` translations — English fallback.
- Per-field inline errors — page-level error banner only.
