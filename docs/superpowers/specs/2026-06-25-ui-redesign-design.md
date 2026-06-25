# UI  Redesign Design Spec

> **Date:** 2026-06-25
> **Project:** 点冰童装库存管理系统
> **Version:** 1.0

## Overview

对点冰童装库存管理系统进行 UI 优化，保留 Neubrutalism 风格的基础上，使其更加柔和精致，提升用户体验和品牌调性。

## Design Philosophy

- 保留 Neubrutalism 的结构感和清晰度
- 通过柔和的颜色和圆润的边角降低攻击性
- 更适合童装品牌，传递温暖亲切感

---

## Part 1: Design System Foundation

### Color Palette

| Role | Current | New | Notes |
|------|---------|-----|-------|
| Primary | `#FF6B7A` (Coral) | `#FF8FAB` (Soft Pink) | Main brand color |
| Primary Hover | `#FF5B6A` | `#FF7096` | Hover state |
| Accent Blue | `#4A90E2` | `#60A5FA` | Softer blue |
| Success | `#22C55E` | `#4ADE80` | Soft green |
| Warning | `#F59E0B` | `#FBBF24` | Warm yellow |
| Error | `#EF4444` | `#F87171` | Soft red |
| Border | `#000000` | `#4B5563` | Dark gray instead of pure black |
| Background | `#FFFFFF` | `#FFFBFC` | Slight pink tint |
| Card Background | `#F9FAFB` | `#FFF5F7` | Light pink tint |

### Spacing System

| Property | Current | New | Usage |
|----------|---------|-----|-------|
| Border Radius | 12px | 16px | Cards, buttons |
| Large Radius | 16px | 20px | Modals, panels |
| Border Width | 3px | 2px | Softer borders |
| Shadow | `3px 3px 0px #000` | `4px 4px 12px rgba(0,0,0,0.08)` | Soft shadow |

### Typography

- Font: System font stack (unchanged)
- Font weights: 400/500/600/700/800 (unchanged)
- Heading color: `#1F2937` (dark gray)

---

## Part 2: Component Specifications

### Button Component

```
State       Border      Background    Text       Shadow
────────────────────────────────────────────────────────
Default(P)  2px gray   Soft Pink     Dark Gray  4px 4px 12px
Default(S)  2px gray   White         Dark Gray  4px 4px 12px
Hover       2px gray   +5% darker    Dark Gray  6px 6px 16px
Active      2px gray   +10% darker   Dark Gray  2px 2px 6px
Disabled    2px gray   Light Gray    Gray       None
```

- Primary button size: 160px × 48px
- Border radius: 16px
- Icon gap: 8px

### Card Component

| Property | Current | New |
|----------|---------|-----|
| Border | 3px solid black | 2px solid #4B5563 |
| Radius | 12px | 16px |
| Shadow | Hard edge | Soft shadow |
| Background | White | #FFF5F7 |
| Hover | None | scale(1.02) + shadow enhanced |
| Padding | 16px | 20px |

### Icon System

- Library: Lucide React
- Stroke width: 2px (uniform)
- Size hierarchy: 12px / 16px / 20px / 24px / 32px
- Color: Inherit from text color
- Gap with text: 8px

### Input Component

| Property | Current | New |
|----------|---------|-----|
| Border | 3px solid black | 2px solid #4B5563 |
| Radius | 12px | 16px |
| Background | White | #FFF5F7 |
| Focus | Pink border | Pink border + soft glow |

---

## Part 3: Page Specifications

