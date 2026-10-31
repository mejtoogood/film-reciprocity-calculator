# Reciprocity Meter

**Status:** First implementation deployed from the main branch to GitHub Pages.

A compact, offline-first photographic film reciprocity compensation calculator for field use. Designed as a standalone, installable PWA for a phone, following the interaction and visual conventions of the existing [Zone Meter](https://github.com/mejtoogood/photography-zonesystem-simple-calculator) and [Flash Meter](https://github.com/mejtoogood/godox-it30pro-manualmode-helper) projects.

## Scope

Three tabs in a persistent bottom navigation bar:

1. **Calc** — select film, enter a metered exposure, read the corrected exposure.
2. **Graph / Table** — inspect the film's correction curve and a reference table.
3. **Config** — manage film profiles and their correction data; import/export settings.

**Explicit exclusions:** No countdown timer, no metering integration, no exposure logging, no account or cloud service, and no unrelated exposure calculator. Do not build additional functionality without revisiting the scope.

## 1. Calc

The default landing view, optimised for rapid operation outdoors.

- **Film stock:** Compact, prominent dropdown showing the active film. Selection persists across sessions and is shared with the Graph / Table tab.
- **Metered exposure:** Shutter-time control covering conventional sub-second shutter speeds and longer exposures, navigable in sensible photographic increments. Allow *direct numeric entry* in seconds for non-standard values. The field must support long durations without forcing a huge dropdown list.
- **Corrected exposure:** Primary, large, read-only result. Display as `1m 32s`, `32s`, or `1h 04m 12s` according to duration. Calculate at full precision internally and use practical display rounding (normally nearest second for exposures of at least one second).
- **Compensation:** Secondary display in stops, `+1.62 EV` for example, calculated as `log2(corrected / metered)`. No unnecessary explanatory text.
- **Instant updating:** No Calculate or Apply button. Film choice and exposure controls update the output immediately.
- **Boundaries:** If correction is not needed, show the metered time. If the film data do not support a particular time, show a clear *out-of-range* state rather than silently guessing.
- **State:** Retain the last film and metered time on reopening. No automatic tab switching when values change.

Example for Ilford PAN F Plus 50: `30 s` metered -> approximately `1m 32s` corrected, `+1.62 EV`.

## 2. Graph / Table

Both representations use the same active profile and calculation engine as Calc.

**Graph**

- Plot metered exposure on the x-axis and corrected exposure on the y-axis; use **logarithmic time axes** to preserve usability across seconds to minutes/hours.
- Show the film's curve alongside a subtle 1:1 (no correction) reference line.
- Highlight the current metered/corrected exposure point.
- Allow interaction with the plot to inspect points; selecting a value updates the shared calculator state **without changing tabs**.
- Distinguish data-derived/interpolated curves from any explicitly enabled extrapolation; never imply greater accuracy than the underlying profile supports.

**Table**

- Columns: metered exposure, corrected exposure, additional EV.
- Use useful photographic exposure intervals, with a row for the current metered value as appropriate.
- Highlight the current value. Tapping a row changes the shared metered exposure without navigating away.
- Keep scrolling within the graph/table content area; leave the navigation bar fixed.

## 3. Config

### Film library

- Add, edit, duplicate, select and delete custom film profiles.
- Built-in manufacturer profiles are **read-only**; duplication allows customising one without overwriting sourced values.
- Each profile has: manufacturer, film name, nominal ISO (metadata, not a mathematical input to reciprocity correction), model type, correction data, source URL/title/date, and optional notes/limitations.
- The current film must always point to a valid profile; deleting it selects a remaining built-in profile.
- Support JSON **export/import** of custom profiles and preferences, with schema versioning and input validation. Import previews conflicts before replacing existing data. Data stay on the device unless deliberately exported.

### Correction models

Support two distinct models rather than assuming every film follows Ilford's equation:

**A. Power-law coefficient**

- Parameters: `p` and a film-specific no-correction threshold `t0` in seconds.
- For the source-supported domain: `t_corrected = t_metered ^ p`, with time in seconds.
- For `t_metered <= t0`: no correction.
- Optional source-declared measured/validated range; unknown limits remain marked *unknown*, not infinite.
- Validate `p`, threshold and all numeric data before saving.

**B. Tabulated curve**

- User enters ordered `(metered seconds, corrected seconds)` pairs from a manufacturer's table, digitised graph or personal test data.
- Use **log–log interpolation** between adjacent positive, monotonic points (linear interpolation of `ln(t)` versus `ln(t_corrected)`).
- No extrapolation outside supplied points by default. An eventual explicit override must label resulting values as extrapolated.
- Validate positive times, strictly increasing metered times and a coherent non-decreasing corrected curve; reject duplicates.
- Clearly label source provenance (manufacturer table, digitised curve, user measurement) so a digitised graph is not presented as exact experimental data.

The data model and calculation logic must be independent of the display. Graph and table must not apply their own distinct correction approximations.

### Initial included profile

**Ilford PAN F Plus 50** (`ISO 50`): power law `p = 1.33`, using the film-specific factor in Ilford's *Film Reciprocity Failure Compensation* (December 2023). That document says no correction for metered exposures of **1 second or less**. An Ilford PAN F Plus datasheet instead describes compensation for exposures longer than **1/2 second**; explicitly document this discrepancy and use the December 2023 general compensation sheet as the initial profile's threshold authority until reviewed. Do **not** blend the two rules invisibly.

Formula for above-threshold exposures:

```
t_corrected_seconds = t_metered_seconds ** 1.33
extra_EV = log2(t_corrected_seconds / t_metered_seconds)
```

Manufacturer sources:

- [Ilford — Film Reciprocity Failure Compensation (Dec 2023)](https://www.ilfordphoto.com/amfile/file/download/file/1964/product/2246/)
- [Ilford — PAN F Plus technical information](https://www.ilfordphoto.com/amfile/file/download/file/1905/product/431/)

**Initial film library: PAN F Plus 50 only.** Do not populate other stocks with guessed or unsourced factors. Additional manufacturer-backed films can be added later.

## Visual and interaction style

- Match the restrained dark, high-contrast visual language of Zone Meter and Flash Meter; make the corrected exposure the focus of Calc.
- Optimise primarily for portrait phone use, including iOS Home Screen standalone mode and safe-area insets.
- Persistent three-tab bottom navigation; no decorative icons, filler paragraphs or instructional clutter on operating screens.
- Large touch targets, tabular numerals, native dropdowns where suitable, and direct-value editing where useful.
- Calc is a **fixed instrument viewport**: no document scrolling, pinch zoom or double-tap zoom. Graph/Table may scroll or pan *within their content area*, and Config may scroll normally to allow data entry.
- Never change tabs automatically because a table row, graph point, film stock or setting is selected.
- Keep state synchronised between tabs.

## Technical approach

- Static, dependency-light HTML/CSS/JavaScript; suitable for deployment from **GitHub Pages**.
- Installable PWA (manifest, app icons, standalone display mode, offline service-worker cache).
- No backend, no trackers, no mandatory account, and no network dependency after initial installation.
- Profiles and preferences stored locally; JSON export protects against storage loss. Handle unavailable/cleared storage gracefully.
- Keep a pure, independently testable correction engine, separate from UI and persistence.
- Cache/version changes must update reliably without silently losing custom film profiles.
- Accessibility: visible focus states, adequate contrast, accessible labels, and assistive-tech announcements for result changes without disrupting manual controls.

## Acceptance criteria (first implementation)

1. With PAN F Plus selected, 30 s metered yields approximately 92 s corrected and +1.62 EV (before display rounding).
2. At 1 s or less, the initial PAN F Plus profile returns the uncorrected time under its selected manufacturer guidance.
3. Switching film or metered time immediately updates Calc, Graph, and Table without navigation.
4. Graph/table selections alter shared input without switching tabs.
5. A user can add a custom power-law profile and a custom table-based profile, and each calculates correctly.
6. Tabulated profiles interpolate between their data points; out-of-range requests do not silently extrapolate.
7. Export/import preserves custom profiles and selected settings; malformed profile data are rejected without corrupting the library.
8. Application operates offline after installation; app restart retains the last selected film and metered exposure.
9. No countdown timer or other unrequested feature is present.

## First implementation

The app is implemented as a static PWA and is deployed automatically when `main` changes through GitHub Pages (branch: `main`, folder: `/ (root)`).

App: https://mejtoogood.github.io/film-reciprocity-calculator/

Source files:
- `index.html` — three-screen application shell
- `styles.css` — layout and touch UI
- `app.js` — state, profile editing, graphs, table and persistence
- `core.mjs` — pure reciprocity calculations and profile validation
- `test-core.mjs` — executable Node.js correction-model tests
- `sw.js`, `manifest.webmanifest`, `icon.svg` — installable offline PWA

Run calculation tests with `node --test test-core.mjs`. The application is dependency-free.

### Current limitations

- The only bundled film is Ilford PAN F Plus 50. Other films must be added with user-supplied source data.
- The power-law domain limits are unknown where not published by the manufacturer.
- No countdown timer is implemented, by design.
- JSON backups are recommended because browser storage can be cleared.

