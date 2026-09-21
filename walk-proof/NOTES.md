# Walk proof — capability test

**Who:** Leader built this for the live call using GenerateImage (same tool Renders use) + assembly. Render A was also tasked in parallel; this delivery is Leader’s.

**What:** Side-view steel knight with red cape. Idle + 4 walk frames. Playable: walks a few steps then stops. Tree/hills behind, rock in front (depth order).

**Limits:**
- AI walk frames can still soft-fail contralateral arm/leg pairing (w1 note: same-side swing risk).
- Not 8-way; not production sheet; one facing only.
- Smoothness comes from frame timing + position lerp per frame, not motion blur.
- Magenta punch + foot-align normalize applied; slight halo possible.
