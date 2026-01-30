# 🧹 PROJECT CLEANUP INSTRUCTIONS

## ⚠️ CRITICAL: Remove node_modules from Main Project

Your Tizen app should **NEVER** have `node_modules` in the root folder.

---

## 📋 STEP-BY-STEP CLEANUP

### ✅ STEP 1: Delete These Files/Folders from Root

**Delete from:** `c:\Users\kamal\NEW-SAMSUNG\`

```
❌ DELETE: node_modules/          (if exists)
❌ DELETE: package.json            (if exists in root)
❌ DELETE: package-lock.json       (if exists in root)
```

**How to delete:**

**Option A - Windows Explorer:**
1. Open `c:\Users\kamal\NEW-SAMSUNG`
2. Select `node_modules` folder (if exists)
3. Press `Shift + Delete` (permanent delete)
4. Delete `package.json` and `package-lock.json` (if they exist in root)

**Option B - Command Prompt:**
```cmd
cd c:\Users\kamal\NEW-SAMSUNG
rmdir /s /q node_modules
del package.json
del package-lock.json
```

---

### ✅ STEP 2: Keep These Files (DO NOT DELETE)

```
✅ KEEP: .buildignore            (just created)
✅ KEEP: .gitignore               (just created)
✅ KEEP: config.xml
✅ KEEP: *.html files
✅ KEEP: js/ folder
✅ KEEP: css/ folder
✅ KEEP: images/ folder
✅ KEEP: bbnl-proxy/ folder       (entire folder - has its own node_modules)
```

---

### ✅ STEP 3: Install Proxy Dependencies (ONLY in bbnl-proxy)

```cmd
cd c:\Users\kamal\NEW-SAMSUNG\bbnl-proxy
npm install
```

This will create `node_modules` **ONLY inside bbnl-proxy/** folder.

---

### ✅ STEP 4: Refresh Tizen Studio

1. Open **Tizen Studio**
2. Right-click on your project → **Refresh** (or press F5)
3. The validation errors should be **GONE**

---

### ✅ STEP 5: Clean and Build

1. Right-click project → **Clean Project**
2. Right-click project → **Build Project**
3. Errors should be **ZERO**

---

### ✅ STEP 6: Build WGT Package

**Method 1 - Tizen Studio:**
1. Right-click project → **Build Signed Package**
2. Select your certificate profile
3. Package created: `BasicProject2.wgt`

**Method 2 - Command Line:**
```cmd
cd c:\Users\kamal\NEW-SAMSUNG
tizen package -t wgt -s YourCertificateProfile -- .
```

---

### ✅ STEP 7: Deploy to TV

```cmd
# Connect to TV
sdb connect YOUR_TV_IP_ADDRESS

# List devices
sdb devices

# Install app
tizen install -n BasicProject2.wgt -t YOUR_TV_NAME

# Run app
tizen run -p ph3Ha7N8EQ.BasicProject2 -t YOUR_TV_NAME
```

---

## 📁 CORRECT FINAL STRUCTURE

```
c:\Users\kamal\NEW-SAMSUNG\
│
├── .buildignore              ✅ NEW - Excludes files from WGT
├── .gitignore                ✅ NEW - Git ignore rules
├── config.xml                ✅ Tizen app config
├── index.html                ✅ App files
├── login.html                ✅
├── verify.html               ✅
├── home.html                 ✅
├── channels.html             ✅
├── player.html               ✅
├── *.html                    ✅ Other HTML files
│
├── js/                       ✅ JavaScript files
│   ├── api.js
│   ├── main.js
│   ├── channels.js
│   ├── player.js
│   └── ...
│
├── css/                      ✅ Stylesheets
│   └── ...
│
├── images/                   ✅ Images/assets
│   └── ...
│
├── db.json                   ✅ Mock data (optional)
│
└── bbnl-proxy/              ✅ Proxy server (EXCLUDED from WGT)
    ├── node_modules/        ✅ Dependencies (ONLY here!)
    ├── package.json         ✅
    ├── package-lock.json    ✅
    └── server.js            ✅
```

---

## ✅ VERIFICATION CHECKLIST

After cleanup, verify:

- [ ] `c:\Users\kamal\NEW-SAMSUNG\node_modules` **DOES NOT EXIST**
- [ ] `c:\Users\kamal\NEW-SAMSUNG\package.json` **DOES NOT EXIST** (or is deleted)
- [ ] `c:\Users\kamal\NEW-SAMSUNG\.buildignore` **EXISTS**
- [ ] `c:\Users\kamal\NEW-SAMSUNG\bbnl-proxy\node_modules` **EXISTS**
- [ ] `c:\Users\kamal\NEW-SAMSUNG\bbnl-proxy\package.json` **EXISTS**
- [ ] Tizen Studio shows **0 errors**
- [ ] Can build WGT package **successfully**
- [ ] Can deploy to TV **successfully**

---

## 🚨 IMPORTANT RULES

### ❌ NEVER DO THIS:
```cmd
# DON'T run npm install in main project folder
cd c:\Users\kamal\NEW-SAMSUNG
npm install    # ❌ WRONG!
```

### ✅ ALWAYS DO THIS:
```cmd
# ONLY run npm install in bbnl-proxy folder
cd c:\Users\kamal\NEW-SAMSUNG\bbnl-proxy
npm install    # ✅ CORRECT!
```

---

## 🎯 SUMMARY

1. **DELETE** `node_modules/` from main folder
2. **DELETE** `package.json` from main folder (if exists)
3. **KEEP** `bbnl-proxy/node_modules/` (proxy dependencies)
4. **REFRESH** Tizen Studio (F5)
5. **BUILD** WGT package
6. **DEPLOY** to TV

**All validation errors will be gone!** ✅

---

## 📞 NEED HELP?

If errors persist after cleanup:
1. Close Tizen Studio
2. Delete `.buildResult/` and `.sign/` folders
3. Re-import project in Tizen Studio
4. Build again

---

**Last Updated:** $(date)
**Status:** Ready for cleanup
