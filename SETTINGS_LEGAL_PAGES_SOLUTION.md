# Settings-Only Legal Pages Solution Documentation

Date: 2026-04-28
Project: NEW-SAMSUNG
Scope: Add About Us and Terms of Service only inside Settings page.

## 1. Requirement Lock

- Add About Us and Terms of Service in Settings page only.
- Do not add links/pages in Home, Player, Channels, or any other screen.
- Do not change existing app flow.
- Do not change existing app visual format except minimal alignment styles needed inside Settings content area.
- Preserve the current Settings shell, sidebar order, focus model, and BACK behavior.
- Keep all changes inside the existing Settings layout containers; do not introduce new routing or page-level transitions.

## 2. Current Settings Structure

Current Settings already has:
- Left sidebar with section buttons.
- Right content area with panel switching by section key.
- Existing remote navigation (UP, DOWN, LEFT, RIGHT, ENTER, BACK).

This allows adding new sections without changing global navigation architecture.

## 3. Proposed Settings-Only Implementation

### 3.1 Sidebar Additions (Settings)

Add two new sidebar items in Settings sidebar:
- About Us
- Terms of Service

Each item uses the same `sidebar-item focusable` pattern and `data-section` mapping:
- `data-section="about-us"`
- `data-section="terms"`

### 3.2 Content Panel Additions (Settings)

Add two new panels in Settings content container:
- `id="panel-about-us"` for About Us content
- `id="panel-terms"` for Terms of Service content

Panel behavior will reuse existing `switchSection(section)` flow so no route changes are needed.

### 3.3 Alignment and Readability (Settings CSS only)

Add minimal scoped CSS for legal text blocks:
- Proper heading spacing
- Paragraph spacing and line-height
- Content max width for readability
- Internal vertical spacing between legal sections

No redesign. Keep existing color, theme, border, and focus behavior.
- Use the current Settings content padding and section spacing as the base; only add minimal text readability rules.

## 4. Files Allowed To Change

Only these files will be edited:
- `settings.html`
- `css/pages/settings.css`
- `js/settings.js` (only if required for tiny defensive handling)

No other file changes are included in this task.

## 5. Content Plan

### 5.1 About Us

Use concise company/app information in sections:
- Company overview
- Services summary
- Infrastructure/reliability summary
- Contact information

### 5.2 Terms of Service

Use structured legal text sections:
- Acceptance of terms
- Service usage rules
- User responsibilities
- Limitations/disclaimers
- Privacy reference
- Contact and effective date

Content remains static in Settings panel (no new page navigation).

## 6. Navigation Behavior Expectations

- Sidebar DOWN/UP should include new About Us and Terms items in normal order.
- RIGHT from sidebar enters active panel content as before.
- LEFT from panel returns to sidebar as before.
- BACK key behavior remains unchanged.
- Logout remains bottom-aligned and unaffected.
- No new navigation stack, no extra overlays, and no route changes should be introduced by this work.

## 7. Acceptance Criteria

1. About Us is visible and readable inside Settings content area with proper alignment.
2. Terms of Service is visible and readable inside Settings content area with proper alignment.
3. No overflow/cutoff issues in 1920x1080 layout.
4. Existing About App and Device Info still work.
5. No changes to any page outside Settings.
6. No regressions in Settings remote navigation and logout behavior.
7. The visual structure of the Settings page remains the same, with only the legal content panels added inside the existing frame.

## 8. Non-Regression Checks

- Open Settings and switch through all sidebar items.
- Confirm each sidebar item maps to the correct panel.
- Confirm focus ring and active state remain consistent.
- Confirm BACK still exits as existing behavior.
- Confirm no new runtime errors in Settings page.

## 9. Delivery Steps After Approval

1. Update `settings.html` with two new sidebar entries and two content panels.
2. Add scoped legal-content CSS in `css/pages/settings.css` for alignment/readability.
3. Make minimal `js/settings.js` adjustment only if needed for default focus/order robustness.
4. Run targeted checks for touched files only.

This document is implementation planning only.
Code changes will start after your approval.