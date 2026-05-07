# Re-Signing Package with Samsung Certificate

## ✅ Your Certificates Found!

Location: `C:\Users\bavis\SamsungCertificate\NEWBBNL\`

Files you have:
- ✅ `author.p12` - Author signing certificate
- ✅ `distributor.p12` - Distributor signing certificate
- ✅ `author.pwd` - Author password (encrypted)
- ✅ `distributor.pwd` - Distributor password (encrypted)

Password: `Bbnl@1234`

---

## 📋 Step-by-Step Instructions

### Step 1: Delete Old Signature Files
```
1. Go to: d:\Github Repo\NEW-SAMSUNG
2. Delete folder: .sign
3. Delete file: BBNLIPTV.wgt
```

### Step 2: Package with Samsung IDE/SDK

**Option A: Using Tizen Studio** (RECOMMENDED)
```
1. Open Tizen Studio
2. File > Open > Project > Select: d:\Github Repo\NEW-SAMSUNG
3. Right-click on project folder
4. Select: Tizen Studio > Package > Create Unsigned Package
   OR: Export > Tizen Widget Package (.wgt)
5. When prompted for certificates:
   - Author Certificate: C:\Users\bavis\SamsungCertificate\NEWBBNL\author.p12
   - Password: Bbnl@1234
   - Distributor Certificate: C:\Users\bavis\SamsungCertificate\NEWBBNL\distributor.p12
6. Click "Create/Export"
7. Package will be created as BBNLIPTV.wgt ✅
```

**Option B: Using Command Line** (Advanced)
```bash
# Navigate to project
cd d:\Github Repo\NEW-SAMSUNG

# Package with author certificate
tizen package -t wgt -s newbbnl .

# Then sign with distributor (if needed)
tizen sign -t wgt BBNLIPTV.wgt -p C:\Users\bavis\SamsungCertificate\NEWBBNL\distributor.p12
```

### Step 3: Verify Signatures
```
1. After packaging, check if .sign folder exists
2. Check if signature files are present:
   - .sign/author-signature.xml ✓
   - .sign/signature1.xml ✓
3. Both should have proper Identifier fields
```

### Step 4: Upload to Samsung Seller Portal
```
1. Go to Samsung Seller Portal
2. Upload your signed BBNLIPTV.wgt
3. Should pass validation ✅
```

---

## What Samsung IDE Does

When you use Tizen Studio with the certificate:
1. ✅ Reads your author.p12 certificate
2. ✅ Calculates SHA-512 hashes of ALL files
3. ✅ Creates digital signature with your private key
4. ✅ Generates author-signature.xml with:
   - All file hashes
   - Cryptographic signature value
   - Your certificate chain
   - Proper Identifier field
5. ✅ Creates signature1.xml (distributor signature)
6. ✅ Packages everything into BBNLIPTV.wgt

---

## Why This Works

The **Tizen Studio** will:
- ✅ Use YOUR certificate (not generic)
- ✅ Create valid cryptographic signatures
- ✅ Include all required XML elements
- ✅ Automatically fill in Identifier fields
- ✅ Create hashes that match actual files
- ✅ Package in Samsung's expected format

---

## Important Notes

1. **You MUST use Tizen Studio or Samsung SDK** - Manual XML editing won't work because signatures are cryptographic
2. **The password `Bbnl@1234` is correct** - This unlocks your private key
3. **After signing, DO NOT modify any files** - This breaks the signature
4. **Upload the final BBNLIPTV.wgt directly to Samsung**

---

## Troubleshooting

**If Tizen Studio asks for "security profile":**
- Look for: `device-profile.xml` in your certificate folder
- Or create a new profile using your certificates

**If packaging fails:**
- Make sure config.xml is valid (version 1.0.4)
- Ensure all files have proper permissions
- Check Tizen Studio logs for detailed error

**If upload still fails:**
- Verify signature files in .sign folder
- Check that Identifier fields are NOT empty
- Ensure all file hashes are correct (check .manifest.tmp)

---

## Certificate Details

**Author Certificate**
- Location: C:\Users\bavis\SamsungCertificate\NEWBBNL\author.p12
- Password: Bbnl@1234
- Subject: BBNL IPTV

**Distributor Certificate**
- Location: C:\Users\bavis\SamsungCertificate\NEWBBNL\distributor.p12
- Issued by: Samsung Electronics

---

**Status**: Ready to sign ✅  
**Next Action**: Open Tizen Studio and package with certificates  
**Expected Result**: Valid BBNLIPTV.wgt file that uploads successfully

Good luck! 🚀
