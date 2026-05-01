# Samsung TV App - Current Feedback Issues Solution

Date: 2026-04-30
Project: NEW-SAMSUNG (Tizen TV Web App)
Purpose: Solution-only document for the latest feedback issues shared after the earlier issue pack.
Scope: This file covers only the current feedback issues listed by the user. It does not repeat the earlier issue pack.

## 1. Scope

This document covers these current feedback items only:
- Point 8: Not fixed.
- Point 5: Partially fixed. Outer layer removed, but input background color/opacity is still incorrect.
- Point 6: Playback error popup appears too slowly, and channel does not auto-resume after internet restore.
- Point 7: After changing category and selecting a channel from Menu, the currently playing channel is not focused correctly in Menu when using remote up/down.
- Point 9: Default category on app launch differs by operator ID; some operators should open with Subscribed, others with All Channels.
- Point 10: Category change in Menu still shows right/left movement action; remove that movement action and match the provided subcategory-arrow UI.
- Point 11: Some channel names are not fully visible in Menu; reduce logo size and text sizes so more channels fit.
- Point 12: Continuous scrolling in Menu is slow.
- Point 13: Continuous scrolling down in Menu still has an issue.
- Point 14: Home icon click on the Home page refreshes the page even when already on Home; it should not refresh.
- Point 15: Give Feedback star rating only increases on left/right; it should decrease as well, and selected stars should be white.

## 2. Constraints

- Do not change the app flow.
- Do not redesign the UI theme.
- Keep the TV remote model unchanged.
- Limit changes to bug fixes, targeted UI tuning, and state handling corrections.

## 2.1 Current Implementation Status

Implemented in code:
- Point 5: Channel number box compacted and outer layer removed; input background tuned to dark semi-transparent.
- Point 6: Network popup/recovery timing tightened and BFCache restore now restarts watchdog recovery checks.
- Point 14: Home icon same-page reload guard added.
- Point 15: Feedback stars now support both directions and render active stars through CSS state.

Still pending / needs confirmation:
- Point 8: exact failure flow still needs a precise symptom description.
- Point 9: operator-specific default category mapping needs confirmation with Suresh.

## 3. Issue-by-Issue Solutions

### 3.1 Point 8 - Not Fixed

Observed:
- The referenced point remains unresolved in the latest feedback cycle.

Root Cause:
- The issue appears to be a behavior mismatch between the current implementation and the expected QA flow, likely caused by incomplete state restoration or a missing guard in the relevant page flow.

Proposed Solution:
1. Re-check the exact UI flow for the point 8 behavior in the current feedback notes.
2. Identify the specific page/module where the mismatch occurs.
3. Add a narrow fix only in that module.
4. Revalidate that the fix does not affect earlier playback/menu logic.

Expected Files:
- To be confirmed after the exact point 8 behavior is re-verified.

Acceptance Criteria:
- The point 8 behavior is resolved without breaking related navigation or playback flows.

### 3.2 Point 5 - Partially Fixed Channel Number Input UI

Observed:
- Outer layer and extra frame have been removed.
- The input background color is still not correct; it should be black with partial transparency.

Root Cause:
- The input styling is partially updated, but the background color/opacity does not match the expected TV UI.

Proposed Solution:
1. Keep the compact width and remove the outer frame.
2. Set the input background to black with partial transparency.
3. Preserve readability and focus visibility.
4. Keep the rest of the numeric input flow unchanged.

Expected Files:
- css/pages/player.css

Acceptance Criteria:
- Input box remains compact.
- No outer layer or double frame is visible.
- Background is black with partial transparency.
- Input remains clearly readable on TV.

### 3.3 Point 6 - Playback Error Popup Delay and No Auto-Resume

Observed:
- Playback error popup takes too long to appear.
- After internet is restored, playback does not auto-resume.
- User must click Try Again manually.

Root Cause:
- Error detection and auto-resume recovery are not synchronized tightly enough.
- Popup and retry state can remain behind the actual network recovery state.

Proposed Solution:
1. Trigger playback error popup immediately when a recoverable failure is detected.
2. Decouple auto-resume from popup visibility.
3. On internet restore, run a controlled retry automatically.
4. Reset retry locks and timers when playback resumes successfully.
5. Keep auto-resume bounded to avoid retry loops.

Expected Files:
- js/player.js

Acceptance Criteria:
- Playback error popup appears promptly.
- After internet restore, channel resumes automatically without pressing Try Again in normal recovery cases.
- No stuck popup after successful recovery.

### 3.4 Point 7 - Menu Focus Not Proper After Channel Change

Observed:
- After changing category and selecting a channel from Menu, pressing UP/DOWN does not keep the playing channel focused in Menu.

Root Cause:
- The sidebar restore path and the active playback sync path do not consistently converge on the same current channel.
- Focus is sometimes restored from stale category/channel state instead of the actual currently playing channel.

Proposed Solution:
1. Use the currently playing channel as the primary focus target in Menu.
2. Restore focus once per menu-open cycle to prevent later override.
3. When playback changes from Menu selection, update sidebar state immediately.
4. Keep category expansion and focus mapping aligned to the active channel.

Expected Files:
- js/player.js

Acceptance Criteria:
- Menu focus stays on the playing channel after selecting from Menu.
- UP/DOWN navigation does not lose that focus context.

### 3.5 Point 9 - Default Category Depends on Operator ID

Observed:
- Some operator IDs should open with default Subscribed category.
- Other operator IDs should open with default All Channels category.
- This behavior must be discussed with Suresh because it is operator-specific.

Root Cause:
- Default category is currently too globally hardcoded or insufficiently operator-aware.
- The app needs per-operator startup rules.

