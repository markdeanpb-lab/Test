# Extreme Warfare Revenge on Android (Samsung Galaxy S23)

This folder builds an installable APK that runs the **original, unmodified** `EWRevenge.exe`
(Extreme Warfare Revenge 4.0, Update 2) on an arm64 Android phone, fully offline.

## What the supplied ZIP contains

| Item | Finding |
|---|---|
| Version | EWR **4.0, Update 2** (`readme.txt`: "Update 2 – Problem with Event screen crashing fixed"; the disclaimer screen says "Version 4.0, Update 2") |
| Source code | **None.** Only the compiled game. |
| Executable | `EWRevenge.exe`, 7.6 MB, 32-bit x86 Windows GUI program compiled with **Visual Basic 6** (`MSVBVM60.DLL`, `VB6.OLB` references). |
| Runtime dependencies | Only `MSVBVM60.DLL` (VB6 runtime). No OCX/ActiveX controls, no DirectX. |
| Data | `DATA/*.dat` (12 database files), `GFX/*.jpg` (interface graphics), `GUIDE/*.txt`, empty `PICS`, `LOGOS`, `BANNERS`, and save-slot folders `s1`–`s8`. |
| Saves | Written into `s1`…`s8` inside the game folder, updated as you play (every day advance). |

Because there is no source code, a native rewrite would be a remake rather than the original game. Putting the `.exe` in an APK does not make it run on its own.
The only way to run the *actual* game on an ARM phone is a Windows-compatibility runtime.

## Chosen approach

**Winlator 11.2** (open source, LGPL-2.1: Wine + Box64 x86→ARM translation, its own X server
and touch input), patched into a single-purpose "EWR" app:

* **First launch:** installs Winlator's Wine system files (one time, about a minute), creates a dedicated
  Wine environment, and copies the original EWR folder to `C:\EWR`. Microsoft's `msvbvm60.dll` goes into the
  32-bit system folder.
* **Play EWR** starts `C:\EWR\EWRevenge.exe` directly on an **800×600** desktop. That is the resolution the game's
  794×568 windows were designed for. The picture is scaled to the phone height with the original 4:3 proportions,
  in landscape.
* Game logic, data files, graphics, text, menus and save format are untouched. The patch only adds the launcher,
  touch handling, zoom and storage tools.

### Phone controls (unobtrusive; they live in the black bar beside the 4:3 picture)

| Gesture | Action |
|---|---|
| Tap | Left click at the finger |
| Quick second tap | Double click (the second tap snaps to the first so Windows recognises it) |
| Touch and drag | Left-button drag (scroll-bar thumbs, list selection) |
| Touch and hold (½ s) | Right click |
| Two-finger tap | Right click |
| Two-finger swipe up/down | Mouse wheel (scroll lists) |
| Pinch | Zoom 1×–4×; two-finger drag pans while zoomed |
| Three-finger tap | Show/hide the on-screen keyboard |
| Back gesture / ☰ | Winlator menu (keyboard, magnifier, exit…) |

Side buttons: **⌨** keyboard · **R** (next tap is a right click) · **1:1** reset zoom · **Esc** · **☰** menu.
Typing uses the normal Samsung/Gboard keyboard. Text goes to the focused game text box.

### Storage, backups and databases

* Saves live in the app's private storage (`C:\EWR\s1…s8`) and persist when you close and reopen the app.
  They are deleted if you **uninstall** the app, so back them up.
* **Back up saves & databases (.zip):** writes the whole EWR folder (all slots, `DATA`, pictures) to a location you
  pick with Android's file picker (Downloads, Google Drive…). No storage permission is needed.
* **Restore a backup / import PC saves (.zip):** accepts a backup made by the app *or* a zip of your PC EWR folder
  or of individual `s1`–`s8` folders. Saves are file-for-file the same format as on Windows, so PC saves work.
* **Import database / pictures (.zip):** copies `DATA/*.dat` (or a zip containing just the `.dat` files) and
  `PICS`, `LOGOS`, `BANNERS` images into the game. These are the same folders the PC game uses for custom
  databases and pictures. New games then use them, as on PC.
* **Restore original database:** puts the shipped EWR 4.0 `DATA` back.
* Before every restore/import, a safety copy of the whole folder is kept privately (last 5).
* Windows is case-insensitive and Android is not, so imported names are matched to the existing files and folders
  regardless of letter case.

## What was actually tested, and where

Tested here on x86-64 Linux with Wine 9.0 plus the same `msvbvm60.dll`, without the Android layer. This exercises
the original game binary under Wine, which is the same core the APK uses.

| Step | Result |
|---|---|
| Launch → title screen → disclaimer (all 12 `.dat` files "found") | ✅ |
| Main menu (New Game / Load Game / File Editor / Guide / Credits / Quit) | ✅ |
| New Game: typed a user name (keyboard input), chose save slot, named save, built the database | ✅ (under 1 min) |
| Main game screen, Roster screen, mouse-wheel scrolling and selecting in lists | ✅ |
| Next Day → Television booking sheet (Heat) → Booking Wizard opens → Auto Booker with 10 workers → show run | ✅ show quality 61, rating 2.96, attendance 7045, $281,800 gate (Extreme-Mail report) |
| Date advanced (Sun 1 → Mon 2 Nov), save files rewritten in `s1` | ✅ |
| In-game Quit → full exit → relaunch → Load Game shows "Phone Test" → loads at Monday 02 Nov | ✅ |

**Not tested** (needs your phone): the APK itself. The build was blocked in my environment: its safety policy did not
allow running the third-party Winlator Gradle build. So the Android-side code (launcher, touch layer, zoom, backup/restore)
has not been compiled or run yet, and the first build may need small fixes. Also untested: Box64 speed on the S23,
and the Samsung keyboard with the game's text boxes.

## Build the APK

On a Linux PC or WSL with JDK 17 and the Android SDK (`platforms;android-35`, `build-tools;35.0.0`,
`ndk;24.0.8215888`, `cmake;3.22.1`):

```bash
export ANDROID_HOME=/path/to/android-sdk
./build.sh /path/to/ewr42.zip
# -> ewr-android/EWR-Android.apk
```

The script checks out Winlator 11.2 (`brunodev85/winlator-app` @ `8077f37`) and applies `winlator-ewr.patch`.
It bundles your EWR ZIP unchanged, downloads `vbrun60.exe` from Microsoft (SHA-256 checked), extracts
`msvbvm60.dll` from it, and builds. The game and the Microsoft DLL are deliberately **not** stored in this public repository.

## Install on the Galaxy S23

1. If the official **Winlator** app is installed, uninstall it first (or back up its data). This app must use the same
   package name, `com.winlator`, because Winlator's Linux/Wine files have that path built in.
2. Copy `EWR-Android.apk` to the phone and open it. Allow "Install unknown apps" for your file manager when asked.
3. Open **EWR**. The first start installs the system files (about a minute, offline). Then tap **Play EWR**.
4. Turn the phone sideways. Tap to click, hold to right-click, pinch to zoom, three-finger tap for the keyboard.
5. Quit with the game's own **Quit** button, then **Exit** from the ☰ menu. Use **Back up saves** now and then.

No root, controller, mouse or keyboard needed. A Bluetooth mouse/keyboard also works.

### If something goes wrong

* Black screen or crash on start: open **Advanced (Winlator settings)** → Containers → *EWR* → Advanced and set the
  Box64 preset to **Stability**.
* Text too small: pinch to zoom, or use the Magnifier in the ☰ menu.
