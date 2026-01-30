@echo off
REM ============================================
REM BBNL TIZEN PROJECT CLEANUP SCRIPT
REM ============================================
REM This script removes node_modules from the
REM main project folder to fix Tizen Studio
REM validation errors
REM ============================================

echo.
echo ============================================
echo BBNL TIZEN PROJECT CLEANUP
echo ============================================
echo.

REM Get current directory
set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo Current Directory: %CD%
echo.

REM ============================================
REM STEP 1: Check for node_modules in root
REM ============================================

echo [STEP 1] Checking for node_modules in root...
if exist "node_modules" (
    echo.
    echo WARNING: node_modules folder found in root!
    echo This should NOT be here for Tizen apps.
    echo.
    choice /C YN /M "Delete node_modules from root folder"
    if errorlevel 2 (
        echo Skipped deletion of node_modules
    ) else (
        echo Deleting node_modules...
        rmdir /s /q "node_modules"
        echo ✓ node_modules deleted
    )
) else (
    echo ✓ No node_modules in root (Good!)
)
echo.

REM ============================================
REM STEP 2: Check for package.json in root
REM ============================================

echo [STEP 2] Checking for package.json in root...
if exist "package.json" (
    echo.
    echo WARNING: package.json found in root!
    echo This should only be in bbnl-proxy folder.
    echo.
    choice /C YN /M "Delete package.json from root folder"
    if errorlevel 2 (
        echo Skipped deletion of package.json
    ) else (
        echo Deleting package.json...
        del /q "package.json"
        echo ✓ package.json deleted
    )
) else (
    echo ✓ No package.json in root (Good!)
)
echo.

REM ============================================
REM STEP 3: Check for package-lock.json in root
REM ============================================

echo [STEP 3] Checking for package-lock.json in root...
if exist "package-lock.json" (
    echo Deleting package-lock.json...
    del /q "package-lock.json"
    echo ✓ package-lock.json deleted
) else (
    echo ✓ No package-lock.json in root (Good!)
)
echo.

REM ============================================
REM STEP 4: Clean build artifacts
REM ============================================

echo [STEP 4] Cleaning build artifacts...

if exist ".buildResult" (
    echo Deleting .buildResult...
    rmdir /s /q ".buildResult"
    echo ✓ .buildResult deleted
)

if exist ".sign" (
    echo Deleting .sign...
    rmdir /s /q ".sign"
    echo ✓ .sign deleted
)

if exist "*.wgt" (
    echo Deleting old .wgt packages...
    del /q "*.wgt"
    echo ✓ Old packages deleted
)
echo.

REM ============================================
REM STEP 5: Verify bbnl-proxy structure
REM ============================================

echo [STEP 5] Verifying bbnl-proxy folder...

if exist "bbnl-proxy" (
    echo ✓ bbnl-proxy folder exists

    if exist "bbnl-proxy\package.json" (
        echo ✓ bbnl-proxy\package.json exists
    ) else (
        echo ✗ WARNING: bbnl-proxy\package.json missing!
    )

    if exist "bbnl-proxy\server.js" (
        echo ✓ bbnl-proxy\server.js exists
    ) else (
        echo ✗ WARNING: bbnl-proxy\server.js missing!
    )

) else (
    echo ✗ WARNING: bbnl-proxy folder not found!
)
echo.

REM ============================================
REM STEP 6: Verify .buildignore exists
REM ============================================

echo [STEP 6] Verifying .buildignore file...

if exist ".buildignore" (
    echo ✓ .buildignore exists
) else (
    echo ! .buildignore not found (create it to exclude files from WGT)
)
echo.

REM ============================================
REM SUMMARY
REM ============================================

echo ============================================
echo CLEANUP COMPLETE
echo ============================================
echo.
echo Next Steps:
echo.
echo 1. Open Tizen Studio
echo 2. Right-click project → Refresh (F5)
echo 3. Right-click project → Clean Project
echo 4. Right-click project → Build Project
echo 5. Build Signed Package
echo.
echo The validation errors should be GONE!
echo.
echo ============================================
echo.

pause
