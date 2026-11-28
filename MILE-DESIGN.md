# MILE design system

MILE uses compact monochrome surfaces, italic page titles and the existing mountain banner artwork. Appearance owns the Forest, Graphite, Midnight, Mono, Light, Sand and Ice palettes. Use their surface, ink and border values so components stay readable when the athlete changes theme.

## Foundations

`mile-design.css` is loaded on the main shell, Run Tracker, MILE SIM, Challenges and password recovery. `mile-buttons.css` applies the shared action sizing to each supported page. `mile-compact.css` maps older component selectors to shared values as the app migrates.

| Element | Standard |
| --- | --- |
| Typeface | Inter, followed by the platform sans-serif stack |
| Page title | 24 px italic, weight 850 |
| Section heading | 18 px with a compact line height |
| Body and supporting text | 14 px body, 12 px supporting text, 11 px captions |
| Reading line height | 1.45 for paragraphs and forms, 1.2 for dense headings |
| Read-only metrics | Tabular numbers where supported, 14–20 px in dense tiles |
| Banner | 86 px minimum height, 10 × 14 px padding, 12 px radius, natural height for wrapping |
| Spacing | 4, 8, 12 and 16 px; main shell horizontal gutter 11 px on phones and 18 px on larger screens |
| Cards | 12 px radius and 12 px standard inner padding |
| Actions | Weight 650, 13 px label, 9 px radius, 12 px horizontal padding |
| Touch areas | 44 px minimum for common actions and primary controls, 52 px for bottom navigation |
| Icons | 16 px button glyphs, 20 px bottom navigation glyphs |
| Surfaces | `--mile-surface`, `--mile-surface-raised`, `--mile-border`, `--mile-ink` and `--mile-support` alias the active palette |

## Components and interactions

- Use the existing universal page banner for main-shell destinations and the shared banner geometry for embedded tools. Keep the existing brand header and place one screen title above the content.
- Use `mile-back-button` for intrinsic-width Back actions. Keep the label visible and the touch area at least 44 px. Existing activity and standalone controls receive the same compact treatment through the shared styles.
- Use the existing action families in `mile-buttons.css` for primary and secondary actions. Keep the active workout timer and safety-critical controls at their established sizes.
- Use visible focus outlines and explicit accessible names for icon-only buttons. Expose selection with `aria-pressed` or `aria-current` as appropriate.
- Keep essential filters visible on narrow screens. Use intentional horizontal scrolling for time-series charts or data tables where showing all items would make values unreadable.
- Use the shared workout dialog for forms. Its panel contains scrolling, keeps text inputs at 16 px and applies iPhone safe-area padding. Escape dismisses it and focus returns to the opening control. Dismissing a drawer restores the current screen's scroll position. Following a drawer link starts at the top of its destination.
- Format complete display dates as DD/MM/YYYY with `Intl.DateTimeFormat('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })`. Keep ISO values in storage and request payloads. Native date inputs follow the device's locale and continue to store ISO dates.
- Keep loading and error messages adjacent to the affected content. Use a compact explanatory empty state and the existing action where the athlete can resolve it.

## Checking changes

Run the repository Playwright suite in desktop Chromium, mobile Chromium and mobile WebKit. The browser audit fixture exercises the app's real views with synthetic sign-in and data responses. Use narrow mobile, tablet and desktop captures to check wrapping, hit areas and scroll behavior. Verify live account, provider and native device paths independently when they are in scope.

### Compact training editors

Training editors keep their heading and actions outside the scrollable fields. Use a two-column grid for paired fields where space permits and retain the single-column layout on the narrowest phones. Controls keep 16 px text and the Save action keeps a 44 px target. Use the visual viewport for the editor height and offset when the browser pans or resizes around its keyboard. Validate with a reduced viewport and with the device keyboard before release.
