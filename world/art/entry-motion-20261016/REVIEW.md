# Loading-driven entrance — local review, 2026-10-16

Nothing published. The form and desktop avatar slide towards opposite screen edges. The real-world camera moves from the actual globe view to the actual dock follow-camera endpoint. Real character downloads, world code, scene creation and first paints supply monotonic loading stages. There is a minimum visible flight even when assets are cached; stalled work never fabricates progress.

Early clicks now await the lazy preview and its first painted aerial frame. DOMRect getter values are explicitly copied before calculating the sliding viewport; otherwise real browser rectangles lost their width and height and invalidated the preview. The studio viewport remains full size and is clipped separately as it leaves. The real world yields its frame loop after its initial paints until the preview is disposed, then resumes. Input is released at handoff; failures restore the same editable menu. Reduced-motion and hidden-page paths remain supported.

## Evidence

- `flight-contact-sheet.jpg` and retained `flight-*.png`: actual intermediate browser screenshots, including sideways exit and approaching the avatar.
- `actual-frame-trace.json`: 36 actual rendered desktop camera frames. Progress starts near zero, remains monotonic and reaches 1; the menu ends offscreen; preview context/overlay are removed. The final approach's maximum observed frame gap was 66.8 ms.
- `phone-early-click-check.json`: sign-in pressed while scene status was still unready, at 390×844. Avatar preview was hidden. The resulting actual camera trace contains 26 frames, reaches arrival, and leaves no horizontal overflow.
- `phone-after-movement.png`: held W after arrival advanced the walking objective from 0/25 to 1/25, confirming controls returned. No captured console errors.

The desktop trace includes a 2266.7 ms hold during synchronous scene setup, plus initial real-render work. This is a loading hold, not a claim of uninterrupted animation or a universal performance benchmark. The later camera steps are capped so expensive work does not cause a sudden leap afterwards. Browser screenshots themselves add overhead. Physical mobile devices and headsets were not checked.

534/534 full tests, strict TypeScript/Vite build and diff check pass. Tests exercise actual controller/App/World methods, lazy import/paint races, cached progress, DOMRect getters, cancellation, hidden/reduced motion, render handoff and resource ownership.
