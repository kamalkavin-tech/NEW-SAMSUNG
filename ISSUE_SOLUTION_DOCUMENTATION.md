# Samsung TV App - Issue Solution Documentation

Date: 2026-04-27
Project: NEW-SAMSUNG (Tizen TV Web App)
Purpose: Provide implementation-ready solutions for unresolved QA issues.

## 1. Scope and Current Status

This document focuses only on issues reported as not fixed.

### 1.1 Legacy Issues (from earlier QA cycles)
- Legacy-2: Subscription state does not reflect immediately (still requires redirects/reopen).
- Legacy-4: After network restore, playback does not auto-resume reliably.
- Legacy-5: All Channels/menu scrolling performance and behavior issues.
- Legacy-8: Menu focus not maintained correctly on reopen/category return.

### 1.2 New Issues
- New-1: Channel logos not showing (TV Channels page, Info Bar, Menu).
- New-2: Homepage banner section appears centered with blank left/right areas.
- New-3: Homepage shows only 2 banners instead of expected 5.
- New-4: Continuous scroll stops around Janam TV; further channels inaccessible.
- New-5: With expanded sub-categories, last item does not wrap to top item.
- New-6: Duplicate error popups shown (Stream Unavailable + Playback Error), and resume still requires Try Again.

## 2. Solution Design Principles

- Use a single source of truth for channel and subscription data after payment/subscription transitions.
- Keep player error state machine deterministic (one error category shown at a time).
- Separate data refresh from UI rendering to avoid race conditions.
- Prefer cache invalidation by event (subscription changed, network restored) over long passive TTL waits.
- Implement predictable circular navigation behavior for TV remote UX.

## 3. Detailed Solutions by Issue

## 3.1 Legacy-2: Subscription Not Reflecting Immediately

Problem:
- Newly subscribed channels are not immediately playable/visible unless user repeats navigation or restarts app.

Likely Root Cause:
- Channel/subscription lists are reused from cache too aggressively after payment return.
- Refresh is triggered in some flows only (not universally when user re-enters Home/Channels/Player).

Proposed Solution:
1. Introduce a subscription-update marker in localStorage after successful payment return, e.g. `bbnl_subscription_updated_at`.
2. On first load of Home/Channels/Player, if marker exists and within a grace window (for example 10 minutes):
- Force bypass cached channel list and fetch fresh channel data.
- Rebuild sidebar/category/language derived caches.
- Clear marker only after successful fresh response is applied to UI.
3. Invalidate related cached keys atomically:
- channel list cache
- category cache
- language cache
- player-side filtered channel cache
4. Add one explicit post-payment refresh pipeline used by all pages (shared utility) to avoid partial refresh logic.

Files to Update (expected):
- js/api.js
- js/player.js
- js/channels.js
- js/home.js

Acceptance Criteria:
- Within one app reopen (or immediate return from payment), newly subscribed channels appear and play without manual retries.
- No need for multiple reopen cycles.

QA Test:
- Subscribe to a paid channel.
- Return to app.
- Verify channel appears as subscribed and playback starts on first attempt.

## 3.2 Legacy-4: Playback Does Not Auto-Resume After Network Restore

Problem:
- User must press Try Again even after connectivity is restored.

Likely Root Cause:
- Auto-resume path is gated by popup visibility and flag timing.
- Network watchdog and popup timers can become out of sync.

Proposed Solution:
1. Decouple auto-resume trigger from popup-open condition.
2. On transition `offline -> online`, if last failure category is network:
- Immediately attempt one controlled retry (with cooldown, for example 2-3 seconds).
3. Reset `playerAutoResumeInProgress` on:
- successful playback start callback,
- retry timeout completion,
- new disconnect event.
4. Cancel stale UI timers when retry starts to prevent old hide timers from conflicting with resumed playback.

Files to Update (expected):
- js/player.js

Acceptance Criteria:
- After disconnect and reconnect, channel resumes without user pressing Try Again.
- No stuck error popup after successful resume.

QA Test:
- Start playback.
- Disconnect internet for >3 seconds.
- Reconnect.
- Verify automatic resume within expected retry window.

## 3.3 Legacy-5: All Channels/Menu Scroll Performance and Stability

