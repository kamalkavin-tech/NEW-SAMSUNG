# Fo-Fi TV - Samsung Tizen TV Installation Guide

## All Installation Methods (Overview)

| # | Method | Needs Tizen Studio? | Difficulty | Best For |
|---|--------|-------------------|------------|----------|
| 1 | **Pre-built .wgt + SDB** | No | Easy | Client testing (Recommended) |
| 2 | **Pre-built .wgt + USB** | No | Easy | No PC needed |
| 3 | **Tizen Studio IDE** | Yes | Medium | Developer full setup |
| 4 | **Tizen CLI only** | Partial | Medium | Lightweight developer setup |
| 5 | **Samsung Seller Office** | No | Hard | Production/Store release |

### Installation Flow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    INSTALLATION FLOW CHART                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Developer PC                        Samsung TV                │
│   ┌──────────┐                       ┌──────────┐              │
│   │  Source   │                       │  Enable  │              │
│   │  Code     │                       │  Dev Mode│              │
│   └────┬─────┘                       └────┬─────┘              │
│        │                                  │                     │
│        ▼                                  │                     │
│   ┌──────────┐                            │                     │
│   │  Build   │                            │                     │
│   │  .wgt    │                            │                     │
│   └────┬─────┘                            │                     │
│        │                                  │                     │
│        ├──────── Method 1: SDB ──────────►│                     │
│        │         (WiFi / Network)         │                     │
│        │                                  │                     │
│        ├──────── Method 2: USB ──────────►│                     │
│        │         (Flash Drive)            │                     │
│        │                                  │                     │
│        └──────── Method 3: IDE ──────────►│                     │
│                  (Tizen Studio)           │                     │
│                                           ▼                     │
│                                    ┌──────────┐                │
│                                    │  App     │                │
│                                    │  Running │                │
│                                    └──────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Common Step: Enable Developer Mode on Samsung TV

**This is required for ALL methods (except USB).**

```
┌─────────────────────────────────────────────────────────┐
│                 SAMSUNG TV REMOTE                        │
│                                                         │
│  Step 1: Turn ON TV                                     │
│           │                                             │
│           ▼                                             │
│  Step 2: Open "Apps" panel from Home Screen             │
│           │                                             │
│           ▼                                             │
│  Step 3: Press ① ② ③ ④ ⑤ on remote                    │
│           │                                             │
│           ▼                                             │
│  Step 4: Toggle "Developer Mode" → ON                   │
│           │                                             │
│           ▼                                             │
│  Step 5: Enter your PC's IP address                     │
│           │                                             │
│           ▼                                             │
│  Step 6: Restart TV                                     │
└─────────────────────────────────────────────────────────┘
```

### Find Your PC's IP Address

**Windows:**
```cmd
ipconfig
```
Look for `IPv4 Address` under your active network adapter (e.g., `192.168.1.50`)

**Linux:**
```bash
ip addr show
# OR
hostname -I
# OR
ifconfig
```
Look for the IP address under your active interface (e.g., `wlan0` for WiFi, `eth0` for Ethernet)

### Find Your TV's IP Address

On the TV: **Settings > General > Network > Network Status**

```
┌───────────────────────────────────────────────┐
│         TV Network Status Screen               │
│                                                │
│    Network: Connected ✓                        │
│    IP Address: 192.168.1.100  ◄── Note this   │
│    Subnet: 255.255.255.0                       │
│    Gateway: 192.168.1.1                        │
│    DNS: 192.168.1.1                            │
└───────────────────────────────────────────────┘
```

> **IMPORTANT:** Both your PC/Laptop and Samsung TV must be on the **same WiFi network**.

---

## METHOD 1: Pre-built .wgt + SDB (No Tizen Studio - Recommended)

**This is the easiest way for clients to test. The developer builds the .wgt file once and shares it.**