### 3.1 Homepage (Dashboard)

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────┐
│  Status Bar                                            │
│  [👋 Welcome] [🏠 Title] [🔔]                         │
├─────────────────────────────────────────────────────────┤
│  Stats Cards (2x2 Grid)                                │
│  ┌────────────────┐  ┌────────────────┐              │
│  │ 🌟 Sales      │  │ 📦 Orders      │              │
│  │ ¥12,580       │  │ 32             │              │
│  │ ↑12% vs Yesterday                                  │              │
│  │ [Pink gradient bg]                                 │              │
│  └────────────────┘  └────────────────┘              │
├─────────────────────────────────────────────────────────┤
│  Quick Actions (4 columns)                             │
│  [📸 Photo] [🎬 Video] [📊 Import] [⚙️ Settings]    │
├─────────────────────────────────────────────────────────┤
│  Hot Products (3 columns)                              │
│  [Product cards with pink accent border]               │
└─────────────────────────────────────────────────────────┘
```

**Changes:**
- Stats cards: Add pink-to-white gradient background `linear-gradient(135deg, #FFF5F7 0%, #FFF0F3 100%)`
- Stats cards: Icon 24px, matching card accent color
- Quick actions: More rounded (16px radius), icon above text
- Hot products: Pink border accent, hover scale effect
- Global spacing: Increase from 16px to 20px

### 3.2 Photo Generation Page

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  [←Back] 📸 Photo Generation                           │
├─────────────────────────────────────────────────────────┤
│  [Info card with pink border]                          │
├─────────────────────────────────────────────────────────┤
│  [Upload area: 2px gray border, 16px radius, soft shadow, pink bg]
├─────────────────────────────────────────────────────────┤
│  Model Selection [👧 Selected] [👧] [👧]              │
├─────────────────────────────────────────────────────────┤
│  [✨ One-Click Generate] (Pink gradient, 160×48px)   │
└─────────────────────────────────────────────────────────┘
```

**Changes:**
- Page title: Add icon `📸`
- Info card: Pink border, light pink background
- Upload area: 2px gray border, 16px radius, soft shadow
- Model selection: Selected state with pink border + soft shadow
- Primary button: Pink gradient, gray border, soft shadow
- Size: 160px × 48px

### 3.3 Video Generation Page

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  [←Back] 🎬 Video Generation                           │
├─────────────────────────────────────────────────────────┤
│  [Info card with pink border]                          │
├─────────────────────────────────────────────────────────┤
│  [Photo preview area]                                 │
├─────────────────────────────────────────────────────────┤
│  Prompt Section [👁️ Preview] [✏️ Edit]               │
├─────────────────────────────────────────────────────────┤
│  [✨ Generate Video] (Pink gradient, 160×48px)        │
├─────────────────────────────────────────────────────────┤
│  Progress bar [███████░░░] 45% (Pink fill)           │
└─────────────────────────────────────────────────────────┘
```

**Changes:**
- Page title: Add icon `🎬`
- Prompt section: Prominent display with preview/edit buttons
- Progress bar: Pink fill, smooth animation
- Success message: Pink border + green checkmark icon

### 3.4 Products Page

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  👗 Products (156 items) [🔍 Search...]               │
├─────────────────────────────────────────────────────────┤
│  [Filters] [Sort dropdown]                            │
├─────────────────────────────────────────────────────────┤
│  Product Grid (3 columns)                             │
│  ┌────────┐ ┌────────┐ ┌────────┐                     │
│  │ [img]  │ │ [img]  │ │ [img]  │                    │
│  │ Name   │ │ Name   │ │ Name   │                    │
│  │ ¥128   │ │ ¥98    │ │ ¥158   │                    │
│  │[Badge] │ │[Badge] │ │        │                    │
│  └────────┘ └────────┘ └────────┘                    │
└─────────────────────────────────────────────────────────┘
```

**Changes:**
- Search box: 2px gray border, 16px radius, pink focus glow
- Filter tags: Selected = pink bg + white text
- Product cards: 2px gray border, 16px radius, hover scale(1.02)
- Badge pills: Rounded pill shape, soft gradient
- Empty state: Pink icon + friendly message

### 3.5 Login Page

**Layout:**
```
┌─────────────────────────────────────────────────────────┐
│                    👗 点冰童装                          │
│                  库存管理系统                          │
│                                                         │
│         ┌─────────────────────────────────┐           │
│         │  📱 Phone Number                 │           │
│         └─────────────────────────────────┘           │
│         ┌─────────────────────────────────┐           │
│         │  🔒 Password                    │           │
│         └─────────────────────────────────┘           │
│         ┌─────────────────────────────────┐           │
│         │        [ 登 录 ]               │           │
│         │  (Pink gradient, 160×48px)    │           │
│         └─────────────────────────────────┘           │
│                    还没有账号？[注册]                    │
└─────────────────────────────────────────────────────────┘
```

**Changes:**
- Logo: Add brand icon `👗`
- Input fields: 2px gray border, 16px radius, soft shadow, icon prefix
- Primary button: Pink gradient, gray border, soft shadow
- Link text: Pink highlight color

---

## Implementation Notes

### Files to Modify

1. **Global CSS/Tailwind Config**
   - Add new color palette to `tailwind.config.ts`
   - Update default border radius
   - Add new shadow utilities

2. **UI Components**
   - `src/components/ui/button.tsx` - Update variants
   - `src/components/ui/card.tsx` - Add hover effects
   - `src/components/ui/input.tsx` - Update styles
   - `src/components/page-wrapper.tsx` - Global spacing

3. **Pages**
   - `src/app/page.tsx` - Dashboard redesign
   - `src/app/operations/photo-gen/page.tsx` - Photo gen redesign
   - `src/app/operations/video-gen/page.tsx` - Video gen redesign
   - `src/app/products/page.tsx` - Products page redesign
   - `src/app/login/page.tsx` - Login page redesign

### Migration Strategy

1. Start with global design tokens (colors, shadows)
2. Update base components (button, card, input)
3. Roll out to pages in priority order: Dashboard > Photo Gen > Video Gen > Products > Login

---

## Success Criteria

- [ ] All pages use consistent color palette
- [ ] Border radius unified to 16px (large) / 12px (small)
- [ ] Borders changed from 3px black to 2px gray
- [ ] Shadows changed from hard edge to soft shadow
- [ ] Primary buttons have pink gradient background
- [ ] Cards have soft hover effects
- [ ] Icons have consistent 2px stroke width
- [ ] Global spacing increased for better readability
