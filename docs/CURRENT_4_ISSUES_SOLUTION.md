# Current 4 Issues - Solution Plan

Date: 2026-05-02
Project: NEW-SAMSUNG (Tizen TV Web App)
Scope: 4 issues reported by user this session.
Status: **Awaiting approval** before any code changes.

Constraint: do not change app flow or layout. Visual additions (e.g. an
active-tab highlight) are scoped to a single CSS rule that the user has
explicitly requested.

---

## How to read this doc

Each item has four blocks:
- **Symptom** — what the user reported.
- **Where** — file:line for the code that needs to change.
- **Why current code fails** — what the existing code does and why it produces the bug.
- **Fix** — the targeted change.
- **Acceptance** — what QA should see after the fix.

---

## Issue 1 - Slow internet shows playback error too late

**Symptom**
When the modem dies / internet becomes too slow to sustain the stream, the
playback-error popup takes 1 to 1.5 minutes to appear. User expects 5-10s.

**Where**
- [js/player.js](../js/player.js) `startPlayerNetworkWatchdog()` ~line 686
- [js/player.js](../js/player.js) `markPlayerPlaybackHealthy()` ~line 568
- [js/player.js](../js/player.js) `onCurrentPlayTime` callback ~line 1088
- [js/player.js](../js/player.js) `setupPlayer()` ~line 1880
- [js/player.js](../js/player.js) `handlePlaybackFailure()` ~line 481

**Why current code fails**
The existing watchdog only trips on `webapis.network.getActiveConnectionType() === 0`,
i.e. a hard LAN disconnect. On Tizen TVs this API still reports "connected"
when WiFi has no internet. avplay then sits in silent buffering for 60-90s
before its own `onerror` fires.

**Fix**
1. Add 3 state vars near `_NETWORK_ERROR_WINDOW_MS`:
   - `_lastPlaybackProgressAt = 0`
   - `PLAYER_PLAYBACK_STALL_THRESHOLD_MS = 8000`
   - `_playbackStallNotified = false`
2. In `onCurrentPlayTime`: stamp `_lastPlaybackProgressAt = Date.now()` and reset `_playbackStallNotified = false` every tick.
3. In `markPlayerPlaybackHealthy`: same stamp + reset (so the watchdog has a baseline once playback starts).
4. In `setupPlayer`: reset both vars to 0/false so a normal channel switch is not misread as a stall.
5. In `startPlayerNetworkWatchdog`: before the existing `disconnected` block, add a stall check — if `hasHiddenLoadingIndicator && !_playbackStallNotified && !playerErrorPopupOpen && !playerAutoResumeInProgress && _lastPlaybackProgressAt > 0 && (Date.now() - _lastPlaybackProgressAt) >= PLAYER_PLAYBACK_STALL_THRESHOLD_MS`, then call `handlePlaybackFailure({ source: 'playback-stall', ... })`.
6. In `handlePlaybackFailure`: extend the network-route condition with `|| source === 'playback-stall'` so the popup shows the network message and gets category `'network'` (required for Issue 2 auto-hide).

**Acceptance**
- Modem off mid-playback: error popup appears within ~8-9s (8s stall threshold + ~1s render).
- Channel zap during healthy playback does not falsely trigger the stall popup.

---

## Issue 2 - Auto-resume when internet returns

**Symptom**
After the playback-error popup is shown, when internet comes back, the
channel does NOT auto-play. User has to press Try Again manually.

**Where**
- [js/player.js](../js/player.js) `startPlayerNetworkWatchdog()` reconnect branch ~line 696
- [js/player.js](../js/player.js) `handlePlaybackFailure()` ~line 495
- [js/player.js](../js/player.js) `attemptPlayerAutoResumeRetry()` ~line 578 (existing)

**Why current code fails**
The existing reconnect path requires `_lastNetworkOnline === false` to fire
`attemptPlayerAutoResumeRetry('watchdog-online')`. But for slow-internet /
dead-modem cases, Tizen reports "connected" the entire time, so
`_lastNetworkOnline` stays `true` and the offline→online transition never
fires. Also, if a retry-driven `stream-timeout` failure happens during
recovery, the popup category flips from `'network'` to `'playback'`, and
`markPlayerPlaybackHealthy()` only auto-hides popups whose category is
`'network'`.

**Fix**
1. In the stall handler from Issue 1, after triggering `handlePlaybackFailure`, also set:
   - `_lastNetworkOnline = false`
   - `playerNetworkReconnectSince = 0`
   This lets the very next watchdog tick treat the situation as an
   offline→online transition and reach `attemptPlayerAutoResumeRetry`.
2. In `handlePlaybackFailure`: also OR a "sticky network popup" check —
   `playerErrorPopupOpen && playerLastErrorCategory === 'network'`. While a
   network-popup is already on screen, route ALL subsequent failures (including
   `stream-timeout` from a failed retry attempt) through the `'network'` reason.
   This keeps category stable so `markPlayerPlaybackHealthy()` will auto-hide
   the popup on the first successful retry.

**Acceptance**
- Cut the modem mid-playback → popup shows in ~8s.
- Reconnect the modem → channel resumes within ~10-20s with no user action.
- Popup hides automatically when playback resumes.