Problem:
- Scroll can freeze or become non-responsive in large lists.

Likely Root Cause:
- Heavy DOM reflows and large live node count.
- Progressive append logic may not guard against edge indexes or repeated rebuilds.

Proposed Solution:
1. Use consistent chunk rendering for all large lists (All Channels and expanded menu lists).
2. Add defensive index clamping in navigation handlers.
3. Add a render guard token (generation id) so outdated async renders cannot overwrite current view.
4. Avoid full container rebuild when only focus/index changed.

Files to Update (expected):
- js/channels.js
- js/player.js

Acceptance Criteria:
- Continuous down-scroll works across full channel set without freezing.
- No stop around specific channels (including Janam TV).

QA Test:
- Open All Channels.
- Hold DOWN continuously for at least 2 full list cycles.
- Verify no freeze and consistent focus movement.

## 3.4 Legacy-8: Menu Focus Not Maintained on Reopen

Problem:
- Focus shifts to unexpected category/channel instead of restoring previous selection.

Likely Root Cause:
- Focus state is partially saved but overwritten by subsequent sync calls during menu open/close.

Proposed Solution:
1. Persist focus state per language + category key:
- selected category index
- selected channel index
- expanded categories
2. On menu reopen:
- restore state before triggering playback-sync routines.
3. Prevent sync routine from forcing fallback category when valid saved state exists.

Files to Update (expected):
- js/player.js

Acceptance Criteria:
- Close and reopen menu returns to same category and channel focus.
- No jump to unrelated category (for example News) unless state invalid.

QA Test:
- Navigate to category/channel.
- Close menu and reopen.
- Verify focus remains where user left it.

## 3.5 New-1: Channel Logos Not Showing

Problem:
- Missing logos in channels page, info bar, and menu.

Likely Root Cause:
- Inconsistent logo field mapping across screens.
- URL normalization inconsistencies and fallback handling mismatch.

Proposed Solution:
1. Centralize logo URL resolution in one utility and use it in all pages.
2. Standard fallback order (same everywhere):
- chlogo
- chnllogo
- logo_url
- channel_logo
- logo
3. Keep consistent URL normalization:
- relative to API base
- prevent localhost host leaks
4. Add one retry with safe fallback placeholder; avoid repeated failing requests loops.

Files to Update (expected):
- js/api.js
- js/channels.js
- js/player.js
- js/home.js (if logos rendered there)

Acceptance Criteria:
- Logos appear consistently for the same channel across all screens.
- Missing-logo rate is minimal and only for genuinely unavailable assets.

QA Test:
- Compare same channel logo in Channels, Menu, Info Bar.
- Validate with slow network and normal network.

## 3.6 New-2 and New-3: Homepage Banner Layout and Count

Problem:
- Banner area appears centered with blank sides.
- Only 2 banners visible while expected is 5.

Likely Root Cause:
- Either API payload filtering reduces count to 2, or carousel layout constraints hide remaining banners.

Proposed Solution:
1. Validate data pipeline first:
- log and verify ads count returned from API.
- verify client-side filter is not dropping valid ads.
2. Update hero carousel rendering to support expected 5 items.
3. Adjust CSS track/container sizing:
- ensure full-width presentation,
- no fixed narrow center container unless intentionally styled.
4. Keep graceful fallback when fewer than 5 banners are returned.

Files to Update (expected):
- js/home.js
- css/pages/homepages.css

Acceptance Criteria:
- When API returns >=5, exactly 5 banners rotate/display correctly.
- No unintended blank left/right regions.

QA Test:
- Validate with known 5-banner dataset.
- Validate with 2-banner dataset (fallback still visually correct).

## 3.7 New-4: Scroll Stops Around Janam TV

Problem:
- Down-scroll halts around one channel while more channels exist.

Likely Root Cause:
- Edge-case data object causing render/navigation break.
- Index mismatch between filtered array and rendered card list.

Proposed Solution:
1. Add safe guards in list iteration:
- skip invalid channel objects without terminating loop.
2. Ensure focus navigation uses authoritative data length, not stale DOM count.
3. Add debug counters and guard logs for failed item render in development build.

Files to Update (expected):
- js/channels.js
- js/player.js

