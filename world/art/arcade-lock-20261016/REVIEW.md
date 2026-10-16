# M.O.T.H cabinet release lock — local review, 2026-10-16

The world cabinet opens automatically at **2026-11-02 00:00 Taiwan time (UTC+8)**, the instant **2026-11-01T16:00:00.000Z**. Standalone public M.O.T.H is unchanged. Nothing published.

## Current desktop interaction

Play/E moves the camera to the physical CRT using the same fixed level camera as live arcade play. Its orange/cream screen artwork shows a padlock, “遊戲 COMING SOON”, release date and Taiwan timezone. The avatar and world controls are suppressed. A single Exit button sits inside the lower screen; Exit or Esc restores the world and input. There is no page dialog, game iframe, game URL, game input bridge or network load while locked. Fullscreen becomes available with the actual game after release.

The physical-screen frame and projection live in a shared `MothArcadeView`; the live iframe session extends it. This keeps camera fit, planet bending and the projected Exit anchor identical across locked/live views and desktop resizing. The cabinet's lower artwork leaves clear space for Exit. Repeated Play or clock updates cannot stack or eject the locked view.

At the release instant, somebody already viewing the desktop lock automatically sees the live canonical game load on that same screen and camera. No reload or second Play is needed. The deadline tests verify that this creates exactly the intended live session. After exit, ordinary future interactions use the existing desktop game route.

## Mobile and timing

Phones keep the availability dialog before any URL or popup is made. It explains November 2 at 12:00 AM Taiwan time. The clock uses the festival service offset when available, device time offline. A deadline timer, visibility return, service updates and every interaction recheck availability. Open mobile notices close and announce release; later mobile E opens the canonical standalone site. Late/throttled timers cannot launch early.

The lock texture is allocated only on state/language changes, survives late GLB loading, and is disposed safely. Unlock restores authored CRT material/UVs. No downloaded assets or model bytes changed.

## Validation

543/543 full tests, strict TypeScript/local Vite build and diff check pass. Thirteen release tests exercise actual App guards, deadline/clock corrections and real accepted GLB lifecycle. Six additional actual World/projection tests cover the fixed camera, transformed parent, planet bending/resize, no locked DOM allocation, movement/look capture and exit/reentry. Existing live iframe/fullscreen, level-camera/jukebox and theater regressions pass.

Local Chromium browser: desktop Play shows the physical close-up; 0 dialogs, 0 iframes, one visible Exit, hidden Fullscreen and active input capture. Exit click and Esc both restore menu capture to false. Held W cannot leave the locked close-up. Resize from 1280×720 to 1440×900 keeps the screen and Exit inside view without overflow. No captured console errors.

Current proof: `desktop-screen-closeup.png`, `desktop-screen-closeup-wide.png`, `desktop-screen-browser-check.json`. `locked-mobile-notice.png` remains the unchanged phone-size design; mobile routing is covered by actual-method touch-device tests. `locked-desktop-notice.png` and `locked-cabinet.png` are earlier comparison screenshots and are superseded for desktop acceptance. No physical phone/headset check or real future-date browser wait was performed.

Copy follow-up: cabinet heading updated to “遊戲 COMING SOON”; 13 release regressions and strict TypeScript/local Vite build pass. Current heading screenshot: `desktop-screen-coming-soon.png`. This wording change remains local.
