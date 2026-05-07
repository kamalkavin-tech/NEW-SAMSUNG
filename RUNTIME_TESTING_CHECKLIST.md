# Runtime Testing Checklist
## BBNL IPTV Samsung TV - Player Fixes Verification

### Prerequisites
- [ ] Samsung TV or Tizen emulator available
- [ ] App loaded and ready to test
- [ ] Developer console/logs accessible
- [ ] Network conditions controllable (for scenarios 2-3)

---

## Test Scenario 1: Normal Channel Load ✓ Must Pass

**Objective**: Verify that normal playback doesn't trigger recovery timeout

### Steps
1. Launch app
2. Navigate to Channels page
3. Select any available channel
4. Observe: Channel should load in <6 seconds
5. Observe: Loading overlay should disappear completely
6. Observe: Video should start playing
7. Press buttons: BACK, LEFT, RIGHT, MENU should all be responsive
8. Console logs should NOT contain "[PLAYER] Initialization timeout"

### Expected Result
```
✅ Channel loads in <6 seconds
✅ Loading overlay completely removed
✅ All buttons responsive during load
✅ Video plays normally
✅ NO recovery error messages or logs
```

### If Failed
```
❌ Channel doesn't load
❌ Loading overlay stays visible
❌ Buttons not responsive
❌ Recovery message appears inappropriately
→ Check console logs for errors
→ Review FIX #3 (hidePageLoadingOverlay)
```

---

## Test Scenario 2: Slow Network Load ✓ Should Handle Gracefully

**Objective**: Verify that slow networks load eventually without user seeing recovery

### Steps
1. Throttle network to 3G speed (or simulate slow network)
2. Launch app
3. Navigate to Channels, select a channel
4. Observe: Loading may take 8-15 seconds
5. Observe: Loading overlay should eventually disappear
6. Observe: Video should start (even if slowly)
7. Monitor console logs for "[PLAYER]" messages

### Expected Result
```
✅ Channel eventually loads (even if slow)
✅ Loading overlay disappears when ready
✅ Video plays after delay
✅ Console shows progress: "Early key handler registered", etc.
✅ NO recovery timeout message (normal load completes)
```

### If Failed
```
❌ Loading overlay never disappears
❌ Player freezes at 15 seconds
❌ Recovery error shown but buttons don't work
→ Check console for network errors
→ Review FIX #1 (recovery timeout might not be clearing timer)
```

---

## Test Scenario 3: Network Disabled - Recovery Test ✓ Critical Test

**Objective**: Verify recovery mechanism works when initialization fails

### Steps
1. Disable network (WiFi off, network disconnected)
2. Launch app  
3. Navigate to Channels, select a channel
4. Observe: Loading overlay appears
5. Wait 15+ seconds (let recovery timeout trigger)
6. Observe: Error recovery message should appear to user
7. Observe: BACK button should still work (not frozen)
8. Observe: HOME button should still work
9. Press BACK to return to previous page
10. Console logs should show: "[PLAYER] Initialization timeout"

### Expected Result
```
✅ After 15 seconds, error message appears
✅ Error message is readable and helpful
✅ BACK button responds when recovery shows
✅ HOME button responds
✅ Can navigate away from stuck player
✅ Console shows: "[PLAYER] Initialization timeout at 15000ms"
✅ Console shows: "Loading overlay forced hidden"
✅ Console shows: "Keyboard handler re-registered in recovery mode"
```

### If Failed
```
❌ Loading overlay never disappears after 15s
❌ Error message not shown
❌ BACK button still frozen even with error message
❌ No console messages about recovery
→ Check console logs for errors
→ Review FIX #1 (timeout mechanism)
→ Review FIX #3 (overlay removal)
→ Review FIX #2/FIX #4 (key registration)
```

---

## Test Scenario 4: Button Response During Load ✓ Core Functionality

**Objective**: Verify keyboard handlers work while player is loading

### Steps
1. Launch app
2. Select a channel (should start loading)
3. While loading (within first 6-8 seconds):
   - Press BACK button (should work or should be caught by handler)
   - Press LEFT button (should respond or be caught)
   - Press RIGHT button (should respond or be caught)
   - Press MENU button (should respond or be caught)
4. Observe behavior:
   - Buttons should either respond immediately or be handled gracefully
   - App should NOT freeze when buttons are pressed during load
   - Buttons should work after load completes

### Expected Result
```
✅ Buttons respond during loading (not frozen)
✅ Pressing BACK shows appropriate response
✅ Pressing LEFT/RIGHT shows appropriate response  
✅ Pressing MENU shows appropriate response
✅ Buttons work after loading completes
✅ Console shows: "Early key handler registered (capture phase)"
✅ No "[PLAYER]" error messages during normal button use
```

### If Failed
```
❌ App freezes when button pressed during load
❌ Buttons have long delay before responding
❌ Buttons don't work at all during/after loading
❌ Console shows "Failed to register keys"
→ Check console for key registration errors
→ Review FIX #2 (early registration)
→ Review FIX #4 (DOMContentLoaded registration)
```

---

## Test Scenario 5: BFCache Restoration ✓ Navigation Cycle

**Objective**: Verify app works correctly when returning to player page

