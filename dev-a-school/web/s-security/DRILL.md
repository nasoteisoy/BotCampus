# Dev A — Website STANDARDS · **Security basics**

**Preview:** https://nasoteisoy.github.io/BotCampus/dev-a-school/web/s-security/?v=ss1  
**Kind:** XSS/CSRF hygiene mindset; don’t trust innerHTML with untrusted input.

## QC
1. Paste `<img src=x onerror=alert(1)>` → Safe render shows literal text; no alert.
2. “Demo unsafe” explains block; does not execute markup.
3. Labeled controls, 48px taps, focus rings; document UI only (not a game).
