# Website kinds — map to STANDARDS.md

Hub: [`index.html`](./index.html)  
Source catalog: `research-notes/website-dev-school/STANDARDS.md`

| Kind (STANDARDS) | Drill path | What this tiny stub shows |
|------------------|------------|---------------------------|
| **HTML semantics** + **WCAG / a11y** | [`semantics-a11y/`](./semantics-a11y/) | Landmarks, skip link, focus rings, contrast-minded theme |
| **Responsive** | [`responsive/`](./responsive/) | Phone-first cards that reflow (1 → 2 → 3 columns) |
| **Forms / validation** | [`forms/`](./forms/) | Labeled form + visible validation errors |
| **API / error UX** | [`api-errors/`](./api-errors/) → [`../index.html?fail=1`](../index.html?fail=1) | Deep-link to parent fetch error, or mini error page |
| **Security basics** | [`security-basics/`](./security-basics/) | Safe text render vs dangerous pattern called out (no live XSS) |
| **Performance (CWV)** | [`perf-cwv/`](./perf-cwv/) | CWV notes + lazy-load image demo |

**Not drilled here (still in STANDARDS):** SEO basics, Routing/IA (parent hash routes), Deploy/hosting (Dev A push rule).

**Platform:** Android Chrome + Windows. Phone-first. Whimsical silly.
