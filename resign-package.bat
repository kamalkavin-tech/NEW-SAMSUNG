



@echo off
REM Samsung Tizen Package Re-signing Script
REM This script will re-sign your BBNLIPTV.wgt with proper certificates

echo.
echo ================================================
echo  BBNL IPTV Package Re-signing Tool
echo ================================================
echo.

setlocal enabledelayedexpansion

REM Set paths
set CERT_DIR=C:\Users\bavis\SamsungCertificate\NEWBBNL
set PROJECT_DIR=d:\Github Repo\NEW-SAMSUNG
set AUTHOR_CERT=%CERT_DIR%\author.p12
set DISTRIBUTOR_CERT=%CERT_DIR%\distributor.p12
set AUTHOR_PASSWORD=Bbnl@1234

echo [Step 1] Checking certificates...
if not exist "%AUTHOR_CERT%" (
    echo ERROR: Author certificate not found at %AUTHOR_CERT%
    pause
    exit /b 1
)
if not exist "%DISTRIBUTOR_CERT%" (
    echo ERROR: Distributor certificate not found at %DISTRIBUTOR_CERT%
    pause
    exit /b 1
)
echo OK - Certificates found


echo.
echo [Step 2] Backing up old package...
cd /d "%PROJECT_DIR%"
if exist BBNLIPTV.wgt (
    move BBNLIPTV.wgt BBNLIPTV.wgt.backup
    echo OK - Backup created: BBNLIPTV.wgt.backup
) else (
    echo WARNING - No existing BBNLIPTV.wgt found
)

echo.
echo [Step 3] Removing old signature files...
if exist .sign (
    rmdir /s /q .sign
    echo OK - Old signatures removed
)

echo.
echo [Step 4] Creating new package...
REM This depends on your build system - could be Maven, Gradle, or custom
echo Attempting to build using Tizen CLI...
tizen package -t wgt -s NEWBBNL .

echo.
echo ================================================
echo  IMPORTANT - Next Steps (Do These Manually):
echo ================================================
echo.
echo 1. Open your Tizen IDE or Samsung SDK
echo 2. Right-click on the project folder
echo 3. Select: Tizen Studio ^> Package ^> Create Unsigned Package
echo    OR: Right-click ^> Package ^> Export ^> Export to Tizen Widget Package
echo 4. When it asks for certificates, use these:
echo    - Author Certificate: %AUTHOR_CERT%
echo    - Password: Bbnl@1234 (or check author.pwd file)
echo 5. The package will be signed automatically
echo 6. Verify BBNLIPTV.wgt is created and ready
echo.
echo ================================================
echo.
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ================================================
    echo  SUCCESS! BBNLIPTV.wgt has been generated.
    echo  You can now upload it to the Samsung Seller Portal.
    echo ================================================
) else (
    echo.
    echo ================================================
    echo  ERROR: Tizen CLI failed or is not installed.
    echo  Please open Tizen Studio, right-click the project,
    echo  and select 'Package > Create Unsigned Package'.
    echo ================================================
)

pause
