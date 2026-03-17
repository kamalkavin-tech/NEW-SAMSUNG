# Agent Project Flow and Task Instructions

## Purpose
This document instructs the coding agent how to analyze this Samsung TV app, understand execution flow, and implement tasks from the bug tracker without side effects.

## Mandatory Work Order
1. Read task source first: `docs/Samsung_TV_Bug_Report_Tasks.txt`.
2. Read project guidance markdown files before changing code:
   - `docs/README.md`
   - `docs/PROJECT_STATUS_SUMMARY.md`
   - `docs/TESTING-GUIDE.md`
   - `docs/samsung-tv-distribution-guide.md`
   - `NETWORK-DATA-FLOW.md`
   - `DATA-FLOW-COMPARISON.md`
3. Analyze the impacted flow end-to-end before editing.
4. Fix only the requested task scope.
5. Validate and regression-test so the issue does not repeat.

## Strict Change Rules
- Do not change unrelated functionality.
- Do not change layout/styles unless the task explicitly requires it.
- Do not refactor unrelated modules.
- Do not rename existing functions/files unless required by the task.
- Keep fixes minimal and targeted.

## Project Execution Flow (High Level)
1. App entry starts from `login.html` (configured by `config.xml`).
2. Global API and device setup loads via `js/api.js`.
3. Remote/focus/input handlers initialize via `js/main.js`.
4. Auth flow:
   - Login page captures mobile number.
   - OTP request is triggered from login action.
   - Verify page validates OTP and sets session.
   - On success, user is redirected to `home.html`.
5. Post-login pages:
   - Home and channel flows pull data from `BBNL_API` methods in `js/api.js`.
   - Player flow uses `js/player.js` and `js/avplayer.js`.
6. Navigation is driven by Samsung remote key events and focus management.

## Login and OTP Functional Flow
### Login (Phone Entry)
- UI: `login.html`
- Logic: `js/main.js`
- API layer: `js/api.js` (`AuthAPI` methods)
- Core behavior:
  - Phone input accepts numeric-only input.
  - Remote OK/Enter should focus editable input and open numeric keypad.
  - Get OTP button triggers login OTP request flow.

### OTP Verify
- UI: `verify.html`
- Logic: `js/main.js`
- API/session support: `js/api.js`
- Core behavior:
  - Four OTP inputs with remote navigation and controlled validation.
  - Verify action validates OTP and proceeds to home only on success.
  - Error path shows invalid OTP feedback and allows retry.

## API Areas to Check During Auth/OTP Tasks
- `AuthAPI.requestOTP`
- `AuthAPI.verifyOTP` / related OTP validation flow
- `AuthAPI.resendOTP`
- Session persistence keys and redirect guards
- Device payload fields used by auth calls (IP/MAC/device identifiers)

## Task Priority (Fix These First)
Use `docs/Samsung_TV_Bug_Report_Tasks.txt` as the source of truth and fix in this order:
1. BUG-001 to BUG-007 (all bug items)
2. FEAT-001 to FEAT-003 (new features)

## Completion Criteria for Each Task
A task is complete only if all are true:
1. Root cause identified.
2. Targeted fix applied.
3. No unrelated file behavior changed.
4. Task scenario passes on Samsung remote navigation.
5. Regression checks pass for adjacent flows.
6. Issue cannot be reproduced again with the same test steps.

## Regression Checklist (Minimum)
- Login input focus and numeric keypad behavior (OK/Enter).
- OTP field focus, keypad open, verify trigger behavior.
- Home/channel search keypad behavior.
- Player navigation keys and popups.
- API call path remains stable with existing payloads.

## Agent Output Expectation for Each Fix
For every task, the agent should report:
1. Root cause summary.
2. Files changed.
3. Exact behavior fixed.
4. Validation performed.
5. Regression checks run.

## Non-Repeat Policy
If a bug is fixed, add a repeat-prevention check in implementation and validation notes so the same issue is not reintroduced in the next build.
