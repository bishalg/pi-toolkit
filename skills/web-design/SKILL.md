---
name: web-design
description: Next.js (App Router, Server Components SSR), Vite, strict MVC architecture, Liquid Glass aesthetic, and responsive web performance standards. Use when designing web frontends, building glassmorphic UI components, or optimizing web accessibility and SEO.
license: MIT
---

# Web Design & Modern Frontend Engineering Skill

This skill guides Pi on best practices for building responsive, performant, and visually stunning web applications using **Next.js (App Router with React Server Components)** and **Vite**, adhering to strict MVC and the **Liquid Glass** aesthetic.

---

## 1. Next.js App Router & Server Components (SSR)

1. **Server Components by Default**:
   - Keep page components, layout containers, and data-fetching views as React Server Components (RSC) to minimize client-side JavaScript bundle size.
   - Fetch data directly in Server Components using native `fetch` with Next.js cache tags or server-side database adapters.
2. **Client Component Islands (`'use client'`)**:
   - Restrict `'use client'` to leaf components requiring user interactions, browser event listeners, React state (`useState`, `useReducer`), or animation libraries.
   - Push client boundaries as far down the component tree as possible.
3. **Server Actions for Mutations**:
   - Use Server Actions (`'use server'`) for form submissions and mutations, accompanied by optimistic UI updates on the client.

---

## 2. Strict MVC Architectural Pattern

- **View Layer**:
  - Dumb presentational components (`.tsx`).
  - Contains strictly layout and rendering markup.
  - Zero embedded database queries, external API calls, or complex domain mathematics.
- **Model / Controller Layer**:
  - Domain logic, calculations, and data fetching reside exclusively in custom hooks, server actions, or domain service modules.
  - Wrap third-party and native calculations in error boundaries.

---

## 3. "Liquid Glass" Visual Aesthetic & Design Tokens

Implement modern, premium interfaces that wow users:

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
- **Standardized Elements**:
  - `GlassCard`: Layered container with subtle gradient reflections and specular edge highlight.
  - `GlassInput`: Floating input with soft inner glow and blurred backdrop.
  - `GlassButton`: Tactile button with micro-hover scaling (`transform: scale(1.02)`) and active state compression.
- **Design Tokens**:
  - Consume tokens from the core design language package (`packages/design-language-core`).
  - Token definitions must have zero React dependencies.

---

## 4. Accessibility & SEO Excellence

- **Lighthouse Standard**: Target Lighthouse Performance and Accessibility scores > 90.
- **Dynamic Metadata**:
  - Implement Next.js `generateMetadata` on all public routes:
    ```typescript
    export async function generateMetadata({ params }): Promise<Metadata> {
      return {
        title: `${pageTitle} | Platform`,
        description: pageSummary,
        openGraph: {
          title: pageTitle,
          description: pageSummary,
          images: [{ url: ogImageUrl, width: 1200, height: 630 }],
        },
      };
    }
    ```
- **Semantic HTML**: Use single `<h1>` per page, descriptive aria labels, proper landmark elements (`<header>`, `<main>`, `<nav>`, `<footer>`), and contrast ratios >= 4.5:1.
- **Unique Test IDs**: Ensure interactive elements have distinct `id` and `data-testid` attributes.

---

## 5. Internationalization (i18n)

- Support multi-language locales (e.g., `en`, `ne`, `hi`).
- Maintain modular locale JSON dictionaries for domain terminology.
- **Invariant**: Never hardcode user-facing strings in JSX; always wrap text in localization helper functions (e.g. `t('key')`).

---

## 6. Code Integrity & Logging Standards

- **File Limit**: Maximum 800 lines per file. Break large views into modular components.
- **Logging**: Strictly NO `console.log` or `console.error` in production. Use the centralized `platformLog` utility.
- **Mock Data**: Strictly NO mock data in production builds. Always handle loading, empty, and error states gracefully with skeleton loaders.