### Steps
1. Launch app and navigate to Channels
2. Select a channel and let it load/play
3. Press HOME to go to home page (or navigate to another page)
4. Navigate back to player or previous channel
5. Observe: Should restore or re-load player
6. Verify: All buttons should work after restoration
7. Verify: Can play again

### Expected Result
```
✅ Player page restores after navigation away
✅ Previous state is preserved (if BFCache)
✅ All buttons work after restoration
✅ Can select and play channels normally
✅ No loading freezes on return
✅ No duplicate error messages
```

### If Failed
```
❌ Player page doesn't restore
❌ Buttons not responsive after returning
❌ Loading freezes on subsequent playback
❌ Recovery error appears multiple times
→ Check console for state management errors
→ Review pageshow/pagehide handlers
```

---

## Console Log Monitoring

### What You Should See (Normal Operation)

During normal channel load:
```
[PLAYER] Early key handler registered (capture phase)
[PLAYER] ... (other normal logs)
```

No messages about timeout or recovery should appear.

### What You Should See (Recovery Triggered)

When network is disabled and recovery timeout triggers:
```
[PLAYER] Initialization timeout at 15000ms - forcing recovery
[PLAYER] Loading overlay forced hidden
[PLAYER] Keyboard handler re-registered in recovery mode
```

### What You Should NOT See

```
❌ [PLAYER] Early key registration failed
❌ [PLAYER] Failed to register keys
❌ [PLAYER] Recovery: Failed to register keys
❌ Uncaught errors in player initialization
❌ Multiple duplicate timeout messages
```

---

## Quick Assessment

### ✅ Success Criteria (All Must Pass)

- [x] **Scenario 1**: Normal load works perfectly
- [x] **Scenario 2**: Slow network loads without recovery
- [x] **Scenario 3**: No-network triggers recovery correctly
- [x] **Scenario 4**: Buttons always responsive
- [x] **Scenario 5**: Navigation works smoothly

### 📊 Overall Assessment

If all scenarios pass: **✅ FIXES ARE WORKING - Ready for production**

If 4 of 5 pass: **⚠️  MOSTLY WORKING - Need minor review**

If 3 of 5 pass: **❌ NEEDS DEBUGGING - Review console logs**

If <3 pass: **❌ MAJOR ISSUE - Check code implementation**

---

## Debugging Tips

### If Test Fails

1. **Check Console Logs First**
   - Open browser/TV developer console
   - Filter for "[PLAYER]" messages
   - Look for errors or warnings

2. **Check Specific Fix**
   - Test 3 fails → FIX #1 (timeout recovery)
   - Test 4 fails → FIX #2 or FIX #4 (key registration)
   - Test 1 or 2 fail → FIX #3 (overlay removal) or setupPlayer()

3. **Review File**
   - Open `js/player.js` in editor
   - Verify all 4 fixes are present (search for "FIX #1", "FIX #2", etc.)
   - Check for syntax errors

4. **Check Network Conditions**
   - Ensure network throttling is working (for test 2)
   - Ensure network is actually disabled (for test 3)
   - Network settings may vary by TV model

### Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Buttons frozen during load | Key handler not registered | Check FIX #2 & FIX #4 |
| Loading overlay never disappears | FIX #3 not working | Verify 5 CSS properties set |
| Recovery error doesn't appear | FIX #1 timeout not working | Check timer is created and fired |
| Keys work sometimes, not always | Inconsistent registration | Ensure polling happening (FIX #2) |
| App crashes on recovery | Error message creation failed | Check FIX #1 error handling |

---

## Test Results Log

### Test Date: __________

| Scenario | Status | Notes |
|----------|--------|-------|
| 1. Normal Load | [ ] PASS [ ] FAIL | __________________ |
| 2. Slow Network | [ ] PASS [ ] FAIL | __________________ |
| 3. No Network | [ ] PASS [ ] FAIL | __________________ |
| 4. Button Response | [ ] PASS [ ] FAIL | __________________ |
| 5. BFCache | [ ] PASS [ ] FAIL | __________________ |

### Overall Result
- [ ] ✅ **ALL TESTS PASSED** - Ready for production
- [ ] ⚠️  **MOST TESTS PASSED** - Review failed tests
- [ ] ❌ **TESTS FAILED** - Debug and re-test

### Tester Name: __________ Device: __________

---

## Next Steps After Testing

### If All Tests Pass ✅
1. Document test results
2. Commit changes: `git commit -m "Fix: Player stuck loading issue"`
3. Deploy to production
4. Monitor user feedback
5. Watch for "[PLAYER]" log messages in production

### If Some Tests Fail ⚠️
1. Document which scenarios failed
2. Review console logs
3. Check the specific fix involved
4. Make corrections if needed
5. Re-run failed tests
6. Repeat until all pass

### If Major Failures ❌
1. Review codebase test report
2. Check if all 4 fixes are actually in the code
3. Compare code with EXACT_CHANGES_MADE.md
4. Verify no files were corrupted
5. Contact support if needed

---

**Remember**: These tests verify that the fixes actually work on real hardware.  
**Codebase tests** verified the code is correct.  
**Runtime tests** verify the fixes solve the real-world problem.

Good luck! 🍀
