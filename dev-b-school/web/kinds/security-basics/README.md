# Security basics drill

**STANDARDS kind:** Security basics (XSS/CSRF hygiene; don’t trust innerHTML)

## What this page does
- Renders user-typed strings with **`textContent`** (safe).
- Documents the dangerous `innerHTML = userString` pattern in **HTML comments + on-page callout only**.

## What this page deliberately does NOT do
- Does **not** execute or demonstrate a live XSS payload.
- Does **not** disable escaping “for fun.”

## Eng refs
OWASP Cheat Sheet Series — XSS Prevention; MDN `Node.textContent`.
