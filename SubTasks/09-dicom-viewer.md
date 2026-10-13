# 09: DICOM Viewer (Cornerstone3D)

**Goal:** A viewer component that renders real pixels and has a strictly clean lifecycle.

## Library choice
`@cornerstonejs/core` + `@cornerstonejs/dicom-image-loader` (+ `dicom-parser`). Uncompressed MONOCHROME2 single-frame only; **no extra codecs**. Do not write a parser.

## Structure
```
apps/web/src/viewer/
  cornerstoneInit.ts     one-time idempotent init (guarded promise)
  ViewerController.ts    class: load(studyId), fit(), reset(), setWindowLevel(w,c), resize(), dispose()
  DicomViewer.tsx        React wrapper (props: studyId | null)
  useViewerMetrics.ts    (test-only instrumentation hook, see 12)
```

## Requirements
- **Rendering:** fetch bytes from `/api/studies/:id/file`, create the image id via the loader (e.g. `wadouri:` + blob URL or the file URL), display through a stack viewport. Actual pixels on a canvas.
- **Controls (labeled, keyboard-usable):**
  - **Fit**: fit image to container.
  - **Reset**: restore initial window/level, zoom/pan.
  - **Window/Level**: two labeled range inputs (Window width, Window center) with numeric output; defaults come from the image/VOI range.
- **Resize:** `ResizeObserver` on the container calls `resize()` and keeps the image fitted (disconnected on dispose).
- **Metadata display (only):** modality, study date, dimensions (rows x columns). Read through the loader's metadata provider; **never render or log other tags**.
- **States:** `idle`, `loading` (visible indicator), `ready`, `error` (message from error mapping: corrupt/not DICOM, unsupported transfer syntax/photometric, network/404).
- **Late loading / switching:**
  - Each `load()` gets a monotonically increasing token; results from older tokens are discarded and their blob URLs / cached images released.
  - `AbortController` on fetch.
  - Switching studies mid-load shows only the latest study's image.
- **Disposal (`dispose()` / unmount / close):**
  - Abort in-flight fetch, invalidate token, disconnect `ResizeObserver`, remove every event listener added, destroy the rendering engine/viewport, purge cached image(s), revoke blob URLs.
  - Idempotent. After dispose, a late load result must not attach to the container nor flip state to open.
- **Close/reopen:** a "Close viewer" / "Open viewer" toggle exists on the panel so lifecycle can be exercised; repeated cycles must not accumulate handlers or instances.
- **Recovery:** after a corrupt-study error, selecting a valid study loads normally without a page reload; the worklist is unaffected (viewer errors are contained by an error boundary + state, never thrown to the app root).
- **Instrumentation** (for tests 11/12): expose on `window.__viewerDebug` (enabled only when the build-time constant `__VIEWER_DEBUG__` is true; Vite `define` sets it, Jest globals set it to `false`; avoid `import.meta` so Jest can compile the code): `{ activeInstances, activeListeners, activeObservers, currentStudyId, state }`. Counters are incremented/decremented in a single helper that registers listeners, so the count is trustworthy.

## Acceptance criteria
- [ ] gradient and checkerboard render visibly different pixels.
- [ ] Window/level changes alter the rendered pixels; Reset restores them.
- [ ] Container resize keeps the image visible and fitted.
- [ ] corrupt.dcm shows a readable error; next valid study loads.
- [ ] No console output of patient tags.

## Implementation notes (verified in a real browser)
- **Pinned `@cornerstonejs/core` and `dicom-image-loader` to 4.22.13.** The 5.x line has a different viewport API.
- **`StackViewport.setStack` swallows decode failures**, so the controller calls `imageLoader.loadAndCacheImage` first; a corrupt file then rejects and shows the error state.
- **`cache.removeImageLoadObject` needs `{ force: true }`** and is wrapped in try/catch; without it a second study load threw and silently hung.
- **The viewport is cleared at the start of every load and on error**, so a stale image can never stay visible.
- **Vite:** the loader is excluded from dep optimisation, and the codec packages are listed in `optimizeDeps.include` (nested syntax) so their UMD default exports work in dev.
- **Corrupt files** are now rejected by a `dicom-parser` pre-check before decoding, so cornerstone no longer raises an unhandled rejection for them; the browser test asserts zero page errors.
- Checkerboard is a binary image, so window/level assertions should use the gradient fixture.
