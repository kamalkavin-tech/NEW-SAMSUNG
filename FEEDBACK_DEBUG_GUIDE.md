# Feedback API Debug Guide

## Changes Made

### 1. Fixed User Data Extraction
**Before:**
```javascript
userid: userData.userid || DEFAULT_USER.userid
mobile: userData.mobile || DEFAULT_USER.mobile
```

**After (Robust field detection):**
```javascript
var userid = userData.userid || userData.userId || userData.id || userData.username || "testuser1";
var mobile = userData.mobile || userData.phone || userData.mobilenumber || "7800000001";
```

### 2. Added Detailed Logging

The feedback submission now logs:
- User data from session
- Extracted userid and mobile
- Full payload being sent
- Complete API response
- Error codes and messages

## How to Debug

### Step 1: Open Samsung TV Console
1. Connect to Samsung TV via Tizen Studio
2. Open the console/logs panel
3. Navigate to Feedback page
4. Fill in feedback and submit

### Step 2: Check Console Logs

You should see logs like this:

```
[Feedback] Submitting feedback...
[Feedback] User data: { userid: "testuser1", mobile: "7800000001", ... }
[Feedback] Extracted userid: testuser1
[Feedback] Extracted mobile: 7800000001
[Feedback] Submitting data: { userid: "testuser1", mobile: "7800000001", feedback: "test", rating: 5 }

[FeedbackAPI] Submitting feedback: { userid: "testuser1", mobile: "7800000001", feedback: "test", rating: 5 }

[API DEBUG] URL: http://124.40.244.211/netmon/cabletvapis/feedback
[API DEBUG] Payload: {
  "userid": "testuser1",
  "mobile": "7800000001",
  "feedback": "test",
  "rating": 5
}
[API DEBUG] Headers: {
  "Content-Type": "application/json",
  "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
  "devmac": "26:F2:AE:D8:3F:99",
  "devslno": "FOFI20191129000336"
}

[Feedback] ===== API RESPONSE =====
[Feedback] Full response: { ... }
[Feedback] Response status: { err_code: 0, err_msg: "Feedback submitted" }
[Feedback] Error code: 0
[Feedback] Error message: Feedback submitted
[Feedback] ========================
```

### Step 3: Identify the Issue

#### If you see "userid: undefined" or "mobile: undefined"
**Problem**: User data not stored correctly in session
**Solution**: Check login.js to ensure it saves user data properly

#### If you see API response with err_code !== 0
**Problem**: Backend API error
**Solution**: Check the err_msg field for details. Common issues:
- "Invalid user" - userid not found in database
- "Missing fields" - Some required field is missing
- "Invalid rating" - Rating must be 1-5

#### If you see "Failed to fetch" or network error
**Problem**: Network connectivity or server down
**Solution**: Check if the server is reachable

## Expected API Request Format

**Endpoint**: `POST http://124.40.244.211/netmon/cabletvapis/feedback`

**Headers**:
```json
{
    "Content-Type": "application/json",
    "Authorization": "Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=",
    "devmac": "26:F2:AE:D8:3F:99",
    "devslno": "FOFI20191129000336"
}
```

**Payload**:
```json
{
    "userid": "testuser1",
    "mobile": "7800000001",
    "feedback": "Great service!",
    "rating": 5
}
```

**Expected Success Response**:
```json
{
    "status": {
        "err_code": 0,
        "err_msg": "Feedback submitted successfully"
    }
}
```

**Expected Error Response**:
```json
{
    "status": {
        "err_code": 1,
        "err_msg": "Invalid user ID"
    }
}
```

## Common Issues and Solutions

### Issue 1: "Please provide required details"
**Cause**: userid or mobile is missing/empty
**Fix**: Check that user is logged in and data is in session

### Issue 2: "Invalid rating"
**Cause**: Rating is 0 or outside 1-5 range
**Fix**: Ensure user selects at least 1 star

### Issue 3: "Feedback text is empty"
**Cause**: Textarea is empty
**Fix**: Already validated in code, shouldn't happen

### Issue 4: "User not found"
**Cause**: userid doesn't exist in backend database
**Fix**: Use a valid userid from your backend

### Issue 5: "Failed to fetch"
**Cause**: Network error or CORS (in browser only)
**Fix**: Test on Samsung TV emulator, not browser

## Next Steps

1. **Submit feedback again** and check the console logs
2. **Copy all the logs** from the console
3. **Share the logs** with me so I can see:
   - What userid/mobile is being sent
   - What the API response is
   - What error message is returned
4. Based on the logs, I can fix the exact issue

## Quick Test Checklist

- [ ] User is logged in (check localStorage)
- [ ] Feedback text is entered
- [ ] Rating is selected (1-5 stars)
- [ ] Submit button clicked
- [ ] Console shows request being sent
- [ ] Console shows API response
- [ ] Error message shows specific reason

## Test on TV Emulator

This will help us see the actual error from the backend:
1. Open Tizen Studio
2. Launch TV emulator
3. Deploy and run the app
4. Login with valid credentials
5. Go to Feedback page
6. Fill feedback: "Test feedback"
7. Select 5 stars
8. Click Submit
9. **Check console logs immediately**
10. Share the complete log output
