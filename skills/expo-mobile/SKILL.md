---
name: expo-mobile
description: React Native and Expo Router mobile engineering standards, native performance optimizations, offline-first data synchronization, and iOS-native UX patterns. Use when developing mobile apps, troubleshooting React Native rendering, or implementing mobile-first components.
license: MIT
---

# Expo & React Native Mobile Engineering Skill

This skill guides Pi on architectural best practices, high-performance rendering, offline synchronization, and iOS-native design patterns for **Expo** and **React Native** applications.

---

## 1. Expo Router Architecture

1. **File-Based Routing**:
   - Organize routes using Expo Router conventions under `app/`:
     - `app/(tabs)/` for tab-based root navigators.
     - `app/(modals)/` for presentation sheets.
     - `app/_layout.tsx` for context providers and navigation shells.
2. **Safe Area & Platform Alignment**:
   - Always wrap screens with `<SafeAreaView edges={['top', 'bottom']}>` from `react-native-safe-area-context`.
   - Use dynamic insets instead of hardcoded padding to support various device notches and Dynamic Islands.

---

## 2. Native Performance & Frame Rate (60/120 FPS)

To prevent UI stutter and maintain smooth 60/120 FPS performance:

### The UI Thread Invariant

- **Reanimated Worklets**: Execute all animations and gestures on the UI thread using `react-native-reanimated` (`useAnimatedStyle`, `withSpring`, `withTiming`).
- **Gesture Handler**: Pair with `react-native-gesture-handler` for fluid swipes and bottom sheets.
- **Never** perform expensive calculations or JSON parsing inside animation frames.

### Virtualized Lists

- Prefer `@shopify/flash-list` over standard `FlatList` for long lists.
- If using `FlatList`:
  - Provide `getItemLayout` when item heights are fixed.
  - Keep `windowSize` conservative (5 to 10).
  - Use stable item keys (`keyExtractor`).
  - Memoize item render components with `React.memo` and pass callbacks wrapped in `useCallback`.

```typescript
// ✅ Good: Stable render item component
const RenderItem = React.memo(({ item, onSelect }: ItemProps) => (
  <GlassCard onPress={() => onSelect(item.id)}>
    <Text>{item.title}</Text>
  </GlassCard>
));
```

---

## 3. Offline-First Architecture & Data Sync

1. **Local State as Primary**:
   - Mirror remote state into high-performance local storage (e.g. MMKV or Onyx key-value store).
   - Read from local cache first on mount; reconcile with remote network responses in the background.
2. **Optimistic Updates**:
   - Mutate local state immediately upon user action.
   - Queue network mutation requests; revert to previous state and notify user if the request ultimately fails.
3. **Graceful Degradation & Skeleton Views**:
   - Never render a blocking full-screen loading spinner.
   - Render shimmering skeleton placeholders matching the exact card dimensions when data is loading or offline.

---

## 4. "Liquid Glass" iOS Design Aesthetics

Implement a tactile, native iOS aesthetic:

- **Translucency & Blur**: Use `expo-blur` (`<BlurView intensity={40} tint="systemThinMaterial">`) for floating headers, navigation bars, and cards.
- **Subtle Specular Borders**: Apply `borderWidth: 1` with a semi-transparent border (e.g., `rgba(255, 255, 255, 0.12)`) and corner radii between `16px` and `24px`.
- **Haptic Feedback**: Trigger `expo-haptics` (`Haptics.selectionAsync()` or `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`) on interactive touch points.
- **Dark Mode Native Tokens**: Consume dark and light mode color tokens from the shared design package without hardcoding hex values into views.

---

## 5. Coding & Testing Standards

- **Strict MVC Separation**:
  - Views (`.tsx`) must be "dumb" presentational components.
  - Business logic, offline sync, and data transformations live in custom hooks (e.g. `useProfileData`, `useChartCalculations`).
- **TDD Requirement**:
  - Write unit tests for custom hooks and rendering logic before merging.
  - Mock native modules (`expo-haptics`, `expo-blur`, MMKV) cleanly in Jest setup.
- **Zero Raw Console Logs**:
  - Strictly no `console.log` or `console.error` in production.
  - Use the project's centralized diagnostic logger (`platformLog`).
- **File Length Limit**: Keep every file strictly under 800 lines.
