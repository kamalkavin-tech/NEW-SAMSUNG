# BBNL IPTV — Login API Specification

Source: extracted from `js/api.js`, `js/main.js`, `js/settings.js` in this repo.

## Current Updates (As of May 12, 2026)

- Completed scan of login-related implementation in `js/api.js`, `js/main.js`, and `js/settings.js`.
- Confirmed active login endpoint, resend OTP endpoint, add MAC endpoint, and logout endpoint.
- Documented default headers currently sent by the app, including `Authorization`, `devmac`, `devslno`, and `deviceID`.
- Documented OTP request and verify payload fields exactly as sent by current client code.
- Confirmed session behavior: user session is stored in `localStorage` as `bbnl_user` after successful auth flow.
- Confirmed there is no dedicated heartbeat endpoint in current repository.
- Added known constraints where backend behavior is not visible from client code (validation rules remain backend-defined).

**Endpoints**
- **Login (OTP request & verify)**: `https://bbnlnetmon.bbnl.in/prod/cabletvapis/login`
  - Method: `POST`
  - Usage: used by `AuthAPI.requestOTP` and `AuthAPI.verifyOTP` in `js/api.js`.
- **Resend OTP**: `https://bbnlnetmon.bbnl.in/prod/cabletvapis/loginOtp`
  - Method: `POST`
  - Usage: `AuthAPI.resendOTP` calls this.
- **Add MAC**: `https://bbnlnetmon.bbnl.in/prod/cabletvapis/addmacnew`
  - Method: `POST`
- **Logout**: `https://bbnlnetmon.bbnl.in/prod/cabletvapis/userLogout`
  - Method: `POST`
  - Usage: `BBNL_API.logout()` in `js/api.js` / invoked from `handleLogout()` in `js/settings.js`.

**Default Required Headers** (set in `js/api.js` as `DEFAULT_HEADERS`)
- `Content-Type`: `application/json`
- `Authorization`: `Basic Zm9maWxhYkBnbWFpbC5jb206MTIzNDUtNTQzMjE=` (app uses this Basic header by default)
- `X-App-Package`: `com.lgiptv.bbnl`
- `devmac`: (populated at runtime from `DeviceInfo` when available)
- `devslno`: (populated with device serial/duid)
- `deviceID`: (same value as `devslno`; header name is exactly `deviceID`)

Notes:
- `DeviceInfo.initializeDeviceInfo()` attempts to populate `devmac`, `devslno`, and `deviceID` before API calls. If not available (emulator/browser), these may be empty strings.

**Login (OTP) — Request Payload** (`AuthAPI.requestOTP`)
- Sent JSON body fields:
  - `mobile` (string) — the phone number entered by the user (UI uses a `+91` country-code label and passes the 10-digit number value)
  - `mac_address` (string) — `DeviceInfo.getDeviceInfo().mac_address` (may be empty)
  - `device_name` (string)
  - `ip_address` (string)
  - `device_type` (string) — app sets default `FOFI_SAMSUNG` in `DEVICE_INFO`
  - `devslno` (string) — device serial/duid
  - `ipv6` (string)
  - `getuserdet` (string) — sometimes included as empty string
  - `devdets` (object) — full device details object from `DeviceInfo.getDevDets()` (see below)
  - `app_package` (string) — `APP_ID` read from `config.xml` or Tizen API

**Verify OTP — Payload** (`AuthAPI.verifyOTP`)
- Sent JSON body fields (example):
  - `mobile`, `otpcode`, `mac_address`, `device_type`, `device_id`, `devslno`, `ip_address`, `ipv6_address`, `getuserdet`, `devdets`, `app_package`.
- On successful verify the code calls `AuthAPI.setSession(response)` which persists `bbnl_user` into `localStorage` (server must return `userid` in `response.body[0]`).

**Logout Payload** (`BBNL_API.logout`)
- JSON body fields:
  - `userid`, `mobile`, `mac_address`, `device_name`, `ip_address`, `device_type`, `devslno`, `ipv6`

