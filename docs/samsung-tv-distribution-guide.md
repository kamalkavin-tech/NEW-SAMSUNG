# Samsung TV App Distribution Guide

## Overview

All ready applications can be released on **Samsung Apps TV**. After requesting a release, Samsung reviews and tests the application before publishing.

**Three distribution methods:**

| Method | Audience | Approval | Max TVs | Max Duration |
|--------|----------|----------|---------|--------------|
| **Release** | All TV users | Samsung review + verification | All | Permanent |
| **Beta Test** | End users with activation code | Samsung Content Manager approval | 1000 codes | 90 days (extendable to 180) |
| **Alpha Test** | Developer's own TVs (partner sellers only) | No approval needed | 50 TVs | 30 days |

---

## 1. Publishing to Samsung Apps TV (New Release)

### Steps

1. Go to **Applications > Distribute** and click **"Request New Release"**
2. Select the application version to launch (upload via "Upload App" if not listed)
3. Select Smart TV model group(s)
4. Enter release information
5. Click **"Next"** for pre-test validation
6. Click **"Done"** to submit

### Model Group Selection Rules

- Tizen .NET apps: TV model groups **2018 and later** only
- Cannot select model groups with ongoing certification/verification (cancel first)
- Cannot select model groups with unresolved defects
- Cannot select model groups where same or higher version is already submitted
- Samsung Checkout apps: only model groups that support Samsung Checkout
- FCC-regulated model groups: must support **Caption and TTS** functions
- Cloud game mode on TVs under 2021: requires prior consultation with Samsung
- When selecting a model group, **all Tizen versions** in that group are included

### Release Information Fields

**What's new in this version**
- Shown on Samsung Apps TV app details screen
- Must be entered for each supported language
- Cannot be modified after release

**Mandatory update option**
- **Mandatory**: User must update or cannot run the app. Use only when necessary (e.g., critical fixes)
- **Optional**: User can choose "Update Now" or "Later" and still run the old version

**Note for tester**
- Delivered to Samsung's verifier during testing

**Agree to release with minor defects?**
- If agreed, Samsung may release with minor defects without seller confirmation
- Serious defects will NOT be released

### Pre-test Checks

- App title in default language must match the title in `config.xml`
- Samsung Checkout: privilege API must be defined in config, DPI account registered, sandbox purchase tested
- In-app AD: related privilege API must be in config
- "Built in app" property cannot be changed once set (need new App ID)

### Certification & Verification Process

```
Request Release → Submitted → Testing → Waiting Launch → Launched
                     ↓            ↓
                  Rejected       Fail
```

| Status | Description |
|--------|-------------|
| **Submitted** | Release requested, Samsung reviewing |
| **Testing** | Basic review passed, verification test in progress |
| **Rejected** | Problem found during basic review |
| **Fail** | Defect found during verification test |
| **Waiting Launch** | Passed verification, ready for release |
| **Launched** | Successfully released on TV |
| **Dropped** | Release request cancelled |

### Important Notes

- Provide **enough test accounts** (>= number of model groups) in Verification Info
- Insufficient test accounts = verification failure
- Application testing happens **simultaneously** across all requested model groups
- If previous versions should lose functionality, inform Samsung via **1:1 Q&A**

### Cancel Release Request

- Can cancel before release for each model group
- Use **"Drop"** button on model groups in Submitted/Testing/Waiting Launch status
- After release, must **stop service** instead of cancelling

---

## 2. Beta Test

### Purpose

Distribute beta to end users before official launch for:
- Usability assessment of new features
- Identifying problems via beta testing

### Requirements

- Application info (except Verification Info) must be fully entered
- App service must not be stopped
- Available on Smart TVs from **2021 onwards**
- Closed beta: only TVs with activation code can install

### Creating a Beta Test

1. Go to **Applications > Distribute** and click **"Create Beta Test"**
2. Select version (unreleased or previously beta-tested)
3. Select TV model group(s)
4. Set test period (max **90 days**)
5. Enter activation code info:
   - **5-digit alphabetic prefix** (must be unique)
   - Approximate number of testers (up to **1000 codes**, request more via 1:1 Q&A)
6. Write user precautions (recommended in multiple languages)
7. Click **"Next"** for pre-test, then **"Done"**

### Beta Test Status Flow

```
Create → Beta Test under Approval → Beta Test Waiting → Beta Testing → Beta Test Closed
                    ↓
             Beta Test Returned (rejected)
```

| Status | Description |
|--------|-------------|
| **Beta Test under Approval** | Waiting for Samsung Content Manager approval |
| **Beta Test Waiting** | Approved, test not yet started (auto-opens at start date) |
| **Beta Testing** | Test in progress, testers can participate |
| **Beta Test Closed** | Test ended |
| **Beta Test Returned** | Rejected at approval stage (reason sent via email) |

### Activation Codes

- Issued after beta test approval
- Download from **"Activation Code"** button on Beta Test list
- Provided as CSV text file
- Each code is **one-time use** per TV activation
- Can issue up to **1000 additional codes** during testing
- For more than 1000 total, request via 1:1 Q&A