Acceptance Criteria:
- Janam TV no longer blocks movement.
- Focus proceeds to following channels.

QA Test:
- Start before Janam TV and hold DOWN.
- Confirm focus moves beyond Janam TV to next items.

## 3.8 New-5: No Wrap-Around in Expanded Sub-Category Scroll

Problem:
- At last channel in expanded set, focus remains trapped in last subsection.

Likely Root Cause:
- Wrap logic implemented at category level but not for flattened expanded-channel navigation.

Proposed Solution:
1. Build a flattened visible-navigation list of all currently expanded channels.
2. Apply circular navigation on that flattened list:
- DOWN from last -> first
- UP from first -> last
3. Re-map flattened index back to (categoryIndex, channelIndex) before focus render.

Files to Update (expected):
- js/player.js
- js/home-navigation.js (if shared navigation routines are used)

Acceptance Criteria:
- Continuous scrolling wraps correctly between top and bottom.

QA Test:
- Expand multiple categories (Kannada, Telugu, Malayalam, etc).
- Hold DOWN until end.
- Verify next DOWN lands on first visible channel.

## 3.9 New-6: Duplicate Error Popups + Missing Auto-Resume

Problem:
- Two error popups displayed for one incident.
- Stream does not resume automatically after restoration.

Likely Root Cause:
- Multiple error reporters trigger independently.
- No deduplication gate for active error category.

Proposed Solution:
1. Enforce single error surface policy:
- Only Playback Error popup should be shown for stream/network failures.
- Suppress Stream Unavailable popup in overlapping scenarios.
2. Add popup dedupe guard:
- if same category popup already open, update message instead of opening another.
3. Integrate with Legacy-4 auto-resume flow.

Files to Update (expected):
- js/player.js

Acceptance Criteria:
- Only one popup appears during stream failures.
- On restore, playback auto-resumes without Try Again.

QA Test:
- Trigger stream interruption.
- Confirm only Playback Error popup appears.
- Restore stream/network and verify automatic resume.

## 4. Current Code Status (Read-Only Audit)

Status legend:
- Likely fixed: code evidence suggests the behavior is already implemented.
- Partially fixed: some supporting logic exists, but edge cases or consistency gaps remain.
- Still unresolved: current code does not fully cover the reported behavior.

### 4.1 Status Summary

- New-1 Channel logo images not displaying: Partially fixed.
	- Shared logo fallback/normalization exists across Home, Channels, and Player, but container sizing and rendering rules still vary by page.

- New-2 Homepage banner left/right blank: Likely fixed.
	- Hero banner rendering and CSS currently support full-width presentation.

- New-3 Homepage only 2 of 5 banners showing: Likely fixed.
	- Current banner pipeline targets up to 5 items when the API provides them.

- New-4 Scroll stops at Janam TV in All Channels: Still unresolved.
	- No Janam-specific guard or recovery path is present in the active navigation flow.

- New-5 Last channel should loop back to first channel: Partially fixed.
	- Some wrap behavior exists, but expanded subcategory navigation is not fully circular in every path.

- Legacy-4 / New-6 Playback error does not auto-resume: Likely fixed, but needs device validation.
	- Auto-resume and popup dedupe logic are present, but runtime recovery should still be verified on target TV/network conditions.

- Legacy-8 / New-7 Menu focus not proper on open: Likely fixed.
	- Current player/menu code restores focus state and saved selection during reopen flows.

- New-8 Menu up/down navigation not working across all expanded channels: Partially fixed.
	- Navigation is improved, but some behavior is still context-dependent on the expanded-row state.

- New-9 Scrollbar visible inside subcategory lists: Still unresolved.
	- Global scrollbar-hiding rules still conflict with subcategory visibility requirements.

- New-10 Channel number input field UI not fixed: Likely fixed.
	- Dedicated player input styling is already present in the current code base.

- New-11 Menu focus not retained after reopen: Likely fixed.
	- Saved menu state is restored on reopen, but user-level QA confirmation is still recommended.

### 4.2 Not Fixed Items To Prioritize

- New-4 Scroll stops at Janam TV.
- New-9 Scrollbar visible inside subcategory lists.
- Black-screen behavior after unsubscribed popup/back/menu flow.