```
┌─────────────────────────────────────────────────────────────────┐
│                   METHOD 1 FLOW                                 │
│                                                                 │
│  Developer                    Client                            │
│  ┌─────────┐                 ┌─────────────┐                   │
│  │ Build   │   Share .wgt    │ Download    │                   │
│  │ .wgt    │ ──────────────► │ .wgt file + │                   │
│  │ file    │  (Drive/Email)  │ SDB tool    │                   │
│  └─────────┘                 └──────┬──────┘                   │
│                                     │                           │
│                                     ▼                           │
│                              ┌─────────────┐                   │
│                              │ Connect to  │                   │
│                              │ TV via SDB  │                   │
│                              └──────┬──────┘                   │
│                                     │                           │
│                                     ▼                           │
│                              ┌─────────────┐  ┌──────────┐    │
│                              │ sdb install │──►│ App runs │    │
│                              │ .wgt file   │  │ on TV!   │    │
│                              └─────────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### What the Developer Does (One Time)

1. Build the `.wgt` package using Tizen Studio (see Method 3, Step 5)
2. Share the `.wgt` file with the client (via email, Google Drive, USB, etc.)

### What the Client Does

#### Step 1: Download SDB (Samsung Debug Bridge) Only

SDB is a small standalone tool (~5MB). No need to install full Tizen Studio (2GB+).

**Option A: Extract from Tizen Studio installer (Recommended)**
1. Download Tizen Studio from: https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html
2. During install, choose **Custom** and install ONLY "Tizen SDK tools"

**SDB Location after install:**

| OS | SDB Path |
|----|----------|
| Windows | `C:\tizen-studio\tools\sdb.exe` |
| Linux | `~/tizen-studio/tools/sdb` |
| macOS | `~/tizen-studio/tools/sdb` |

**Option B: From existing Tizen Studio installation**
- Copy the `sdb` binary from the tools folder (see paths above)
- On Linux, also ensure it has execute permission: `chmod +x sdb`
- That's all you need - just the sdb tool

---

### Linux Instructions (Method 1)

#### Step 1: Install SDB on Linux

```bash
# Download Tizen Studio CLI installer for Linux
# From: https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html

# After downloading the .bin installer:
chmod +x web-ide_Tizen_Studio_5.6_ubuntu-64.bin
./web-ide_Tizen_Studio_5.6_ubuntu-64.bin

# During install, choose Custom → install ONLY "Tizen SDK tools"
# SDB will be installed at:
# ~/tizen-studio/tools/sdb
```

**Add SDB to your PATH (optional but recommended):**

```bash
# Add to ~/.bashrc or ~/.zshrc
echo 'export PATH="$HOME/tizen-studio/tools:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Now you can use 'sdb' from anywhere
sdb version
```

**Verify SDB is working:**

```bash
# Check SDB version
~/tizen-studio/tools/sdb version

# Expected output:
# Smart Development Bridge 2.3.x
```

#### Step 2: Connect to Samsung TV from Linux

```bash
# Navigate to SDB location (if not in PATH)
cd ~/tizen-studio/tools

# Connect to TV (replace with your TV's IP)
./sdb connect 192.168.1.100:26101

# Verify connection
./sdb devices
```

```
┌──────────────────────────────────────────────────────────┐
│  Terminal Output:                                         │
│                                                          │
│  $ ./sdb connect 192.168.1.100:26101                     │
│  connecting to 192.168.1.100:26101 ...                   │
│  connected to 192.168.1.100:26101                        │
│                                                          │
│  $ ./sdb devices                                         │
│  List of devices attached                                │
│  192.168.1.100:26101     device     UE55TU8000           │
└──────────────────────────────────────────────────────────┘
```

#### Step 3: Transfer and Install the .wgt File

```bash
# Install the .wgt file on the TV
# Replace the path with actual location of .wgt file
./sdb install ~/Downloads/BasicProject2.wgt
```

```
┌──────────────────────────────────────────────────────────┐
│  Terminal Output:                                         │
│                                                          │
│  $ ./sdb install ~/Downloads/BasicProject2.wgt           │
│  pushed    BasicProject2.wgt    100%                     │
│  1 package(s) installed                                  │
└──────────────────────────────────────────────────────────┘
```

#### Step 4: Launch the App

```bash
# Launch the app on TV
./sdb shell 0 was_execute ph3Ha7N8EQ.BasicProject2
```

The app will start on the TV immediately.

#### Step 5: To Uninstall

```bash
./sdb shell 0 vd_appuninstall ph3Ha7N8EQ.BasicProject2
```

---

### Windows Instructions (Method 1)

#### Step 2: Connect to Samsung TV from Windows

Open Command Prompt (cmd) and run:

```cmd
cd C:\tizen-studio\tools

