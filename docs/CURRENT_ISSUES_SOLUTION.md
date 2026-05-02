# Current Issues Solution Documentation

Date: 2026-04-28
Project: NEW-SAMSUNG (Tizen TV Web App)
Scope: Current open TV app issues only. No Settings legal-page content included.

## 1. Requirement Lock

- Fix issues without changing the app flow.
- Fix issues without changing the app visual format.
- Restrict changes to the minimum logic, state, caching, and layout corrections needed.
- Do not add new routes or redesign existing pages.

## 2. Issue List

### 2.1 New Issues

1. Channel Logo Images Not Displaying
- Logos are missing on TV Channels page, Info Bar, and Menu.
- Expected: fetch and render logos consistently across all screens.

2. Homepage Banner Left & Right Sides Blank
- The homepage banner area appears centered with blank left and right sides.
- Expected: banner should span the full available width.

3. Homepage Banner Only 2 of 5 Banners Showing
- Only 2 banners appear on home instead of the expected 5.
- Expected: all 5 banners should render when available.

4. Scroll Stops at Janam TV in All Channels
- Continuous scrolling stops at Janam TV in All Channels.
- Expected: all following channels must remain reachable.

5. Last Channel Should Loop Back to First Channel
- When all subcategories are expanded, focus gets stuck at the last channel.
- Expected: scrolling should wrap to the first channel at the top.

### 2.2 Previously Reported - Still Not Fixed

6. Playback Error - Stream Not Auto-Resuming
- Playback Error shows, but stream does not resume automatically after recovery.
- Expected: auto-resume after network/stream recovery; Try Again only as fallback.

7. Focus for Currently Playing/Selected Channel in Menu Is Not Proper
- Opening the Menu does not always highlight the active/playing channel.
- Expected: focus should land on the current channel when the menu opens.

8. Menu Up & Down Navigation Not Working Properly
- Up/down movement can stay trapped within one expanded subcategory.
- Expected: navigation should move across all visible channels and categories.

9. Scrollbar Still Showing in Menu Under Subcategory
- Scrollbar is still visible inside submenu/subcategory lists.
- Expected: scrollbar should be hidden or removed inside the submenu area.

10. Channel Number Input Field UI Not Fixed
- The player channel number input field still looks too wide and bordered.
- Expected: narrower width, no outer border, black translucent background, white text.

11. Menu Focus Not Retained After Reopen
- Menu reopen sometimes shifts focus away from the previously selected channel.
- Expected: reopening the menu should restore the previous channel focus.

## 3. Already Confirmed Fixed

- Subscription reflection issue is fixed.
- Menu subcategory order is fixed.

## 4. Other Reported Issues Under Observation

- First launch to player can still feel slow before Info Channel starts.
- Subscription can still take too long to reflect in some cases and should be immediate after reopen.
- Opening All Channels can feel slow and should be optimized.
- A border line appears when Info Bar opens and when Menu closes.
- Language images reload on every home return and should be cached.
- Unsubscribed popup/back/menu flow can fall to a black screen instead of showing the popup again.

## 5. Current Code Status

### 5.1 Likely Fixed

- Homepage banner count and full-width rendering have code support in the current code base.
- Playback auto-resume and popup dedupe logic exist in the player.
- Menu focus restore logic exists in the player.
- Channel number input styling exists in the player.

### 5.2 Partially Fixed

- Channel logo consistency across Home, Channels, and Player.
- Wrap-around behavior in expanded subcategory navigation.
- Menu up/down behavior across expanded lists.

### 5.3 Still Unresolved

- Scroll stops at Janam TV.
- Scrollbar visibility inside subcategory lists.
- Black-screen behavior after unsubscribed popup/back/menu flow.

## 6. Proposed Fix Plan

### 6.1 Channel Logos

- Use one shared logo resolution order everywhere.
- Keep fallback order consistent across Home, Channels, Player, Favorites, and Menu.
- Keep page-level logo sizing rules consistent enough to avoid missing-image behavior.

### 6.2 Homepage Banners

- Keep banner rendering limited to valid data, but allow up to 5 items.
- Keep the banner container full width.
- Use existing carousel structure and only adjust logic and CSS sizing if needed.

### 6.3 All Channels Scroll and Janam TV

- Ensure scroll navigation uses a safe visible list index.
- Skip invalid items without breaking the rest of the list.
- Keep the current remote-navigation pattern intact.

### 6.4 Wrap-Around Navigation

- Use a flattened visible list for expanded subcategories.
- Wrap from the last visible channel back to the first visible channel.
- Preserve current category/channel selection state.

### 6.5 Playback Auto-Resume

- Trigger resume only after a stable reconnect window.
- Keep the Try Again button as fallback only.
- Avoid multiple popups for the same playback error.

### 6.6 Menu Focus and Reopen State

- Preserve category, channel, and expansion state when reopening the menu.
- Restore saved focus before fallback alignment logic runs.

### 6.7 Scrollbar Visibility

- Hide the subcategory scrollbar at the menu container level.
- Avoid changing list layout or item spacing.

### 6.8 Channel Number Input UI

- Keep the input overlay but reduce width and visual weight.
- Remove outer border and use the existing dark translucent style.

### 6.9 Black Screen After Popup Back Flow

- Keep the unsubscribed popup chrome visible until the user takes a valid next action.
- Clear the preserve-chrome flag only when the user changes channel or playback context.

## 7. Files Expected To Change

- js/api.js
- js/home.js
- js/channels.js
- js/player.js
- css/pages/homepages.css
- css/pages/channels.css
- css/pages/player.css

## 8. Non-Regression Rules

- Do not change page flow.
- Do not change page format.
- Do not add new screens.
- Do not alter the current Settings legal-page implementation.
- Keep all fixes isolated to the reported issue surfaces.

## 9. Verification Targets

- Home banners display 5 when 5 are available.
- Channel logos render consistently in Home, Channels, Player, and Menu.
- Janam TV no longer blocks All Channels scrolling.
- Expanded subcategories wrap from last to first.
- Playback resumes after network restoration without pressing Try Again.
- Menu focus restores correctly after reopening.
- Subcategory scrollbar is hidden.
- Channel number input looks correct.
- Unsubscribed popup flow does not fall to a black screen.

This document is separate from the Settings legal-page documentation and is intended only for the current open issues.