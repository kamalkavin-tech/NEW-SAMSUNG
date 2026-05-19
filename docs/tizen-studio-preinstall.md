# Tizen Studio Pre-Install Checklist

This guide lists the things you should install or prepare before setting up Tizen Studio for Samsung TV app development.

## 1. System Requirements

### Windows PC
- Windows 10 or Windows 11
- At least 8 GB RAM recommended
- At least 10 GB free disk space
- Stable internet connection for package downloads
- Administrator access on the PC

### TV / Device Side
- Samsung TV with Tizen support
- Developer Mode enabled on the TV
- TV and PC on the same network
- TV IP address available for remote device connection

## 2. Pre-Install Tools

Install these before or during Tizen Studio setup:

- **Java Development Kit (JDK)**
  - Install a supported JDK version if your Tizen Studio installer asks for it.
  - Use the version recommended by the Tizen Studio release you are installing.

- **Visual C++ Redistributable for Windows**
  - Helpful for emulator and tooling support on some systems.
  - Install the latest supported Microsoft Visual C++ runtime if required.

- **Samsung Certificate Profile / Certificate Manager support**
  - Needed to sign the app before installing it on the TV.

- **USB / Network drivers**
  - If you plan to use USB or ADB-like device connection, make sure the required drivers are installed.
  - For Samsung TV deployment, network connection is usually enough.

## 3. Tizen Studio Components to Install

When using the Tizen Studio package manager, make sure to select these items:

- **Tizen Studio Base**
- **Web IDE / Web Application support**
- **TV Extension**
- **Certificate Manager**
- **Device Manager**
- **Emulator Manager** if you want to test in an emulator

## 4. Samsung TV App Development Setup

Before running the app on the TV, prepare these:

- Enable **Developer Mode** on the Samsung TV
- Note the TV IP address
- Add the TV as a remote device in Tizen Studio
- Create or import a certificate profile
- Sign the app using the certificate profile
- Build the `.wgt` package
- Install the package on the TV through Tizen Studio or the device manager

## 5. Recommended Pre-Install Order

1. Install Windows prerequisites
2. Install JDK if needed by your Tizen Studio version
3. Install Tizen Studio
4. Open Package Manager and install:
   - TV Extension
   - Certificate Manager
   - Device Manager
   - Emulator Manager if needed
5. Enable Developer Mode on the Samsung TV
6. Connect the TV to Tizen Studio
7. Create the certificate profile
8. Build and install the app

## 6. Notes for This Project

For this Samsung TV IPTV app, you will usually need:

- Tizen Studio
- TV Extension
- Certificate Manager
- Device Manager
- Developer Mode on the TV
- Network access between PC and TV

## 7. Quick Checklist

- [ ] Windows PC ready
- [ ] JDK installed if required
- [ ] Tizen Studio installed
- [ ] TV Extension installed
- [ ] Certificate Manager installed
- [ ] Device Manager installed
- [ ] TV Developer Mode enabled
- [ ] TV connected on the same network
- [ ] Certificate profile created
- [ ] App signed and packaged
- [ ] `.wgt` installed on TV

## 8. Common Issues

- If the TV does not connect, check the TV IP and network.
- If packaging fails, verify that the certificate profile is valid.
- If the app does not install, make sure Developer Mode is enabled on the TV.
- If the emulator is slow, close other heavy applications on the PC.

## 9. Final Tip

Keep Tizen Studio, the TV Extension, and the certificate profile version aligned with the app version you are testing. That avoids most install and deploy problems.