### Modifiable Information by Status

| Info | Under Approval | Waiting | Testing | Closed/Returned |
|------|---------------|---------|---------|-----------------|
| Version | Yes | Upgrade only | Upgrade only | No |
| Model Group | Yes | Yes | Add only | No |
| Test Period | Yes | Yes | End date only | No |
| Code Quantity | Yes | Expand only | Expand only | No |
| Code Prefix | Yes | No | No | No |
| User Precautions | Yes | Yes | Yes | No |

### Beta Tester Process

1. On TV **Settings** screen, enter hidden key **`134678`** with remote
2. Enter activation code to authenticate
3. Beta installation screen appears
4. Click **"..."** to read precautions
5. Agree to precautions → **"Install"** button activates
6. Install and start testing

**To leave beta:**
- Select app icon in "Downloaded App" list → press and hold **1+ second** → "Leave"
- Or select app icon in Settings → "Leave"
- Normal version (if exists) auto-reinstalls; otherwise beta app is deleted

### Cancel vs Close

- **Cancel**: For tests in "Under Approval" or "Waiting" status. Deletes test info immediately
- **Close**: For tests in "Beta Testing" status. Ends test, beta version removed from tester TVs

---

## 3. Alpha Test (Partner Sellers Only)

### Purpose

Distribute alpha version to developer's own TVs for real-environment testing during development.

### Key Differences from Beta

| | Alpha | Beta |
|--|-------|------|
| Audience | Developer TVs only | End users |
| Approval | No approval needed | Samsung Content Manager |
| Max TVs | 50 | 1000 activation codes |
| Max Duration | 30 days | 90 days (extendable to 180) |
| Availability | Partner sellers only | All sellers |
| TV Support | 2020+ (except Chinese TVs) | 2021+ |

### Requirements

- Basic service information must be entered
- App service must not be stopped
- Only **one alpha test at a time**
- Only versions in **"Ready to Submit"** status (unreleased)

### Creating an Alpha Test

1. Go to **Applications > Distribute** and click **"Create Alpha Test"**
2. Select version to test
3. Set test duration (max **30 days**)
4. Click **"Add DUID"** to register test TVs (up to **50 TVs**)
   - Can select from devices registered in **Membership > Device List**
   - DUID = Unique ID from **TV Menu > Support > About This TV > Smart Hub Information**
5. Click **"Done"** — alpha test starts immediately

### DUID Registration Troubleshooting

If DUID registration fails:
- TV may not support alpha testing or may not match app architecture
- TV must have used **Smart Service** within the last **6 months**
- Check: 1) TV connected to network, 2) Recently used Smart Service
- If not used recently: use Smart Service on that TV, wait **at least 8 hours**, try again

### Modifying Alpha Test

- **Test period**: Can advance end date or extend up to 30 days. Ended tests can restart with new 30-day period
- **Test TVs**: Can add/remove DUIDs (max 50 per test)
- **Version**: Can start new test with previously tested version

### Stopping Alpha Test

- Click **"Close Alpha Test"** on Alpha Test page
- Or use **"Edit"** to change end date
- Status changes to **"Alpha Test Closed"**

---

## 4. Compatibility Version Submission

### Purpose

When Samsung releases new TV models or Tizen versions, they test existing apps for compatibility. If issues are found, sellers must submit a fixed version.

### Process

1. Review issues in **Applications > Compatibility Defect** menu
2. Go to **Applications > Distribute** and click **"Submit Compatibility Version"**
3. Select fixed version (upload if not listed)
4. Select model group(s) — only groups with all compatibility defects resolved
5. Click **"Next"** for pre-test, then **"Done"**

### Rules

- Cannot submit while app service is stopped
- Cannot submit beta/alpha test versions as compatibility versions
- Same pre-test checks as new release (title match, Checkout, AD privileges, etc.)

---

## 5. Resolving Defects

If defects are found during verification:
1. Check **Applications > Defect Resolve** menu for reported issues
2. Fix the issues in your application
3. Resubmit the application

### Tips to Reduce Defects

- Test comprehensively before submitting
- Ensure Caption/TTS for FCC-regulated regions
- Verify Samsung Checkout integration in DPI sandbox
- Match app title in default language with `config.xml`
- Provide sufficient test accounts for all model groups

---

## Quick Reference

### Version Submission Rules

- Cannot submit a beta/alpha test version as a release version
- Cannot submit to a model group with an ongoing submission of same/higher version
- A new version cannot be released while app service is stopped
- "Built in app" property is permanent — need new App ID to change

### Key Contacts

- **App Working Group**: appwg.vd@samsung.com (for "Built in app" property questions)
- **Samsung Content Manager**: For cloud game mode consultation, Tizen version-specific releases
- **1:1 Q&A** (Seller Office): For additional activation codes, notifying about previous version deprecation

### Hidden Key for Beta Test

```
TV Settings → Remote key: 134678 → Enter activation code
```

### DUID Location

```
TV Menu → Support → About This TV → Smart Hub Information → Unique ID
```
