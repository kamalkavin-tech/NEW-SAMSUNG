# Samsung TV App - Focused Menu/Player Issues Solution

Date: 2026-04-29
Project: NEW-SAMSUNG (Tizen TV Web App)
Purpose: Focused implementation-ready solution document for the latest five QA issues only.
Status: Implemented on 2026-04-29 (code updates applied and diagnostics clean).

## 1. Scope

This document covers only the following issues:
1. Menu UP/DOWN navigation not proper when one subcategory is open.
2. Focus for streaming/selected channel in menu not proper (partially fixed).
3. Playback Error popup shown, but channel does not auto-resume after stream restore.
4. Scrollbar still visible in menu under subcategory.
5. Channel number input UI should be narrower and outer layer removed.

## 2. Constraints (Must Preserve)

- Do not change app navigation flow.
- Do not change remote key model (UP, DOWN, LEFT, RIGHT, ENTER, BACK).
- Do not redesign the app format or theme.
- Restrict changes to bug-level logic and scoped style fixes only.

## 3. Issue-by-Issue Solutions

### 3.1 Issue F1 - Menu UP/DOWN Navigation with One Subcategory Open

Problem:
- With one subcategory expanded, UP/DOWN should move only inside that opened subcategory.
- Current behavior sometimes jumps outside the opened scope.

Likely Root Cause:
- Navigation logic alternates between scoped list and flattened global list.
- Focus index source becomes inconsistent during expanded state updates.

Proposed Solution:
1. Introduce explicit mode: `single-open-subcategory`.
2. In this mode, build navigation list from only the opened subcategory channels.
3. Clamp UP/DOWN index within scoped list boundaries.
4. Exit scoped mode only when subcategory collapses.

Expected Files:
- js/player.js

Acceptance Criteria:
- With exactly one subcategory open, UP/DOWN remains strictly within that list.
- After closing subcategory, global navigation behavior remains unchanged.

QA Test:
- Open player menu.
- Expand one subcategory with multiple channels.
- Hold DOWN and then UP.
- Confirm focus never leaves opened subcategory while it remains open.

### 3.2 Issue F2 - Focus for Streaming/Selected Channel in Menu Not Proper

Problem:
- On menu open, focus is not consistently on the currently streaming channel or latest selected channel.

Current Status:
- Partially fixed.

Likely Root Cause:
- Restore sequence has race between saved focus state and playback-sync highlight logic.
- Secondary sync pass can override initial restore.

Proposed Solution:
1. Set deterministic focus priority on menu open:
- Priority 1: currently streaming channel (if visible).
- Priority 2: last selected channel in current scope.
- Priority 3: saved category/channel fallback.
2. Run restore once per menu-open cycle with guard token.
3. If target channel is in collapsed category, auto-expand only that category.

Expected Files:
- js/player.js

Acceptance Criteria:
- Menu focus lands on streaming channel when it is present in visible scope.
- No delayed jump to unrelated channel after menu opens.

QA Test:
- Start playback on known channel.
- Close and reopen menu repeatedly.
- Confirm focus stays on same streaming channel.

### 3.3 Issue F3 - Playback Error Popup Appears but No Auto-Resume

Problem:
- Playback Error popup appears correctly, but stream does not always auto-resume after network/stream restoration.
- User still has to click Try Again.
- Sometimes loading takes long, then Playback Error reappears and remains blocked.

Likely Root Cause:
- Retry path still depends on stale popup/timer/flag state.
- In-progress retry lock may not reset across all terminal paths.

Proposed Solution:
1. Trigger one controlled retry on `offline -> online` and stream-restored callback.
2. Reset and re-arm load timers before each auto-retry.
3. Reset retry state on:
- playback started,
- retry failed,
- new disconnect.
4. Keep popup until first confirmed playback frame, then auto-hide.
5. Use bounded retry policy (example: max 2 retries in 15 seconds).

Expected Files:
- js/player.js

Acceptance Criteria:
- After restore, playback resumes automatically without Try Again in normal recovery.
- Popup does not remain stuck when playback is healthy.

QA Test:
- Play a channel.
- Disconnect internet for 3 to 8 seconds.
- Reconnect.
- Confirm automatic resume in retry window.

### 3.4 Issue F4 - Scrollbar Visible in Menu Subcategory

Problem:
- Scrollbar is still visible in the menu subcategory list.

Likely Root Cause:
- Existing hide rules are applied to wrong element or overridden by higher-specificity selectors.

Proposed Solution:
1. Target actual runtime scrolling element used by expanded subcategory list.
2. Apply scoped hide rules directly:
- `::-webkit-scrollbar { display: none; }`
- `scrollbar-width: none;`
- `-ms-overflow-style: none;`
3. Keep overflow enabled so key-based scrolling still works.
4. Avoid global CSS changes to prevent side effects.

Expected Files:
- css/pages/player.css
- js/player.js (only if class toggle for scoped selector is required)

Acceptance Criteria:
- No visible scrollbar under expanded subcategory.
- UP/DOWN key scrolling remains fully functional.

QA Test:
- Open menu and expand a long subcategory.
- Scroll continuously.
- Confirm scrollbar track/thumb is not visible.

### 3.5 Issue F5 - Channel Number Input UI Width and Outer Layer

Problem:
- Channel number overlay is too wide.
- Outer visual layer/frame should be removed.

Likely Root Cause:
- Width and wrapper styling are tuned for large framed layout.
- Redundant outer container style remains active.

Proposed Solution:
1. Reduce overlay width to compact TV-safe size.
2. Remove outer visual layer/frame and keep a single clean input surface.
3. Preserve existing numeric input behavior and timeout.
4. Keep readability from normal viewing distance.

Expected Files:
- css/pages/player.css

Acceptance Criteria:
- Narrower channel number input box.
- No outer frame/double-layer effect.
- Numeric input remains clear and operational.

QA Test:
- During playback, press numeric keys.
- Confirm compact single-layer UI appears and receives input.

## 4. Recommended Implementation Order

1. F3 - Auto-resume reliability
2. F1 - Scoped UP/DOWN inside one opened subcategory
3. F2 - Streaming/selected channel focus restore
4. F4 - Subcategory scrollbar hide
5. F5 - Channel number input visual cleanup

## 5. Final Approval Gate

Start implementation only after approval of this focused document.

Approval checklist:
- Scope is correct (only five issues).
- Root causes and proposed fixes are acceptable.
- Files-to-update list is acceptable.
- QA acceptance criteria match expected behavior.

## 6. Implementation TODO and Status

1. [x] F3 - Stabilize auto-resume retry flow.
- Result: Added bounded auto-retry window (max 2 retries in 15 seconds), retry lock reset paths, and auto-hide popup on confirmed playback recovery.

2. [x] F1 - Constrain UP/DOWN when one subcategory is open.
- Result: When exactly one category is expanded, UP/DOWN now navigates only within that category list.

3. [x] F2 - Fix menu focus for current streaming/selected channel.
- Result: Added one-time focus enforcement per sidebar open cycle to land on currently playing channel after deferred renders.

4. [x] F4 - Remove visible scrollbar in menu subcategory.
- Result: Applied strict scoped scrollbar-hide rules for runtime sidebar/subcategory containers without changing scroll behavior.

5. [x] F5 - Reduce channel number UI width and remove outer layer.
- Result: Removed outer numpad visual frame and set a compact single-layer numeric field style.

6. [x] Diagnostics on touched files.
- Result: No errors in js/player.js and css/pages/player.css.

## 7. Files Updated

- js/player.js
- css/pages/player.css
