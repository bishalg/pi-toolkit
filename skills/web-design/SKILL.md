---
name: web-design
description: Vite SPA & modern web architecture, strict MVC separation, Liquid Glass aesthetic, edge CDN responsive images, and web performance standards. Use when designing web frontends, building glassmorphic UI components, or optimizing web accessibility and SEO.
license: MIT
---

# Web Design & Modern Frontend Engineering Skill

This skill guides Pi on architectural best practices, responsive layouts, design token consumption, and visual design standards for modern web applications using **Vite SPAs** and the **Liquid Glass** design system.

---

## 1. Web Architecture: Vite SPA & CDN Image Primitives

1. **Vite SPA Drop-In Architecture**:
   - Modern web apps run as Vite Single Page Applications (SPAs) rather than heavy server-rendered frameworks.
   - Use `src/proxy.ts` for local development API forwarding. Do not create server-only `middleware.ts`.
2. **Edge CDN Responsive Image Primitives**:
   - **Never import `next/image`** in Vite web applications.
   - Use CDN-backed image components supporting `fill`, `priority`, and responsive `srcset`.
   - Always run image URLs through CDN optimization utilities (`getOptimizedCdnUrl`) to resize images at the edge. This eliminates client RAM thrashing, layout shift (CLS), and scroll hitching on mobile web.

---

## 2. Strict MVC Architectural Pattern & Dumb Views

- **View Layer (`.tsx`)**:
  - Views are strictly "dumb" render-only components (<500 lines ideal, 800 lines hard limit).
  - No embedded business math, inline static datasets, or direct network fetching.
  - Render layout, display state, and delegate user actions to callbacks.
- **Model / Controller Layer**:
  - Extract state, calculations, and data queries into custom hooks (`use*.ts`), state stores, or service modules.
  - Wrap third-party calculation engines and async operations in error boundaries.

---

## 3. "Liquid Glass" Aesthetic & Design Restraint

Implement a premium, tactile interface that wows users without visual clutter:

### Glassmorphism System

- **Translucency & Backdrop Blur**:
  ```css
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
  ```
- **Standardized Surface Elements**:
  - `GlassCard`: Layered container with subtle gradient reflections and specular edge highlight.
  - `GlassInput`: Floating input with soft inner glow and blurred backdrop.
  - `GlassButton`: Tactile button with micro-hover scaling (`transform: scale(1.02)`) and active state compression.
- **Design Restraint (Anti-Slop Guidelines)**:
  - **No Multi-Stop Gradients**: Avoid arbitrary chaotic gradient fills (`bg-gradient-to-*`) on cards. Use calm, standardized Liquid Glass surfaces with monochromatic contrast.
  - **Typography Hierarchy**: Headings (`<h1>`, `<h2>`) must always come first, followed by clean subtitle copy. Never place floating capsule/pill badges above main titles.
- **Design Tokens**:
  - Consume tokens from the centralized design package (`packages/design-language-core`).
  - Token definitions must have zero React dependencies.

---

## 4. Accessibility & SEO Excellence

- **Lighthouse Performance & Accessibility**: Maintain minimum score > 90 across mobile and desktop audits.
- **Semantic Structure**:
  - Single `<h1>` per page with proper heading hierarchy.
  - Use semantic landmarks (`<header>`, `<main>`, `<nav>`, `<footer>`, `<section>`).
  - Maintain color contrast ratios >= 4.5:1 for text against translucent glass backgrounds.
- **Unique Test Identifiers**: Ensure interactive buttons, forms, and cards have unique `id` and `data-testid` attributes.

---

## 5. Internationalization (i18n)

- Support multi-language locales (e.g. English, Nepali, Hindi).
- Use shared locale dictionaries for domain-specific terminology.
- **Requirement**: Never hardcode user-facing strings directly in JSX markup; all strings must be wrapped in translation functions (e.g. `t('key')`).

---

## 6. Code Integrity & Logging Standards

- **File Limit**: Maximum 800 lines per file. Split monolithic components into focused sub-components.
- **Zero Raw Console Logs**: Strictly NO `console.log` or `console.error` in production code. Use the centralized diagnostic logger (`platformLog`).
- **No Mock Data in Production**: App must handle loading, offline, and error states gracefully using shimmering skeleton cards.
