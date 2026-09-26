---
name: web-perf
description: Analyzes web performance, Core Web Vitals (LCP, INP, CLS), render-blocking assets, layout shifts, Lighthouse scores, and network waterfalls. Use when profiling, debugging, or optimizing frontend page speed and user experience metrics.
---

# Web Performance & Core Web Vitals Audit

Guides the agent on measuring, auditing, and optimizing web performance, Lighthouse metrics, and network asset pipelines.

---

## 1. Core Web Vitals Benchmarks

| Metric                              | Target (Good)      | Needs Work                    | Poor             | Primary Root Causes                                                      |
| :---------------------------------- | :----------------- | :---------------------------- | :--------------- | :----------------------------------------------------------------------- |
| **LCP** (Largest Contentful Paint)  | $\le 2.5\text{s}$  | $2.5\text{s} - 4.0\text{s}$   | $> 4.0\text{s}$  | Slow TTFB, unoptimized hero images, render-blocking CSS/JS.              |
| **INP** (Interaction to Next Paint) | $\le 200\text{ms}$ | $200\text{ms} - 500\text{ms}$ | $> 500\text{ms}$ | Long main-thread JS tasks, heavy React re-renders, un-debounced inputs.  |
| **CLS** (Cumulative Layout Shift)   | $\le 0.1$          | $0.1 - 0.25$                  | $> 0.25$         | Images without explicit aspect-ratio, dynamic ad slots, FOIT font swaps. |
| **FCP** (First Contentful Paint)    | $\le 1.8\text{s}$  | $1.8\text{s} - 3.0\text{s}$   | $> 3.0\text{s}$  | Server latency, DNS lookup, uncompressed HTML.                           |

---

## 2. Audit Workflow Checklist

Follow this systematic 5-phase audit:

```markdown
- [ ] Phase 1: Baseline measurement (DevTools trace or Lighthouse snapshot)
- [ ] Phase 2: LCP & Render-Blocking analysis (CSS/JS critical path)
- [ ] Phase 3: Layout Shift & CLS culprit detection (aspect ratios, webfonts)
- [ ] Phase 4: Long Tasks & INP profiling (event handlers, main thread locking)
- [ ] Phase 5: Network compression & caching headers audit
```

---

## 3. High-Impact Optimization Recipes

### A. Fixing LCP (Largest Contentful Paint)

1. **Preload Critical Hero Images**:
   ```html
   <link rel="preload" as="image" href="/hero.webp" fetchpriority="high" />
   ```
2. **Modern Image Formats**: Convert large JPEGs/PNGs to **WebP** or **AVIF**.
3. **Defer Non-Critical Scripts**:
   ```html
   <script src="/analytics.js" defer></script>
   ```

### B. Eliminating CLS (Layout Shifts)

1. **Reserve Image Dimensions**:
   Always set explicit `width`, `height`, or CSS `aspect-ratio`:
   ```css
   img.hero {
     width: 100%;
     aspect-ratio: 16 / 9;
   }
   ```
2. **Font Display Swap**:
   ```css
   @font-face {
     font-family: "CustomFont";
     src: url("/font.woff2") format("woff2");
     font-display: swap;
   }
   ```

### C. Reducing INP (Interaction Latency)

1. Break up long CPU tasks ($>50\text{ms}$) with `scheduler.yield()` or `requestAnimationFrame()`.
2. Debounce costly search inputs and event handlers.
3. Use React `useDeferredValue` or `startTransition` for non-urgent UI updates.

---

## 4. Verification & Testing

Before concluding any performance refactor:

1. Verify the production build (`npm run build`).
2. Run bundle analysis to ensure no bloated or duplicate client dependencies.
3. Test layout on mobile viewports ($375\text{px}-430\text{px}$).