### 4.3 Items Requiring Runtime Confirmation

- Playback auto-resume after network restore.
- Menu focus restoration after close/reopen on a real TV.
- Homepage banner behavior when the live API returns fewer than 5 items.

## 5. Implementation Order (Recommended)

Phase 1 (Critical Playback):
1. Legacy-4
2. New-6
3. Legacy-2

Phase 2 (Navigation Stability):
4. New-4
5. New-5
6. Legacy-8
7. Legacy-5

Phase 3 (Visual/Data Completeness):
8. New-1
9. New-2
10. New-3

## 6. Regression Checklist

- Player launches and starts baseline channel quickly.
- Channel up/down still works with language filters.
- Subscription popup behavior remains correct for unsubscribed channels.
- Back key behavior on popup/menu remains consistent.
- Home banner auto-rotation and click-through still functional.
- No new console errors during 15-minute continuous navigation test.

## 7. Deliverables for Next Implementation Step

For each issue implementation, produce:
- code diff,
- short root-cause note,
- QA test evidence (before/after behavior),
- rollback-safe toggle/guard where applicable.

## 8. Pending Clarifications and Confirmation Matrix

The following confirmations are required before implementation begins.

### 7.1 Issue Legacy-2 (Subscription Cache Auto-Sync)

Select one strategy:
- A) Every 5 minutes in background
- B) Only when user returns to Home/Channels page
- C) On payment return plus on app launch

Recommendation:
- Preferred default: C
- Optional hardening: combine C with lightweight safety sync every 5 minutes only while app is active on Home/Channels.

### 7.2 New-3 (Homepage Banner Count)

Confirmation required:
- First verify API response count before UI changes.

Decision path:
- If API returns 5 and UI shows 2: fix client filtering/rendering/layout.
- If API returns 2: keep graceful fallback and escalate backend data issue separately.

### 7.3 New-6 (Error Popup Auto-Resume Behavior)

Select one strategy:
- A) Immediately when network is restored (no user action)
- B) After 3 seconds of stable connection
- C) Only when user presses UP to show overlay

Recommendation:
- Preferred default: B to avoid retry flapping on unstable links while keeping hands-free recovery.

### 7.4 Implementation Priority Confirmation

Proposed execution order:
- Critical: Legacy-2, Legacy-4, New-6, New-1
- High: Legacy-5, Legacy-8, New-4, New-5
- Medium: New-2, New-3

Status:
- Awaiting final confirmation before implementation.

## 9. Non-Functional Constraint (Must Follow During Fixes)

All fixes must preserve existing application flow and visual format.

Implementation guardrails:
- Do not change page navigation model, route flow, or core remote-control interaction patterns.
- Do not redesign UI layout, typography, spacing, or color system.
- Restrict changes to logic, state handling, caching behavior, rendering correctness, and bug-level style fixes only.
- Any unavoidable UI adjustment must be minimal and behavior-preserving.

If any proposed fix risks changing existing app flow or format, stop and request explicit approval before applying that change.

End of document.

---

## 10. Addendum: Settings-Only About and Terms/Service Integration Plan

Date: 2026-04-28
Objective: Add About and Terms/Service content inside the existing Settings page only, with correct alignment and no changes to other app pages/flows.

### 9.1 Requirement Interpretation

- Do not add new standalone navigation entry points on Home/Player/Channels.
- Do not change current global app flow or visual format.
- About and Terms/Service must be presented from within Settings.
- Keep remote-key behavior consistent with existing Settings UX.

### 9.2 Current Settings Baseline

- Settings already has a left sidebar and right content-panel architecture.
- Sidebar currently includes:
	- About App
	- Device Info
	- Logout
- Content panel switching is already handled by `data-section` + `switchSection(section)`.

### 9.3 Proposed Minimal Solution (No Flow Break)

1. Add two new sidebar items in Settings only:
- About Us
- Terms of Service

2. Add two new content panels in Settings content area:
- `panel-about-us`
- `panel-terms`

3. Reuse existing section switch mechanism:
- Add `data-section="about-us"` and `data-section="terms"`.
- Keep `switchSection()` behavior unchanged (works by `panel-` + section key).