**DevDets Object (`DeviceInfo.getDevDets()`)**
- Contains: `brand`, `model`, `mac`, `softwareversion`, `tizenversion`, `connection_type`, `ip_address`, `ipv6`, `dns`, `gateway_ip`, `screen_resolution`, `deviceID`.
- The code sends this `devdets` object with login payloads. Field values may be empty if the TV API does not expose them.

**Answers to your explicit questions**
- Exact login URL: `https://bbnlnetmon.bbnl.in/prod/cabletvapis/login`
- Request method: `POST` (JSON body)
- Exact header name for device id: `deviceID` (also `devslno`/`devmac` are sent)
- Any auth header required: `Authorization` (Basic) is included by default in `DEFAULT_HEADERS`.

- Required body fields for OTP request: `mobile` plus device info fields are sent; `mobile` should always be provided by the client UI.
  - `userid` is returned by the backend after successful verify — clients do not send `userid` when requesting OTP. So `userid` can be empty prior to verify (it is produced by server).
  - `mobile` is expected to be provided by the client UI; in this app the UI passes a 10-digit number (country-code displayed separately as `+91`).
  - `mac_address` may be empty on some platforms/emulators — server should tolerate missing mac values.

- Optional fields: the `devdets` object and fields like `ip_address`, `devdets.brand`, `devdets.model`, `devdets.mac`, `devdets.softwareversion` are sent by the client when available. They are included in every login API call as the app gathers device info, but individual properties may be empty.
  - Recommendation: store them server-side if you need device inventory/diagnostics; otherwise treat them as optional metadata.

- When the API is called:
  - `requestOTP` → called when user taps "Get OTP" on the login screen (before navigating to `verify.html`).
  - `verifyOTP` → called (in this app) during OTP verification flows; the app first does a client-side OTP compare and then `AuthAPI.setSession()` is called using the server response already obtained during `requestOTP` (server may return session data).
  - There is no separate password-login flow in this codebase; OTP flow is primary.
  - It is not called on every app open — only during login flows. The app persists `bbnl_user` in `localStorage` and skips login pages when present.

- Logout API: Yes — `https://bbnlnetmon.bbnl.in/prod/cabletvapis/userLogout` (POST). Payload includes `userid`, `mobile`, `mac_address`, `device_name`, `ip_address`, `device_type`, `devslno`, `ipv6`.

- Activity/heartbeat API: No dedicated heartbeat endpoint is present in this repository. If you need last-seen/keepalive, add a new endpoint (e.g., `/heartbeat`) and call it periodically from the app.

- Unique IDs:
  - `userid`: server-side user identifier returned by login/verify responses. Only available after server authenticates user.
  - `deviceID` / `devslno`: app-resolved device unique identifier (DUID/Tizen id) — on real TVs this is stable and unique per physical device; in browsers the app generates a per-session or cached ID.
  - `devmac`: device MAC address when available (may be empty in some environments).

- Data format rules and conventions:
  - `mobile`: UI passes a 10-digit number (country-code `+91` shown separately). The app sends `mobile` exactly as entered by user (10 digits in this UI). Confirm with backend whether full E.164 is required; current client sends local 10-digit value.
  - `mac_address`: may be uppercase or lowercase depending on platform — the client sends whatever `webapis.network.getMac()` returns. Backend should accept either, or normalize to uppercase on receipt.
  - `device_type`: appears as app-defined values (e.g. `FOFI_SAMSUNG`) — treat as a fixed enumerated type produced by the client.

**Confidence / Coverage**
- I extracted these details from `js/api.js`, `js/main.js`, and `js/settings.js` in this workspace. Based on the code, I am ~90% confident about the endpoints, headers, payload fields, and when they are called. Remaining uncertainty: exact backend validation rules (e.g., strict mobile format, MAC required vs optional) — those are implementation details on the server.

---

File generated from repository scan on May 12, 2026.
