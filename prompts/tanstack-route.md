---
description: Scaffold a production-ready TanStack Router route with mandatory head() SEO metadata, loader prefetching, and MVC separation
argument-hint: "<route-path>"
---

Scaffold a complete, production-ready TanStack Router route file for route path: `${1:-/<locale>/example/$id}`.

Ensure the generated route follows all Vite SPA and TanStack architecture standards:

1. **Route Definition**:
   - Use `createFileRoute('${1:-/<locale>/example/$id}')`.
   - If search parameters are required, provide a typed `validateSearch` schema.

2. **Mandatory `head()` Metadata Contract**:
   - Explicitly define `head: ({ params, loaderData }) => ({ ... })`.
   - Include `title`, `meta: [{ name: 'description', content: ... }, { property: 'og:title', content: ... }, { property: 'og:description', content: ... }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }]`.
   - Include canonical link in `links: [{ rel: 'canonical', href: ... }]`.

3. **Loader-Based Data Prefetching**:
   - Implement `loader: async ({ context, params }) => ...`.
   - Utilize TanStack Query `queryClient.ensureQueryData(...)` rather than `useEffect` fetching.

4. **Strict MVC Dumb View**:
   - Keep the route view component dumb and presentational.
   - Extract state or complex transformations to a companion custom hook.
   - Use standardized Liquid Glass surfaces (`GlassCard`, `GlassButton`) with heading-first typography.
   - Wrap user-facing strings in translation functions (`t('...')`).
