# Product story, visual system, and interaction specification

## One story for the website and private workspace

`vivekpanchagnula.com` is Vivek's public identity and the entry to his private workspace. The public site explains the person and work. “Open workspace” leads to shared sign-in and then the Hub. Hub presents Finance, Travel, and Media as tools within that workspace. Each tool retains its domain vocabulary and one visible way back to Hub. Public content must never require authentication or loading/decrypting financial records.

The public site and workspace share typography, theme, navigation geometry, field/action treatment, and interaction quality. They need different information density, not separate design languages. Public navigation uses Home / Work / About and a Workspace action; private navigation uses Hub / current tool / account. Keep `/secrets` as a small Work demo while it has active value, implemented locally in the browser; remove its historical backend machinery.

## Visual direction

Use a quiet tinted canvas with restrained gradients, a softly translucent persistent header, subtle highlights, fluid spacing, and clean rounded content panels. Glass belongs primarily in chrome, menus, sheets, and overlays. Dense data, forms, reviews, itinerary content, and charts sit on stable readable surfaces. Avoid stacking several translucent layers or animating expensive full-screen blur.

This deliberately updates the older paper-only styling in `docs/DESIGN_GUIDE.md`. Preserve its financial semantics and accessible numeric alternatives. The final design needs reference screenshots approved through the owner's ordinary review, not a new permission gate before useful implementation.

| Primitive | Target contract | Existing starting point |
| --- | --- | --- |
| Theme | One System/Light/Dark preference, applied before first paint and synchronized across routes/tabs; migrate old per-app keys once. | `packages/ui/tokens.css`, `theme-preference.ts`, browser `theme.mjs` |
| Canvas | Calm hue, sparse gradient, solid fallback. No decorative animation behind task content. | Shared semantic color tokens |
| Glass | Semantic glass/background/border/elevation tokens; legible in light and dark; opaque reduced-transparency fallback. | Tokens and shared controls |
| Type | Consistent heading/body/meta roles, readable 16px form text on phones, tabular numeric data where useful. | Shared typography variables |
| Space | 4/8px primitives; 16/24/32px section rhythm; fluid page gutters and bounded reading width. | Shared spacing variables |
| Radius | Small fields, medium cards, larger sheets; roughly 12/16/24px, consistently applied. | Existing radius tokens |
| Actions | One primary per task, secondary alternative, quiet contextual action, deliberate destructive confirmation. | `ui-button`, controls CSS |
| Motion | State continuity about 120–220ms, reduced-motion fallback, no saving-induced layout jumps. | Existing motion media queries |
| Navigation | Compact labeled Hub control, current app identity, app-local nav, one account control. | Current shells to consolidate |
| Feedback | Local error with recovery and retained values; toast supplements rather than replaces it. | Existing toast/field components |

## Field and form rules

- [ ] Labels remain visible with entered values; placeholders only give examples.
- [ ] Fields have a visible boundary and clear hover/focus/error/disabled states in both themes.
- [ ] Mark required inputs consistently; optional metadata starts collapsed when it is not part of the user's immediate task.
- [ ] Explain unusual inputs near the field: local flight timezone, PTO legacy allocation, provider identity. Remove repeated obvious instructions.
- [ ] Opening a form moves focus to its heading or first useful input; Cancel restores the opener.
- [ ] Enter saves only the active editor. Buttons inside forms declare type explicitly.
- [ ] Save shows pending state and prevents duplicates; failure keeps all entered values and points to the field or action to fix.
- [ ] A route change follows one documented draft/dirty-state policy. Back navigation, Hub navigation, and session expiry must not discard edits silently.
- [ ] Mobile keyboard never covers the active field or only Save/Cancel controls.

## Navigation contract

Hub is a small icon-plus-label anchor near the app identity in a persistent header. Visual size may be compact while the hit area is approximately 44px. It must be present on long pages, deep routes, loading/error states, and narrow layouts, without opening More or account menus. App wordmarks return to app home. Hub goes to canonical `/hub`; it is not the app home, public homepage, or a browser Back command.

During a blocking modal, keep the Hub position recognizable in background chrome; keyboard focus correctly remains in the modal until canceled/saved. Do not make navigation punch through an active destructive confirmation. Nonblocking editors retain or guard drafts through Hub navigation. Test these distinctions explicitly.

## Screen-level redesign checklist

- [ ] Public Home/Work/About: one coherent personal story, clear Workspace entry, stable headings/meta, readable project detail, no stale service descriptions.
- [ ] Sign-in/setup/unlock: shared identity flow with compact fields; vault unlock remains Finance-specific and recovery limits remain understandable.
- [ ] Hub: three recognizable app entry surfaces, one Open action each, concise summary/deep link, independent loading/empty/failure states.
- [ ] Finance: retain dense useful facts, give page/section/action hierarchy, reduce competing nav and onboarding surfaces, preserve financial source dates and assumptions.
- [ ] Travel home: distinguish current/upcoming/past with a single New trip primary action; empty state explains the first useful step.
- [ ] New trip: dates → destination(s) → optional title/details; clear date range and city boundary controls; no duplicate title impression.
- [ ] Trip detail: itinerary content first, date-specific activity add on demand, one Add transport flow, optional secondary modules; maps support the itinerary.
- [ ] PTO: current balance and projection first, editable per-day selection beside trip impact, policy details secondary.
- [ ] Media Now: actual active items and relevant next episodes; followed artists have a separate compact relationship summary if needed.
- [ ] Media Library: consistent item primitive and sorting, optional saved-music expansion, no catalog results masquerading as saved entries.
- [ ] Media Search: query/type controls, disambiguated result identity, visible partial failure, direct Add/Follow and Saved state.
- [ ] Artist: personal photo and following/rating, saved music, explicit Browse discography; do not pre-expand everything.
- [ ] TV detail: personal status, production badge, caught-up action, season selection, episode progress with scope and undo.

## Responsive and accessible acceptance

- [ ] Test 320, 390, 768, 1280, and 1440px widths; short landscape height; 200% zoom; long names and large values.
- [ ] No horizontal document overflow; deliberate internal table scrolling has a visible affordance and keyboard access.
- [ ] Text contrast target at least 4.5:1 for normal text, 3:1 for large text; control boundaries/focus meet non-text contrast requirements.
- [ ] Test actual composited glass backgrounds, not just opaque token pairs.
- [ ] Semantic status includes text/icon, never color alone. Dates, charts, and map content have readable alternatives.
- [ ] Reduced motion, reduced transparency, forced colors, keyboard-only use, screen-reader landmarks, and focus restoration all remain usable.
- [ ] A source audit is followed by screenshot and interaction evidence. “Beautiful” is not considered verified by CSS changes alone.

## Implementation boundaries

The top-down target is the [single application architecture](14-top-down-refactor.md). Shared UI stays generic; Finance money rules, Travel PTO, and Media membership remain in their app folders. Do not build a schema-driven form framework, runtime theme editor, universal page renderer, microfrontend loader, or second component library. Implement the few concrete primitives used by these journeys and delete parallel implementations as their consumers migrate.