Proposed Solution:
1. Confirm the operator mapping rules with Suresh.
2. Add an operator-aware default category resolver.
3. Keep the fallback behavior stable if operator ID is not mapped.
4. Avoid changing existing category rendering logic.

Expected Files:
- js/home.js
- js/player.js
- js/channels.js

Acceptance Criteria:
- Each operator ID opens to the expected default category.
- Unmapped operators continue to use a safe fallback.

### 3.6 Point 10 - Category Change Should Not Use Left/Right Movement Action

Observed:
- In Menu, category change is still moving left/right.
- The desired behavior is to remove that movement action and match the attached UI example, including the subcategory arrow icon.

Root Cause:
- Category navigation is tied too closely to the left/right remote handling.
- UI state and arrow rendering are mixed with category switching logic.

Proposed Solution:
1. Remove the left/right movement action from category change.
2. Preserve visible arrow icon behavior as shown in the reference image.
3. Keep category selection and visual expansion separate from language switching, if that is the intended UI.
4. Make the behavior match the provided screenshot instead of the current movement model.

Expected Files:
- js/player.js
- css/pages/player.css

Acceptance Criteria:
- Left/right no longer triggers unwanted movement when changing category in Menu.
- The UI matches the reference image, including the arrow indicator style.

### 3.7 Point 11 - Channel Names Not Fully Visible in Menu

Observed:
- Some channel names are clipped or not fully visible.
- More channels should fit in Menu.

Root Cause:
- Logo block, channel name font size, and channel number font size are too large for the available width.
- Row density is too low for the target TV layout.

Proposed Solution:
1. Reduce logo size.
2. Reduce channel name font size.
3. Reduce channel number font size.
4. Preserve readability while increasing list density.
5. Keep the same overall format, only tighten spacing.

Expected Files:
- css/pages/player.css

Acceptance Criteria:
- Channel names are visible more fully.
- More items fit in the visible area.
- Focus and selection remain clear.

### 3.8 Point 12 - Continuous Scrolling in Menu is Slow

Observed:
- Continuous up/down scrolling in Menu feels slow.

Root Cause:
- Navigation handling and/or render cost is too heavy during repeated key presses.
- DOM refresh or focus updates may be happening too often.

Proposed Solution:
1. Reduce unnecessary re-renders during scroll.
2. Keep scroll updates lightweight.
3. Avoid rebuilding unchanged sections on every key repeat.
4. Reuse focused DOM nodes where possible.

Expected Files:
- js/player.js
- js/channels.js

Acceptance Criteria:
- Continuous scroll feels responsive and smooth.
- Focus movement keeps pace with remote key repeats.

### 3.9 Point 13 - Continuous Scrolling Down in Menu Still Has an Issue

Observed:
- Continuous down scroll in Menu has a remaining issue.

Root Cause:
- Boundary/index handling likely still breaks in one of the category/channel states.
- One or more edge cases may skip focus mapping during long down-scroll.

Proposed Solution:
1. Recheck boundary conditions when reaching the end of a visible list.
2. Clamp indexes safely and map them back to the correct visible node.
3. Ensure multi-category and single-category states both support consistent down-scroll.

Expected Files:
- js/player.js

Acceptance Criteria:
- Holding DOWN continues to move focus correctly through the menu.
- No stall or trapped state during long scroll sessions.

### 3.10 Point 14 - Home Icon Refreshes Home Page Again

Observed:
- When already on Home, clicking the Home icon refreshes the page again.
- Refresh should not happen if the user is already on Home.

Root Cause:
- Home icon click handler does not guard against no-op navigation.
- The route handler treats same-page selection as a full reload.

Proposed Solution:
1. Detect current page before handling Home icon click.
2. If already on Home, do nothing or only refresh lightweight state if truly needed.
3. Avoid full page reload for same-page clicks.

Expected Files:
- js/home-navigation.js
- js/home.js
- js/main.js

Acceptance Criteria:
- Clicking Home while already on Home does not refresh unnecessarily.
- Navigation still works when coming from other pages.

### 3.11 Point 15 - Feedback Star Rating Only Increases

Observed:
- In Give Feedback page, left/right star rating only increases; it does not decrease.
- Star fill color should be white.

Root Cause:
- The star control likely only increments on both arrow directions or the key mapping is incomplete.
- Star fill styling is not using the expected white color.

Proposed Solution:
1. Map LEFT to decrease rating and RIGHT to increase rating.
2. Keep ENTER/OK behavior unchanged.
3. Set selected star fill color to white.
4. Ensure non-selected stars remain visually distinct.

Expected Files:
- js/feedback.js
- css/pages/feedback.css

Acceptance Criteria:
- LEFT decreases the rating.
- RIGHT increases the rating.
- Selected stars are white.
- Existing feedback submission flow remains unchanged.

## 4. Recommended Implementation Order

1. Point 6 - Playback error and auto-resume
2. Point 7 - Menu focus after channel selection
3. Point 10 - Category change movement cleanup
4. Point 11 - Menu channel density and text sizing
5. Point 12 - Continuous scrolling performance
6. Point 13 - Down-scroll edge case
7. Point 14 - Home icon same-page refresh guard
8. Point 15 - Feedback star rating direction and color
9. Point 5 - Channel number background cleanup
10. Point 9 - Operator-specific default category
11. Point 8 - Re-verify exact behavior and fix after confirmation

## 5. Notes

- Point 9 needs operator-rule confirmation before implementation.
- Point 8 is intentionally left as a placeholder until the exact behavior is confirmed.
- This document excludes the earlier issue pack on purpose and focuses only on the current feedback points.

## 6. Non-Regression Constraint

All fixes must preserve existing app flow and format.

Guardrails:
- Do not redesign the UI.
- Do not alter remote-key model.
- Keep changes narrow and bug-focused.
- If a fix risks changing navigation flow, ask before applying it.
