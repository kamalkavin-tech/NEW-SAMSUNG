# Tizen Studio Installation & TV App Deployment Guide

### Platform: Linux | Version: 1.0

---

## Table of Contents

1. [Overview](#overview)
2. [System Requirements](#system-requirements)
3. [Step 1: Download Tizen Studio](#step-1-download-tizen-studio)
4. [Step 2: Install Dependencies](#step-2-install-dependencies)
5. [Step 3: Install Tizen Studio](#step-3-install-tizen-studio)
6. [Step 4: Install TV Extension](#step-4-install-tv-extension)
7. [Step 5: Configure Samsung TV for Developer Mode](#step-5-configure-samsung-tv-for-developer-mode)
8. [Step 6: Connect TV to Tizen Studio](#step-6-connect-tv-to-tizen-studio)
9. [Step 7: Install WGT File on TV](#step-7-install-wgt-file-on-tv)
10. [Troubleshooting](#troubleshooting)

---

## Overview

This guide provides step-by-step instructions to install **Tizen Studio** on a Linux machine, configure a **Samsung Smart TV** for developer mode, and deploy a `.wgt` application package to the TV.

Tizen Studio is the official IDE and toolset provided by Samsung for developing, testing, and deploying applications on Samsung Smart TVs and other Tizen-based devices.

---

## System Requirements

Before proceeding, ensure your Linux machine meets the following minimum requirements:

| Requirement       | Specification                                      |
|-------------------|----------------------------------------------------|
| **OS**            | Ubuntu 20.04 / 22.04 / 24.04 (64-bit) or equivalent |
| **RAM**           | Minimum 4 GB (8 GB recommended)                   |
| **Disk Space**    | Minimum 5 GB free space                            |
| **Java**          | OpenJDK 11 or higher                               |
| **Network**       | PC and Samsung TV must be on the same Wi-Fi / LAN network |

---

## Step 1: Download Tizen Studio

1. Open your web browser and navigate to the official Tizen Studio download page:

   **https://developer.tizen.org/development/tizen-studio/download**

2. Under the **Tizen Studio** section, select the **Linux** tab.

3. Download the **Offline Installer** (`.bin` file). The file name will be similar to:

   ```
   web-ide_Tizen_Studio_x.x_ubuntu-64.bin
   ```

4. Save the file to your preferred directory (e.g., `~/Downloads/`).

---

## Step 2: Install Dependencies

Tizen Studio requires several system packages to run correctly. Open a terminal and execute the following commands:

### Update package list

```bash
sudo apt update
```

### Install required packages

```bash
sudo apt install -y openjdk-11-jdk wget curl libwebkitgtk-1.0-0 libwebkitgtk-3.0-0 \
  libcanberra-gtk-module libcanberra-gtk3-module rpm2cpio cpio bridge-utils \
  libprivilege-control0 gettext debhelper libsdl1.2debian libglib2.0-0 \
  libudev-dev libhdf5-dev libssl-dev zip unzip
```

> **Note:** Some packages may not be available on newer Ubuntu versions. You can safely skip unavailable packages — the core installation will still work.

### Verify Java installation

```bash
java -version
```

Expected output:

```
openjdk version "11.x.x"
```

If Java is not installed, run:

```bash
sudo apt install -y openjdk-11-jdk
```

### Set JAVA_HOME (if not already set)

```bash
echo 'export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64' >> ~/.bashrc
echo 'export PATH=$JAVA_HOME/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

---

## Step 3: Install Tizen Studio

### 3.1 Make the installer executable

Navigate to the directory where the installer was downloaded:

```bash
cd ~/Downloads
chmod +x web-ide_Tizen_Studio_*.bin
```

### 3.2 Run the installer

```bash
./web-ide_Tizen_Studio_*.bin
```

The Tizen Studio installer GUI will open. Follow the on-screen prompts:

1. **Accept** the license agreement.
2. Set the **installation path** (default: `~/tizen-studio/`). It is recommended to keep the default path.
3. Set the **data path** (default: `~/tizen-studio-data/`).
4. Click **Install** and wait for the process to complete.

> **Installation typically takes 5-10 minutes** depending on your system.

### 3.3 Verify installation

After installation, Tizen Studio can be launched from:

```bash
~/tizen-studio/ide/TizenStudio.sh
```

Or search for **Tizen Studio** in your application launcher.

---

## Step 4: Install TV Extension

The base Tizen Studio installation does not include TV development tools. You must install the **TV Extension** separately.

### 4.1 Open Package Manager

Launch the Package Manager from the Tizen Studio welcome screen, or run it directly:

```bash
~/tizen-studio/package-manager/package-manager.bin
```

### 4.2 Install TV Extension

1. In the Package Manager window, navigate to the **Extension SDK** tab.
2. Locate **TV Extensions-x.x** in the list.
3. Click the **Install** button next to it.
4. Wait for the download and installation to complete.

> **This may take 10-20 minutes** depending on your internet speed. Do not close the Package Manager until the installation is fully complete.

### 4.3 Verify installation

After installation, you should see **TV** project templates available when creating a new project in Tizen Studio.

---

## Step 5: Configure Samsung TV for Developer Mode

To install and test applications on a Samsung Smart TV, the TV must be set to **Developer Mode**.

### 5.1 Enable Developer Mode on the TV

1. Turn on your Samsung Smart TV.
2. Using the TV remote, navigate to the **Apps** panel.
3. In the Apps panel, enter the following sequence on the remote:

   ```
   1 → 2 → 3 → 4 → 5
   ```

   This will open a **Developer Mode** dialog.

4. Set Developer Mode to **ON**.

### 5.2 Enter the Host PC IP Address

1. In the Developer Mode dialog, enter the **IP address of your Linux PC**.
2. To find your PC's IP address, run the following in a terminal:

   ```bash
   hostname -I | awk '{print $1}'
   ```

3. Enter this IP address in the TV's Developer Mode dialog.
4. Click **OK** to save.

### 5.3 Restart the TV

1. Turn off the TV completely using the remote.
2. Wait 5 seconds.
3. Turn the TV back on.

> **Important:** Developer Mode must be re-enabled after every TV restart on some models. Verify by checking if the Developer Mode banner appears at the top of the screen.

---

## Step 6: Connect TV to Tizen Studio

### 6.1 Find the TV's IP Address

On the Samsung TV:

1. Go to **Settings** → **General** → **Network** → **Network Status**.
2. Select **IP Settings** to view the TV's IP address.
3. Note down the IP address (e.g., `192.168.1.xxx`).

### 6.2 Open Device Manager

In Tizen Studio, open the **Device Manager**:

- Go to **Tools** → **Device Manager** in the menu bar.

Or launch it directly from the terminal:

```bash
~/tizen-studio/tools/device-manager/bin/device-manager
```

### 6.3 Add Remote Device

1. In Device Manager, click the **Remote Device Manager** button (scan icon).
2. Click the **+** (Add) button.
3. Enter the following details:
   - **Name:** Any descriptive name (e.g., `Samsung-TV-Living-Room`)
   - **IP Address:** The TV's IP address from Step 6.1
   - **Port:** `26101` (default)
4. Click **Add**.

### 6.4 Connect to the TV

1. The newly added TV device will appear in the list.
2. Toggle the **Connection** switch to **ON**.
3. The status should change to **Connected**.

> **Ensure both the PC and the TV are on the same network.** If the connection fails, verify the IP address and check that Developer Mode is active on the TV.

---

## Step 7: Install WGT File on TV

Once the TV is connected to Tizen Studio, you can install the `.wgt` application package.

### 7.1 Open Device Manager

Ensure the **Device Manager** is open and the TV shows a **Connected** status.

### 7.2 Install the Application

1. In the Device Manager, **right-click** on the connected TV device.
2. Select **Install App** from the context menu.
3. A file browser dialog will open.
4. Navigate to your `.wgt` file and select it.
5. Click **Open** to begin the installation.

### 7.3 Wait for installation

- The installation progress will be displayed in the Device Manager console.
- Once complete, you will see a success message:

  ```
  Installed the package successfully.
  ```

### 7.4 Launch the application

- The installed application will appear in the **Apps** section on the TV.
- Navigate to it and press **Enter** on the remote to launch.

### Alternative: Install via Command Line

You can also install the `.wgt` file using the Tizen CLI:

```bash
~/tizen-studio/tools/ide/bin/tizen install -n your-app.wgt -t Samsung-TV-Living-Room
```

Replace `your-app.wgt` with the actual file name and `Samsung-TV-Living-Room` with the device name you configured in Device Manager.

---

## Troubleshooting

### TV Not Connecting

| Possible Cause | Solution |
|----------------|----------|
| PC and TV are on different networks | Ensure both devices are connected to the same Wi-Fi / LAN |
| Developer Mode is not active | Re-enter the `1-2-3-4-5` code in the Apps panel and verify Developer Mode is ON |
| Incorrect IP address | Double-check both the PC IP (entered on TV) and the TV IP (entered in Device Manager) |
| Firewall blocking connection | Allow port `26101` through the Linux firewall: `sudo ufw allow 26101` |

### Certificate Issues

If you encounter a **certificate error** during installation:

1. In Tizen Studio, go to **Tools** → **Certificate Manager**.
2. Create a new **Samsung certificate** profile.
3. Sign in with your **Samsung Developer Account**.
4. Select the connected TV device as the target.
5. Rebuild and re-sign your `.wgt` file with the new certificate.

> **Note:** A valid Samsung Developer account is required. Register at: **https://developer.samsung.com**

### Permission Denied Error

If you see a **permission denied** error when running the installer:

```bash
chmod +x web-ide_Tizen_Studio_*.bin
```

If the issue persists, run with elevated privileges:

```bash
sudo ./web-ide_Tizen_Studio_*.bin
```

### Java Not Detected

If Tizen Studio reports that Java is not found:

1. Verify Java is installed:

   ```bash
   java -version
   ```

2. Ensure `JAVA_HOME` is set correctly:

   ```bash
   echo $JAVA_HOME
   ```

   It should output something like: `/usr/lib/jvm/java-11-openjdk-amd64`

3. If not set, configure it:

   ```bash
   export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64
   export PATH=$JAVA_HOME/bin:$PATH
   ```

4. Restart Tizen Studio after setting the environment variables.

### App Not Appearing on TV After Installation

- Restart the TV after installation.
- Ensure the app was signed with a certificate that matches the connected TV's DUID.
- Check the Device Manager console log for any error messages.

---

## Conclusion

Your setup is now complete. The Samsung Smart TV is configured for development, connected to Tizen Studio, and ready for application testing and deployment.

For any further assistance, refer to the official Samsung Tizen documentation:

**https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html**

---

*Document prepared for internal use. All rights reserved.*