4. Preserve remote navigation logic:
- No change to keymap behavior model (UP/DOWN/LEFT/RIGHT/ENTER/BACK).
- New sidebar items simply become part of existing focus order.

5. Keep alignment/form consistent:
- Use existing Settings panel container styles.
- Add only scoped CSS for legal text readability (line-height, max-width, spacing, heading levels).
- Maintain current dark theme, spacing rhythm, and focus outlines.

### 9.4 Content Strategy

- About Us content source: BBNL About page summary text.
- Terms/Service content source:
	- Primary: Terms and Conditions page.
	- Optional additional panel or subsection: Privacy Policy if required by compliance.

Content format inside Settings panels:
- Section title
- Last updated line
- Short intro paragraph
- Structured headings with bullet points/paragraphs
- Contact line (email/phone) if available

### 9.5 Files to Update (Only)

- `settings.html`
- `css/pages/settings.css`
- `js/settings.js` (only if tiny defensive updates are needed for new section defaults)

No other files/pages should be modified for this task.

### 9.6 Alignment and UX Acceptance Criteria

- New legal panels align with existing Settings content frame (same top, left, padding system).
- Text block does not overflow outside visible content container at 1920x1080.
- Vertical scroll inside settings content remains smooth and controlled.
- Sidebar focus ring/active state remains visually consistent with existing items.
- BACK key still exits Settings as currently implemented.
- Logout position and behavior remain unchanged at sidebar bottom.

### 9.7 Non-Regression Checklist for This Change

- About App panel still shows app version and update check.
- Device Info panel data still loads.
- Sidebar keyboard navigation still reaches all items in order.
- ENTER on each sidebar item activates correct panel.
- No new console/runtime errors on Settings page load.

### 9.8 Delivery Plan After Approval

Phase A:
- Implement `settings.html` sidebar + panels for About Us and Terms.

Phase B:
- Add scoped styling in `css/pages/settings.css` for legal content alignment/readability only.

Phase C:
- Do a focused sanity test for navigation/alignment and run diagnostics on touched files.

This addendum is documentation-only. Implementation starts only after explicit approval.

---

## 11. Focused Issue Pack (For Approval Before Coding)

Date: 2026-04-29
Scope: This section covers only the newly reconfirmed issues from QA. No implementation is started yet.

### 11.1 Issue-F1: Menu UP/DOWN Navigation Not Proper With One Subcategory Open

Problem:
- When one subcategory is expanded, UP/DOWN should navigate only within that opened subcategory list.
- Current behavior sometimes moves focus outside the opened subcategory or skips expected items.

Likely Root Cause:
- Navigation path mixes flattened global visible list and category-scoped list.
- Focus movement source array changes depending on expansion state and stale render references.

Proposed Solution:
1. Add explicit navigation mode when exactly one subcategory is open:
- mode key: `single-open-subcategory`.
2. In this mode, build and use only the opened subcategory channel list as the source for UP/DOWN.
3. Clamp focus index to this scoped list and do not fallback to global flattened list until the subcategory is closed.
4. Keep existing LEFT/RIGHT behavior unchanged to preserve current flow.

Files to Update (expected):
- js/player.js

Acceptance Criteria:
- With one subcategory open, holding UP/DOWN never jumps outside that opened subcategory.
- Closing the subcategory returns to existing global navigation behavior.

QA Test:
- Open menu and expand only one subcategory.
- Hold DOWN through full list and hold UP back to start.
- Confirm focus remains strictly within that opened subcategory.

### 11.2 Issue-F2: Focus for Streaming/Selected Channel in Menu Not Proper

Problem:
- Focus highlight in menu does not always land on the currently streaming channel or selected channel.

Current Status:
- Partially fixed.

Likely Root Cause:
- Saved focus state and active playback channel sync execute in different timing windows.
- Later sync step can override previously restored focus.

Proposed Solution:
1. Define priority order for menu-open focus restore:
- Priority 1: current streaming channel (if visible in active filter scope).
- Priority 2: last user-selected channel in same scope.
- Priority 3: saved category fallback.
2. Apply restore once per menu open with a guard token to prevent second override.
3. If channel exists but its category is collapsed, auto-expand only that category without changing other sections.

