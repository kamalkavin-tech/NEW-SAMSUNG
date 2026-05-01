# Samsung TV App - Current Issues Reference

Date: 2026-04-29
Project: NEW-SAMSUNG (Tizen TV Web App)
Purpose: Clear reference document for currently observed app issues only.
Note: This file is for issue clarity and QA tracking. It does not apply code changes.

## 1. Scope

This document captures only the issues reported during latest Samsung TV testing.
Most earlier issues are already addressed; this list tracks the remaining observed behaviors and validation expectations.

## 2. Issue Normalization

Some reported points describe the same failure from different scenarios.
For clarity, related items are grouped into one canonical issue with all observed symptoms included.

## 3. Canonical Issue List

### CI-01: First Launch to Player - Slow Initial Channel Start

Observed:
- On first app launch and redirect to player, Info channel takes noticeable time to begin playback.

Expected:
- Initial channel playback should start quickly and consistently after first redirect.

Impact:
- User perceives app as slow or unstable during first-time experience.

Acceptance Criteria:
- First-launch playback starts within acceptable startup window on Samsung TV test conditions.
- No prolonged buffering with stable network.

QA Validation:
- Cold start app.
- Complete redirect flow to player.
- Measure time-to-first-frame for Info channel.

---

### CI-02: Subscription Reflection Delay After Payment

Observed:
- After successful subscription, app may take 8-10 minutes to reflect entitlement.

Expected:
- Entitlement should reflect after app close and reopen (without long wait).

Impact:
- Paid users cannot watch subscribed channels immediately.

Acceptance Criteria:
- After payment success, close and reopen app once.
- Newly subscribed channels appear/play without waiting several minutes.

QA Validation:
- Purchase channel.
- Close app and reopen.
- Verify subscribed state and playback on first attempt.

---

### CI-03: Playback Error Persists After Stream/Network Recovery (Auto-Resume Gap)

Observed Symptoms:
- Stream issue shows Playback Error popup.
- After stream restore, playback does not always auto-resume.
- After internet restore, screen may still show Playback Error.
- User often must press Try Again manually to resume.

Expected:
- On valid network/stream restoration, playback should auto-recover without requiring Try Again in normal cases.

Impact:
- Recovery UX is manual and inconsistent.

Acceptance Criteria:
- During recoverable network/stream interruption, channel resumes automatically.
- Playback Error popup clears when stream is healthy.
- Manual Try Again should be fallback, not primary path.

QA Validation:
- Start channel playback.
- Disconnect internet for a short interval.
- Restore internet.
- Confirm automatic channel resume and popup recovery.

---

### CI-04: Menu "All Channels" Takes Long Time to Load/Show

Observed:
- Navigating to All Channels in menu takes longer than expected.

Expected:
- Menu All Channels view should open quickly and remain responsive.

Impact:
- Navigation feels laggy; poor browsing experience for large channel lists.

Acceptance Criteria:
- All Channels list appears within acceptable UI response time on TV.
- No long freeze before list/focus becomes usable.

QA Validation:
- Open menu repeatedly from player.
- Move to All Channels.
- Check load time and first-focus readiness.

---

### CI-05: Border Line Visible on Player UI Transitions

Observed:
- A border/line artifact appears on player screen when pressing RIGHT to show info bar.
- Also observed when closing menu.

Expected:
- No unintended border/line artifact during info bar/menu transitions.

Impact:
- Visual defect on core playback screen.

Acceptance Criteria:
- Opening info bar and closing menu should not render transient border line artifacts.

QA Validation:
- During playback, press RIGHT to show info bar multiple times.
- Open and close menu repeatedly.
- Verify no border line artifacts appear.

---

### CI-06: Menu Subcategory Order Incorrect

Observed:
- Subcategories are not in required business order.

Required Order:
1. Entertainment
2. Movies
3. Kids
4. Sports
5. Infotainment
6. Music
7. News
8. Devotional
9. Miscellaneous

Expected:
- Menu subcategories always appear in above order.

Impact:
- Category browsing order inconsistent with requirement.

Acceptance Criteria:
- For each applicable language/context, subcategory list follows required order.

QA Validation:
- Open menu and inspect subcategory sequence.
- Verify exact order match.

---

### CI-07: Menu Reopen Focus Not Retained on Previously Selected Channel

Observed:
- After selecting a channel and changing category context, reopening menu shifts focus incorrectly to subcategory (example: News) instead of selected channel (example: Zee Kannada SD).

Expected:
- Reopening menu should retain focus on previously selected/currently streaming channel within selected context.

Impact:
- Focus jumps reduce navigation reliability and user trust.

Acceptance Criteria:
- Menu reopen returns focus to last selected/playing channel when it exists in current scope.
- No unexpected fallback to unrelated subcategory headers.

QA Validation:
- Select channel in All Channels.
- Switch to Subscribed Channels.
- Close and reopen menu.
- Verify focus consistency on intended channel.

---

### CI-08: Language Images Reload on Every Home Redirect

Observed:
- Language images reload every time app redirects to home page.

Expected:
- Language images should be reused from cache where valid, avoiding visible repeated reload behavior.

Impact:
- Extra loading, slower home experience, unnecessary network usage.