---

## Issue 3 - Playing channel not focused on menubar with correct category

**Symptom**
When user opens the menubar (sidebar in player), the focus does not land on
the currently playing channel inside its actual category. Sometimes the
correct category is not even expanded.

**Where**
- [js/player.js](../js/player.js) `openSidebar()` and friends.
- [js/player.js](../js/player.js) `findCurrentChannelInSidebar()` ~line 3278
- [js/player.js](../js/player.js) `getCurrentPlayingCategoryIndex()` ~line 3342
- [js/player.js](../js/player.js) `alignSidebarToCurrentPlayback()` ~line 3434
- [js/player.js](../js/player.js) `enforceSidebarPlaybackFocusOncePerOpen()` ~line 607

**Why current code likely fails**
The infrastructure exists, but multiple paths can race:
- `openSidebar` sets focus once synchronously and once via deferred RAF.
- `buildCategoriesForLanguage` may rebuild category list AFTER focus was already set, blowing it away.
- When the user picks a channel from the menubar, `sidebarState` indices update, but on next reopen the alignment must be against the *currently playing* channel id, not the last-touched index.

**Fix**
1. In `openSidebar`, after categories are built, always call:
   ```
   var catIdx = getCurrentPlayingCategoryIndex();
   if (catIdx >= 0) setSidebarCategoryExpanded(catIdx, true);
   var chIdx = findCurrentChannelInSidebar();
   if (catIdx >= 0) sidebarState.categoryIndex = catIdx;
   if (chIdx >= 0) sidebarState.channelIndex = chIdx;
   sidebarState.currentLevel = 'channels';
   ```
2. Inside the deferred RAF in `openSidebar`, re-read `getCurrentPlayingCategoryIndex()` / `findCurrentChannelInSidebar()` and call `focusChannelItem(chIdx, catIdx)` again. This guards against the category list being rebuilt mid-open.
3. Do not modify the existing keydown handler or sidebar layout.

**Acceptance**
- Open menubar while a channel is playing: focus lands on that channel and its parent category is expanded.
- Press BACK to close the menubar, reopen: focus is still on the playing channel (not on the last-scrolled row).

---

## Issue 4 - Selected category pill not highlighted on TV Channels page

**Symptom**
On TV Channels page, user selects "Subscribed Channels" (or any language) in
the top header. Pressing DOWN moves focus to a channel card. The selected
pill in the header has no visible "selected" state, so the user cannot tell
which filter is active.

**Where**
- [css/pages/channels.css:350-354](../css/pages/channels.css#L350-L354) — the comment block explicitly says "No persistent style for the .active (selected) tab".
- [js/channels.js](../js/channels.js) ~line 588-594 — `.active` class is applied correctly; the issue is purely CSS.

**Why current code fails**
The CSS for `.category-pill` has only a `:hover, :focus` rule. There is
intentionally no rule for `.category-pill.active`, so when focus leaves the
header strip, the previously selected pill looks identical to the rest.

**Fix** (CSS-only, single rule)
Add:
```
.category-pill.active {
    background: rgba(255, 255, 255, 0.18);
    border: 2px solid #FFFFFF;
    color: #ffffff;
}
.category-pill.active:focus {
    background: rgba(255, 255, 255, 0.22);
    border: 2px solid #FFFFFF;
    color: #ffffff;
}
```
The focused-pill style ramp keeps the focus ring slightly brighter than the
unfocused-active ring, so both states are distinguishable. No layout, no
font-size change, no DOM change.

**Acceptance**
- Select "Subscribed Channels", press DOWN: pill stays visibly highlighted while focus is on a card.
- Press UP back to header: focus state is brighter than the unfocused active state — both visible.
- Other pills look unchanged when neither focused nor active.

---

## Implementation order

Lowest-risk first, highest-impact first inside the same risk band:

1. Issue 4 — CSS only (no JS). Lowest risk.
2. Issue 1 — stall watchdog. Adds-only changes; the existing watchdog is untouched in its disconnect branch.
3. Issue 2 — small additions to the stall handler and `handlePlaybackFailure`. Reuses Issue 1's plumbing.
4. Issue 3 — narrowest target inside `openSidebar`. Done last because it has the most existing safeguards to coordinate with.

---

## Constraints reaffirmed

- No app-flow changes. No page-navigation changes. No remote-key remapping.
- No layout, theme, or font-size changes.
- One CSS rule added (Issue 4) for an explicitly-requested visual indicator.
- All JS changes confined to `js/player.js`.

---

## Approval checklist

- [ ] Issue 1 plan and 8s threshold acceptable.
- [ ] Issue 2 plan acceptable (auto-retry up to existing `PLAYER_AUTO_RESUME_MAX_RETRIES`/`PLAYER_AUTO_RESUME_WINDOW_MS` cadence; window auto-resets so probing continues).
- [ ] Issue 3 plan acceptable (focus alignment in `openSidebar` only; no keydown changes).
- [ ] Issue 4 CSS values acceptable (`rgba(255,255,255,0.18)` background, `2px #FFFFFF` border).

Once approved, I will implement in the order above, one issue per commit, and report acceptance status after each.