Files to Update (expected):
- js/player.js

Acceptance Criteria:
- On menu open, focus lands on currently playing channel whenever it is present in visible scope.
- No jump to unrelated channels after a short delay.

QA Test:
- Play a channel, close menu, reopen menu.
- Confirm focus is on that same playing channel consistently for repeated attempts.

### 11.3 Issue-F3: Playback Error Popup Shows, But Channel Does Not Auto-Resume After Stream Restore

Problem:
- Only Playback Error popup is shown (good), but after stream/network restore, playback often does not resume automatically.
- User must click Try Again.
- In some cases loading is long, then Playback Error appears and channel still does not resume.

Likely Root Cause:
- Auto-resume retry may still be gated by popup state, stale timers, or in-progress flags not reset in all failure paths.
- Retry can race with channel load timeout and leave state in blocked mode.

Proposed Solution:
1. Run a single controlled auto-retry on `offline -> online` and on stream-restored callback (idempotent gate).
2. Clear and re-arm load timeout timers before retry starts.
3. Reset retry-lock flags on all terminal events:
- playback started,
- retry failed,
- new disconnect.
4. Keep popup visible only until first confirmed playback frame, then hide automatically.
5. Add a bounded retry policy (for example max 2 retries within 15 seconds) to avoid infinite loop.

Files to Update (expected):
- js/player.js

Acceptance Criteria:
- After stream/network restore, channel resumes automatically without pressing Try Again in normal recovery cases.
- Popup does not remain stuck when playback has resumed.

QA Test:
- Start channel playback.
- Interrupt network or stream for 3 to 8 seconds.
- Restore network.
- Verify channel resumes automatically within retry window.

### 11.4 Issue-F4: Scroll Bar Still Showing in Menu Under Subcategory

Problem:
- Vertical scrollbar is still visible in menu subcategory list.

Likely Root Cause:
- Scrollbar hide rule is not targeting actual scrolling element used in menu runtime.
- Another selector with higher specificity may override existing hide rule.

Proposed Solution:
1. Identify exact scrolling container used for opened subcategory list in player menu.
2. Apply scoped scrollbar-hide rule directly on that runtime selector:
- `::-webkit-scrollbar { display: none; }`
- `scrollbar-width: none;`
- `-ms-overflow-style: none;`
3. Keep overflow behavior enabled so scrolling still works via remote keys.
4. Avoid global rule changes to prevent side effects on other pages.

Files to Update (expected):
- css/pages/player.css
- js/player.js (only if runtime class toggle is needed)

Acceptance Criteria:
- No visible scrollbar in opened subcategory section.
- UP/DOWN remote scrolling remains fully functional.

QA Test:
- Open menu, expand a subcategory with many channels.
- Scroll continuously and confirm no visible scrollbar track/thumb.

### 11.5 Issue-F5: Channel Number Input UI - Reduce Width and Remove Outer Layer

Problem:
- Channel number overlay is visually too wide.
- Outer layer/border container should be removed for cleaner look.

Observation Reference:
- QA screenshot shows large framed container behind channel number input.

Proposed Solution:
1. Reduce input overlay width to compact TV-safe size while keeping center alignment.
2. Remove outer wrapper visual layer (extra frame/background) and keep only single clean input container.
3. Preserve existing key input flow and timeout behavior.
4. Keep typography/focus/readability unchanged as much as possible.

Files to Update (expected):
- css/pages/player.css

Acceptance Criteria:
- Channel number box appears narrower and visually clean.
- No double frame/outer border layer remains.
- Numeric input remains readable and functional from normal TV viewing distance.

QA Test:
- Open player and press numeric keys.
- Verify compact single-layer channel number UI appears and accepts input.

### 11.6 Proposed Implementation Order for This Focused Pack

1. Issue-F3 (auto-resume reliability)
2. Issue-F1 (single-open-subcategory navigation)
3. Issue-F2 (streaming channel focus restore)
4. Issue-F4 (submenu scrollbar hide)
5. Issue-F5 (channel number UI width and outer layer)

### 11.7 Confirmation Required Before Coding

Please confirm this focused solution pack.
After confirmation, implementation will start with minimal, flow-safe code changes only for the above five issues.