Acceptance Criteria:
- Home revisit should not trigger full language image reload under normal cache-valid conditions.

QA Validation:
- Navigate away and back to home multiple times.
- Observe image rendering behavior and repeat load events.

---

### CI-09: Unsubscribed Popup/Back/OK Flow Leads to Black Screen

Observed:
- When unsubscribed popup is shown, user presses Back, then presses OK to open menu.
- After some time, menu and info bar disappear and black screen appears.
- Expected popup is not shown at that time.

Expected:
- In this flow, unsubscribed-channel handling should remain visible and deterministic (no black screen state).

Impact:
- Blocking UX path with no guidance to user.

Acceptance Criteria:
- No black-screen state in popup-back-menu sequence.
- Unsubscribed handling remains visible or correctly restored.

QA Validation:
- Open unsubscribed channel.
- Press Back.
- Press OK to open menu.
- Wait through idle timeout window.
- Verify no black screen and correct popup behavior.

---

### CI-10: Channel Logos Missing Across TV Channels, Info Bar, and Menu

Observed:
- Most channel logos not visible on TV Channels page, Info Bar, and Menu.

Expected:
- Same channel logo should display consistently across all three surfaces when logo asset exists.

Impact:
- Incomplete visual identity and reduced usability.

Acceptance Criteria:
- Logos appear consistently across TV Channels, Info Bar, and Menu.
- Missing logos limited to genuinely unavailable assets.

QA Validation:
- Compare a sample set of channels across all three surfaces.
- Verify consistency and fallback behavior.

---

### CI-11: Homepage Banner Layout Centered with Blank Sides

Observed:
- Banner section appears centered, leaving blank left/right screen areas.

Expected:
- Banner presentation should use intended full-width visual layout without unintended side blanks.

Impact:
- Homepage appears visually broken on TV.

Acceptance Criteria:
- Banner section fills intended horizontal layout for TV viewport.

QA Validation:
- Open homepage with active banner data.
- Confirm no unintended blank side regions.

---

### CI-12: Homepage Shows 2 Banners Instead of 5

Observed:
- Only 2 banners displayed; expected 5 banners not fully visible.

Expected:
- When data has 5 valid banners, all 5 should be rendered/rotated as designed.

Impact:
- Lost promotional inventory and incomplete UX.

Acceptance Criteria:
- With 5-banner dataset, all 5 are visible/rotating correctly.
- With fewer banners from API, fallback remains stable.

QA Validation:
- Validate with known 5-banner payload.
- Validate with smaller payload for fallback behavior.

---

### CI-13: Continuous Scroll Stops at Janam TV in Menu All Channels

Observed:
- During continuous downward scroll in All Channels, navigation stops around Janam TV even though more channels exist.

Expected:
- Continuous scroll should proceed beyond Janam TV without freeze/stall.

Impact:
- Inaccessible channels and broken long-list navigation.

Acceptance Criteria:
- Hold DOWN and move through full list without stop near Janam TV.

QA Validation:
- Open All Channels.
- Hold DOWN from before Janam TV and continue past it.
- Confirm uninterrupted focus progression.

---

### CI-14: Expanded Multi-Subcategory Wrap Navigation Incorrect at End of List

Observed:
- After expanding multiple subcategories (for example Kannada, Telugu, Malayalam), continuous DOWN at the end keeps cycling within last subcategory instead of returning to top first channel.

Expected:
- With expanded multi-subcategory view, end-of-list DOWN should wrap to first visible top channel.

Impact:
- Circular navigation requirement not satisfied.

Acceptance Criteria:
- Expanded multi-subcategory navigation wraps from last visible channel to first visible channel.

QA Validation:
- Expand multiple subcategories.
- Scroll DOWN to last visible channel.
- Verify next DOWN wraps to top first visible channel.

## 4. Priority Recommendation

Priority P0 (Critical playback/business):
- CI-02, CI-03, CI-09

Priority P1 (Navigation reliability):
- CI-04, CI-06, CI-07, CI-13, CI-14

Priority P2 (Visual/perceived quality):
- CI-01, CI-05, CI-08, CI-10, CI-11, CI-12

## 5. Regression Guardrails

- Keep current app flow and remote key model unchanged.
- Do not redesign existing UI format/theme.
- Restrict fixes to logic/state/render correctness and scoped style defects.
- Ensure no new regressions in player startup, menu focus, and channel zapping.

## 6. Suggested QA Completion Checklist

- [ ] First-launch playback startup acceptable.
- [ ] Subscription reflects after close/reopen.
- [ ] Stream/network recovery auto-resumes playback.
- [ ] All Channels menu load responsive.
- [ ] No player border-line artifact.
- [ ] Subcategory order matches required sequence.
- [ ] Menu reopen focus retained on selected/playing channel.
- [ ] Home language images not repeatedly reloading.
- [ ] No black screen in unsubscribed popup-back-menu path.
- [ ] Logos visible consistently across surfaces.
- [ ] Homepage banners use full intended width.
- [ ] Homepage renders expected banner count.
- [ ] Continuous scroll passes Janam TV.
- [ ] Expanded subcategory end wraps to top channel.
