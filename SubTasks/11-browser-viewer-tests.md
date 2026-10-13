# 11: Browser Test, Real Viewer (Playwright)

**Goal:** Exercise the real Cornerstone viewer in a real browser against the real API and database. No mocked canvas.

## Setup
- `@playwright/test`, Chromium. `webServer` config starts the API (test DB, reseeded in `globalSetup`) and the Vite dev/preview server.
- Pixel assertions read the actual viewport canvas (`canvas.toDataURL()` / `getImageData`, or screenshot of the canvas element) and compare a checksum/sample of pixels.

## Scenarios
1. **Render gradient**: select the gradient study; wait for `state === 'ready'` via `window.__viewerDebug`; canvas has non-uniform pixels; capture checksum G.
2. **Render checkerboard**: checksum C; assert `C !== G`; assert the displayed modality/date/dimensions match the expected values from the fixtures (only those three fields shown; assert no other tags in DOM text).
3. **Window/level**: change window width/center via the labeled sliders (keyboard: focus + arrow keys); canvas checksum changes. **Reset**: checksum returns to the original.
4. **Resize**: change container/viewport size (`page.setViewportSize` or resize the panel); assert canvas dimensions change and the image remains non-empty and fitted.
5. **Corrupt recovery**: select corrupt study -> visible error message (`role="alert"`), worklist still interactive; then select a valid study -> renders without page reload (same page, no navigation event).
6. **Fit/Reset buttons** are keyboard reachable (Tab + Enter).

## Acceptance criteria
- [ ] Test runs headless with one command (`npm run test:e2e`) from a clean DB.
- [ ] Fails if the viewer is replaced with a static image (checksum must respond to window/level).
- [ ] No fixed `waitForTimeout`; wait on state flags or visible elements.