:: Connect to TV (replace with your TV's IP)
sdb connect 192.168.1.100:26101

:: Verify connection - should show your TV
sdb devices
```

You should see output like:
```
List of devices attached
192.168.1.100:26101     device          UE55TU8000
```

#### Step 3: Install the App

```cmd
:: Install the .wgt file (replace path with actual location)
sdb install C:\Users\YourName\Downloads\BasicProject2.wgt
```

You should see:
```
pushed    BasicProject2.wgt  100%
1 package(s) installed
```

#### Step 4: Launch the App

```cmd
:: Launch the app on TV
sdb shell 0 was_execute ph3Ha7N8EQ.BasicProject2
```

The app will start on the TV immediately.

#### Step 5: To Uninstall

```cmd
sdb shell 0 vd_appuninstall ph3Ha7N8EQ.BasicProject2
```

---

## METHOD 2: USB Installation (No PC Needed)

**Limited support - works on some Samsung TV models.**

```
┌─────────────────────────────────────────────────────────┐
│                   METHOD 2 FLOW                          │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────┐      │
│  │  .wgt    │    │   USB    │    │  Samsung TV  │      │
│  │  file    │───►│  Drive   │───►│  USB Port    │      │
│  │          │    │ (FAT32)  │    │              │      │
│  └──────────┘    └──────────┘    └──────┬───────┘      │
│                                         │               │
│                                         ▼               │
│                                  ┌──────────────┐      │
│                                  │  My Files /  │      │
│                                  │  Media App   │      │
│                                  └──────┬───────┘      │
│                                         │               │
│                                         ▼               │
│                                  ┌──────────────┐      │
│                                  │  Select .wgt │      │
│                                  │  → Install   │      │
│                                  └──────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### Steps

1. Get the pre-built `.wgt` file from the developer
2. Copy the `.wgt` file to a **USB flash drive** (FAT32 format)
3. Plug the USB into the Samsung TV's USB port
4. On the TV, open **My Files** or **Media** app
5. Navigate to the USB drive
6. Select the `.wgt` file
7. The TV may prompt to install - confirm

**Formatting USB as FAT32 on Linux:**
```bash
# Find your USB device
lsblk

# Format as FAT32 (replace /dev/sdX1 with your USB partition)
# WARNING: This will erase all data on the USB drive!
sudo mkfs.vfat -F 32 /dev/sdX1

# Mount and copy
sudo mount /dev/sdX1 /mnt
cp ~/Downloads/BasicProject2.wgt /mnt/
sudo umount /mnt
```

**Formatting USB as FAT32 on Windows:**
```
1. Insert USB drive
2. Open File Explorer → Right-click USB drive
3. Select "Format..."
4. File System: FAT32
5. Click "Start"
6. Copy .wgt file to the USB drive
```

> **Note:** This method may not work on all Samsung TV models. Some TVs require Developer Mode + SDB for sideloading. If the TV doesn't recognize the .wgt file, use Method 1 instead.

---

## METHOD 3: Tizen Studio IDE (Full Developer Setup)

```
┌─────────────────────────────────────────────────────────────────┐
│                   METHOD 3 FLOW                                 │
│                                                                 │
│  ┌───────────┐   ┌───────────┐   ┌──────────┐   ┌──────────┐ │
│  │ Install   │   │ Create    │   │ Import   │   │ Build    │ │
│  │ Tizen     │──►│ Samsung   │──►│ Project  │──►│ Signed   │ │
│  │ Studio    │   │ Cert      │   │ Files    │   │ Package  │ │
│  └───────────┘   └───────────┘   └──────────┘   └────┬─────┘ │
│                                                       │        │
│                                                       ▼        │
│  ┌───────────┐   ┌───────────┐                ┌──────────┐   │
│  │ Debug     │◄──│ App runs  │◄───────────────│ Run on   │   │
│  │ (Chrome   │   │ on TV     │   SDB/WiFi     │ TV       │   │
│  │ DevTools) │   │           │                │          │   │
│  └───────────┘   └───────────┘                └──────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Step 1: Install Tizen Studio

**Download from:** https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html

| OS | Installer File | Install Path |
|----|---------------|--------------|
| Windows | `web-ide_Tizen_Studio_x.x_windows-64.exe` | `C:\tizen-studio\` |
| Linux | `web-ide_Tizen_Studio_x.x_ubuntu-64.bin` | `~/tizen-studio/` |
| macOS | `web-ide_Tizen_Studio_x.x_macos-64.dmg` | `~/tizen-studio/` |

**Linux Installation:**
```bash
# Download the installer (check Samsung site for latest version)
# Make it executable
chmod +x web-ide_Tizen_Studio_5.6_ubuntu-64.bin

# Run the installer
./web-ide_Tizen_Studio_5.6_ubuntu-64.bin

# Install prerequisites if prompted
sudo apt install libwebkitgtk-1.0-0 rpm2cpio cpio expect
# For newer Ubuntu versions:
sudo apt install libwebkit2gtk-4.0-37 rpm2cpio cpio expect
```

**Windows Installation:**
```
1. Run the .exe installer
2. Follow the installation wizard
3. Default path: C:\tizen-studio\
```

**After Install - Package Manager:**

Open **Tizen Package Manager** and install:
- `TV Extensions-6.0` (or latest)
- `TV Extensions Tools`
- `Samsung Certificate Extension`

```
┌─────────────────────────────────────────────────────────┐
│         Tizen Package Manager                            │
│                                                         │
│  ☑ TV Extensions-6.0                    [Install]       │
│  ☑ TV Extensions Tools                  [Install]       │
│  ☑ Samsung Certificate Extension        [Install]       │
│                                                         │
│  ☐ Mobile Extensions (NOT needed)                       │
│  ☐ Wearable Extensions (NOT needed)                     │
└─────────────────────────────────────────────────────────┘
```

### Step 2: Connect to Samsung TV

1. Open **Tizen Studio**
2. Go to **Tools > Device Manager** (or press `Ctrl+Shift+V`)
3. Click **Remote Device Manager** (scan icon)
4. Click **+** to add a new device:
   - **Name**: `Samsung TV` (any name)
   - **IP Address**: Your TV's IP address
   - **Port**: `26101` (default)
5. Click **Add**, then toggle the **Connection** switch to **ON**
6. You should see a green connected status

```
┌───────────────────────────────────────────────────────────┐
│         Tizen Device Manager                               │
│                                                           │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Name         │ IP              │ Port  │ Status  │    │
│  ├──────────────┼─────────────────┼───────┼─────────┤    │
│  │ Samsung TV   │ 192.168.1.100   │ 26101 │ 🟢 ON  │    │
│  └──────────────────────────────────────────────────┘    │
│                                                           │
│  DUID: XXXXXXXXXXXXXXXXXX  (needed for certificate)      │
└───────────────────────────────────────────────────────────┘
```

### Step 3: Create Samsung Certificate

```
┌─────────────────────────────────────────────────────────┐
│             Certificate Creation Flow                    │
│                                                         │
│  Tools > Certificate Manager                            │
│           │                                             │
│           ▼                                             │
│  Click "+" (Create Profile)                             │
│           │                                             │
│           ▼                                             │
│  Select "Samsung" → "TV"                                │
│           │                                             │
│           ▼                                             │
│  ┌─────────────────┐    ┌──────────────────┐           │
│  │ Author Cert     │    │ Distributor Cert │           │
│  │ ─────────────── │    │ ──────────────── │           │
│  │ • New author    │    │ • New distributor│           │
│  │ • Enter name    │    │ • Add TV DUID    │           │
│  │ • Set password  │    │ • Click Next     │           │
│  │ • Samsung login │    │                  │           │
│  └─────────────────┘    └──────────────────┘           │
│           │                       │                     │
│           └───────┬───────────────┘                     │
│                   ▼                                     │
│            Click "Finish"                               │
│            Certificate ready!                           │
└─────────────────────────────────────────────────────────┘
```

1. Go to **Tools > Certificate Manager**
2. Click **+** (Create Certificate Profile)
3. Select **Samsung** > **Next**
4. Select **TV** device type
5. **Author Certificate**:
   - Select "Create a new author certificate"
   - Fill in name and password
   - Sign in with Samsung Developer account
6. **Distributor Certificate**:
   - Select "Create a new distributor certificate"
   - Click **+** to add your TV's **DUID**
     - DUID appears in Device Manager when connected
     - Or on TV: **Settings > Support > About This TV**
   - Add the DUID and click **Next**
7. Click **Finish**

### Step 4: Import the Project

**Option A: Import Existing**

1. Go to **File > Import**
2. Select **Tizen > Tizen Project**
3. Browse to the project folder
4. Select and click **Finish**

**Option B: Create New + Copy Files**

1. **File > New > Tizen Project**
2. Select **Template > TV > Web Application > Basic Project**
3. Project name: `BasicProject2`
4. Delete all default files in the new project
5. Copy all source files into the project (see "Required Files" section below)

### Step 5: Build the App

1. **Right-click** on the project in Project Explorer
2. Select **Build Signed Package**
3. This creates `BasicProject2.wgt` in the project directory

```
┌──────────────────────────────────────────────────┐
│  Project Explorer (Right Click Menu)              │
│                                                   │
│  BasicProject2                                    │
│  ├── config.xml                                   │
│  ├── css/                                         │
│  ├── js/                                          │
│  ├── *.html                                       │
│  │                                                │
│  Right Click → "Build Signed Package"             │
│                                                   │
│  Output: BasicProject2.wgt ✓                      │
└──────────────────────────────────────────────────┘
```

### Step 6: Run on TV

1. **Right-click** on the project
2. Select **Run As > Tizen Web Application**
3. Select your Samsung TV
4. The app installs and launches automatically

### Step 7: Debug

1. After running, go to **Tools > Web Inspector**
2. Or open a browser and go to: `http://<TV_IP>:7011`
3. Chrome/Chromium DevTools opens connected to the TV app

**Linux:**
```bash
# Open browser to debug
xdg-open http://192.168.1.100:7011
# OR
google-chrome http://192.168.1.100:7011
# OR
firefox http://192.168.1.100:7011
```

**Windows:**
```
Open Chrome and navigate to: http://192.168.1.100:7011
```

---

## METHOD 4: Tizen CLI Only (Lightweight Developer Setup)

**Install only the command-line tools, not the full IDE.**

```
┌─────────────────────────────────────────────────────────┐
│                  METHOD 4 FLOW                           │
│                                                         │
│  ┌───────────┐   ┌───────────┐   ┌──────────────┐     │
│  │ Install   │   │ tizen     │   │ sdb connect  │     │
│  │ CLI tools │──►│ package   │──►│ sdb install  │     │
│  │ only      │   │ -t wgt    │   │ tizen run    │     │
│  └───────────┘   └───────────┘   └──────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### Step 1: Install CLI Tools

1. Download Tizen Studio CLI from Samsung developer site
2. Or install only "Tizen CLI" from Package Manager

| OS | CLI Tools Path |
|----|---------------|
| Windows | `C:\tizen-studio\tools\ide\bin\` |
| Linux | `~/tizen-studio/tools/ide/bin/` |

**Linux Setup:**
```bash
# Make tizen CLI executable
chmod +x ~/tizen-studio/tools/ide/bin/tizen

# Add to PATH (optional)
echo 'export PATH="$HOME/tizen-studio/tools/ide/bin:$HOME/tizen-studio/tools:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### Step 2: Package the App

**Linux:**
```bash
# Navigate to CLI tools
cd ~/tizen-studio/tools/ide/bin

# Package the project into .wgt
./tizen package -t wgt -s <CERTIFICATE_PROFILE> -- ~/path/to/project

# This creates BasicProject2.wgt
```

**Windows:**
```cmd
:: Navigate to CLI tools
cd C:\tizen-studio\tools\ide\bin

:: Package the project into .wgt
tizen package -t wgt -s <CERTIFICATE_PROFILE> -- C:\path\to\project

:: This creates BasicProject2.wgt
```

### Step 3: Connect and Install

**Linux:**
```bash
# Connect to TV
sdb connect 192.168.1.100:26101

# Install
tizen install -n BasicProject2.wgt -t samsung-tv

# Run
tizen run -p ph3Ha7N8EQ.BasicProject2 -t samsung-tv
```

**Windows:**
```cmd
:: Connect to TV
sdb connect 192.168.1.100:26101

:: Install
tizen install -n BasicProject2.wgt -t samsung-tv

:: Run
tizen run -p ph3Ha7N8EQ.BasicProject2 -t samsung-tv
```

---

## METHOD 5: Samsung Seller Office (Production Release)

**For publishing the app to Samsung TV App Store.**

```
┌─────────────────────────────────────────────────────────┐
│               METHOD 5 FLOW (Production)                 │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐           │
│  │ Sign in  │   │ Upload   │   │ Samsung  │           │
│  │ Seller   │──►│ .wgt +   │──►│ QA       │           │
│  │ Office   │   │ Details  │   │ Review   │           │
│  └──────────┘   └──────────┘   └────┬─────┘           │
│                                      │                  │
│                                      ▼                  │
│                               ┌──────────┐             │
│                               │ App Live │             │
│                               │ on Store │             │
│                               └──────────┘             │
└─────────────────────────────────────────────────────────┘
```

1. Go to: https://seller.samsungapps.com/tv
2. Sign in with Samsung Partner account
3. Click **Add New Application > TV**
4. Fill in app details (name, description, screenshots)
5. Upload the signed `.wgt` file
6. Submit for Samsung QA review
7. After approval, the app appears in Samsung TV App Store

> This method is for final production release, not for testing.

---

## Linux Quick Start (Complete Guide)

This section is a complete start-to-finish guide for **Linux users** to install the app on a Samsung TV.

### Prerequisites

```bash
# Check you have these installed
java -version     # Java JDK 8 or higher required
# If not installed:
sudo apt install openjdk-11-jdk    # Ubuntu/Debian
sudo dnf install java-11-openjdk   # Fedora/RHEL
```

### Step-by-Step

```
┌─────────────────────────────────────────────────────────────────┐
│           LINUX → SAMSUNG TV : Complete Flow                    │
│                                                                 │
│  ① Download Tizen Studio (or SDB only)                         │
│     └──► chmod +x installer.bin && ./installer.bin              │
│                                                                 │
│  ② Verify SDB works                                            │
│     └──► ~/tizen-studio/tools/sdb version                      │
│                                                                 │
│  ③ Enable Developer Mode on Samsung TV                         │
│     └──► Apps → 12345 → ON → Enter Linux PC's IP → Restart     │
│                                                                 │
│  ④ Find your Linux PC's IP                                     │
│     └──► hostname -I  (use this IP in TV Dev Mode)             │
│                                                                 │
│  ⑤ Connect to TV                                               │
│     └──► sdb connect <TV_IP>:26101                             │
│                                                                 │
│  ⑥ Verify connection                                           │
│     └──► sdb devices                                           │
│                                                                 │
│  ⑦ Install the app                                             │
│     └──► sdb install ~/Downloads/BasicProject2.wgt             │
│                                                                 │
│  ⑧ Launch the app                                              │
│     └──► sdb shell 0 was_execute ph3Ha7N8EQ.BasicProject2      │
│                                                                 │
│  ✓ Done! App is running on the Samsung TV                      │
└─────────────────────────────────────────────────────────────────┘
```

### Full Linux Terminal Commands

```bash
# ─── STEP 1: Download and Install SDB ───
# Download Tizen Studio from Samsung developer site
# https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html

chmod +x web-ide_Tizen_Studio_*.bin
./web-ide_Tizen_Studio_*.bin
# Choose Custom install → select "Tizen SDK tools" only (for SDB)

# ─── STEP 2: Verify SDB ───
~/tizen-studio/tools/sdb version
# Output: Smart Development Bridge 2.3.x

# ─── STEP 3: Find your Linux PC's IP ───
hostname -I
# Output: 192.168.1.50 (your IP - enter this in TV Developer Mode)

# ─── STEP 4: Enable Developer Mode on TV ───
# On the TV: Apps → Press 1,2,3,4,5 → Turn ON → Enter PC IP → Restart TV

# ─── STEP 5: Connect to Samsung TV ───
cd ~/tizen-studio/tools
./sdb connect 192.168.1.100:26101
# Output: connected to 192.168.1.100:26101

# ─── STEP 6: Verify Connection ───
./sdb devices
# Output:
# List of devices attached
# 192.168.1.100:26101     device     UE55TU8000

# ─── STEP 7: Install the App ───
./sdb install ~/Downloads/BasicProject2.wgt
# Output:
# pushed    BasicProject2.wgt    100%
# 1 package(s) installed

# ─── STEP 8: Launch the App ───
./sdb shell 0 was_execute ph3Ha7N8EQ.BasicProject2
# App launches on the Samsung TV!

# ─── OPTIONAL: View Logs ───
./sdb dlog -v long

# ─── OPTIONAL: Uninstall ───
./sdb shell 0 vd_appuninstall ph3Ha7N8EQ.BasicProject2
```

### Linux Troubleshooting

```bash
# If SDB doesn't connect, try:
./sdb kill-server
./sdb start-server
./sdb connect 192.168.1.100:26101

# If permission denied:
chmod +x ~/tizen-studio/tools/sdb

# If connection refused - check firewall:
sudo ufw allow 26101/tcp

# Check if TV is reachable:
ping 192.168.1.100

# If "device not found" after connect:
# 1. Make sure Developer Mode is ON on TV
# 2. Make sure your Linux PC's IP is entered in TV Developer Mode settings
# 3. Restart the TV and try again
```

---

## Transferring Files from Linux to Client

If you need to share the `.wgt` file or project files from a Linux machine:

```
┌─────────────────────────────────────────────────────────────────┐
│          FILE TRANSFER OPTIONS (Linux → Client)                 │
│                                                                 │
│  ┌────────────┐                                                │
│  │ .wgt file  │                                                │
│  │ on Linux   │                                                │
│  └─────┬──────┘                                                │
│        │                                                        │
│        ├──► Option 1: Google Drive / Cloud Upload               │
│        │    └── Upload .wgt, share download link                │
│        │                                                        │
│        ├──► Option 2: SCP / SFTP (Linux to Linux)              │
│        │    └── scp file.wgt user@remote:/path/                │
│        │                                                        │
│        ├──► Option 3: USB Flash Drive                          │
│        │    └── cp file.wgt /media/usb/                        │
│        │                                                        │
│        ├──► Option 4: Email Attachment                          │
│        │    └── Attach .wgt file (~small size)                 │
│        │                                                        │
│        └──► Option 5: Python HTTP Server (LAN)                 │
│             └── python3 -m http.server 8080                    │
└─────────────────────────────────────────────────────────────────┘
```

**Option 1: Cloud Upload (Recommended)**
```bash
# Upload to Google Drive, Dropbox, or any cloud service
# Share the download link with the client
```

**Option 2: SCP (Linux to Linux)**
```bash
# Transfer directly between Linux machines
scp ~/Downloads/BasicProject2.wgt user@client-ip:~/Downloads/
```

**Option 3: USB Drive**
```bash
# Copy to USB drive
cp ~/Downloads/BasicProject2.wgt /media/$USER/USB_DRIVE/
```

**Option 4: Quick Local Network Transfer**
```bash
# On the sender machine - start a simple HTTP server
cd ~/Downloads
python3 -m http.server 8080

# On the receiver machine - download the file
# Open browser: http://sender-ip:8080/BasicProject2.wgt
# Or use wget:
wget http://sender-ip:8080/BasicProject2.wgt
```

---

## App Details

| Property | Value |
|----------|-------|
| **App ID** | `ph3Ha7N8EQ.BasicProject2` |
| **Package ID** | `ph3Ha7N8EQ` |
| **Start Page** | `login.html` |
| **Resolution** | `1920 x 1080` |
| **Orientation** | Landscape |
| **Tizen Version** | 6.0+ |
| **API Server** | `https://netmontest.bbnl.in` |

---

## Required Files (for Building .wgt)

Only these files should be included in the TV package:

```
BasicProject2/
  config.xml              <- Tizen app configuration (REQUIRED)
  icon.png                <- App icon (REQUIRED)
  login.html              <- Entry point (login/OTP)
  verify.html             <- OTP verification
  home.html               <- Home page (main)
  channels.html           <- TV channels list
  player.html             <- Video player (AVPlay)
  settings.html           <- App settings
  feedback.html           <- User feedback form
  favorites.html          <- Favorite channels
  language-select.html    <- Language selection
  ott-apps.html           <- OTT apps page
  index.html              <- Redirect page
  images/
    fofi.jpeg             <- App branding image
  css/
    style.css             <- Global styles
    base/                 <- Base styles
    colors.css            <- Color variables
    componentes/          <- Component styles
    layout/
      home-layout.css     <- Home page layout
    pages/
      auth.css            <- Login/verify styles
      channels.css        <- Channels page styles
      feedback.css        <- Feedback page styles
      favorites.css       <- Favorites styles
      homepages.css       <- Home page styles
      language-select.css <- Language select styles
      ott-apps.css        <- OTT apps styles
      player.css          <- Player page styles
      settings.css        <- Settings page styles
  js/
    api.js                <- All API integrations
    home.js               <- Home page logic
    home-navigation.js    <- TV remote navigation
    channels.js           <- Channels page logic
    player.js             <- Video player (AVPlay)
    settings.js           <- Settings page logic
    feedback.js           <- Feedback form logic
    favorites.js          <- Favorites logic
    language-select.js    <- Language selection
    ott-apps.js           <- OTT apps logic
    main.js               <- Shared utilities
    avplayer.js           <- Samsung AVPlay wrapper
```

**Do NOT include these files:**
- `*.md` files (README, guides)
- `test-*.html` / `test-*.js` (test files)
- `debug-*.js` / `diagnostic*.html` (debug files)
- `proxy-server.js` / `bbnl-proxy/` (development proxy)
- `node_modules/` (npm packages)
- `package.json` / `jsconfig.json`
- `*.bat` / `*.txt` / `*.backup`
- `db.json` / `stream-debug.html`

---

## Troubleshooting

### "Unable to connect to TV"
- Ensure Developer Mode is ON with correct PC IP
- Both PC and TV must be on the **same WiFi network**
- Check TV IP address is correct
- Try: `sdb kill-server` then `sdb connect <IP>:26101`
- Restart the TV and try again
- **Linux:** Check firewall with `sudo ufw status` and allow port 26101

### "Certificate error" or "Signature mismatch"
- The TV's DUID must match the certificate
- Re-create certificate with correct DUID
- For client testing with pre-built .wgt: developer must include client's TV DUID in the certificate before building

### "App installs but crashes immediately"
- Open Web Inspector (`http://<TV_IP>:7011`) to see errors
- Verify `config.xml` has all required privileges
- Ensure TV is connected to BBNL network

### "Cannot play video streams"
- TV must be on BBNL network to access stream servers
- Check AVPlay privilege in config.xml
- Verify stream URLs are accessible from TV's network

### "App shows Service Locked screen"
- This is the AppLock feature - TV must be on BBNL network
- Press BACK or ENTER on remote to retry
- This is expected behavior when not on BBNL network

### "Permission denied" on Linux
```bash
# Fix SDB permissions
chmod +x ~/tizen-studio/tools/sdb
chmod +x ~/tizen-studio/tools/sdb-helper

# If still failing, run with sudo (not recommended for regular use)
sudo ~/tizen-studio/tools/sdb connect 192.168.1.100:26101
```

### SDB Common Commands

**Linux:**
```bash
# Check connected devices
sdb devices

# Connect to TV
sdb connect <TV_IP>:26101

# Disconnect
sdb disconnect <TV_IP>:26101

# Install app
sdb install <path-to-file>.wgt

# Uninstall app
sdb shell 0 vd_appuninstall ph3Ha7N8EQ.BasicProject2

# Launch app
sdb shell 0 was_execute ph3Ha7N8EQ.BasicProject2

# View logs
sdb dlog -v long

# Kill SDB server (if stuck)
sdb kill-server

# Restart SDB
sdb start-server

# Get TV info
sdb capability
```

**Windows:**
```cmd
:: Check connected devices
sdb devices

:: Connect to TV
sdb connect <TV_IP>:26101

:: Disconnect
sdb disconnect <TV_IP>:26101

:: Install app
sdb install <path-to-file>.wgt

:: Uninstall app
sdb shell 0 vd_appuninstall ph3Ha7N8EQ.BasicProject2

:: Launch app
sdb shell 0 was_execute ph3Ha7N8EQ.BasicProject2

:: View logs
sdb dlog -v long

:: Kill SDB server (if stuck)
sdb kill-server

:: Restart SDB
sdb start-server

:: Get TV info
sdb capability
```

---

## Quick Reference - Remote Control Keys

| Remote Key | Action |
|------------|--------|
| Arrow Keys | Navigate between elements |
| OK / Enter | Select / activate element |
| Return / Back | Go back / Exit popup / Retry lock check |
| Volume +/- | Adjust volume |
| Mute | Toggle mute |
| 1-2-3-4-5 | Enable Developer Mode (in Apps panel) |
