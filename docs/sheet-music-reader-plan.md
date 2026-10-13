# Volti — sheet music reader

Plan for Jason Guo. Review before any implementation. This document does not scaffold the app.

## Outcome

Volti is a client-only web app for reading sheet music PDFs on iPhone and iPad. He builds it on Windows. Import a PDF, keep it in the browser’s private storage, and read it one page at a time on a black surround. Turn pages by swiping. The next milestone turns a page from a head movement while both hands stay on the instrument.

V1 is the library and the swipe reader, installable to the Home Screen. Hands-free page turns come after that. Setlists, annotations, and a Bluetooth pedal stay later.

There is no Mac, no Xcode, and no App Store build.

## Name

- **Product:** Volti. **Repo:** `volti`.
- **Origin:** the score marking *volti subito* (V.S.), “turn the page at once.” It fits swipe turns and hands-free turns.
- **Risk:** a San Francisco vocal ensemble already performs as Volti, so an App Store name may need a qualifier later. The repo can still be `volti`.
- **Alternate if Volti is rejected:** Quire (repo `quire`), a gathered set of sheets. Volti stays the recommendation.

## Locked decisions

- **Platform:** a client-only web app. Vite, React, TypeScript, Tailwind. He can build it on Windows and open it on iPhone and iPad.
- **No server.** Do not use Next.js or any other framework that needs a server. A server would violate the no-API rule. The app is a static SPA.
- **No account, no backend, no API keys.** No third-party vision or OCR service.
- **Files stay in the browser.** Import is a file input. PDF bytes go into origin-private storage (OPFS, or IndexedDB if OPFS is unavailable). Safari’s File System Access API is too incomplete to depend on.
- **Pages render with PDF.js,** bundled with the app, including its worker and any cMaps or standard fonts it needs. Nothing is loaded from a CDN.
- **V1** is import, library, and a full-screen single-page reader: swipe and tap, resume at the last page, screen stays awake, black surround.
- **Hands-free is the next milestone,** not v1.
- **Setlists, annotations, and a Bluetooth pedal stay later.**
- **No iCloud, and no sync milestone.** Any later sync is a new decision, because it would send scores off the device.
- **Stage default:** black surround in v1. Page invert waits until after v1.
- **Once installed,** v1 and the hands-free milestone work offline, including airplane mode.

## Offline, no API calls

“No API” means the running app does not call a service. It also means there is no application backend hiding behind the static files.

- Library, import, page memory, and PDF.js rendering use local bytes only. They work with the radios off after the app shell is cached.
- Head pose, when built, runs a face-landmark model that ships inside the app. Camera frames stay in memory and are discarded. They are not uploaded and not written into the library.
- No runtime model download, no Web Speech call, no OCR, no analytics, no crash reporter that phones home.
- **Serving the static files is not an API call.** Vite’s dev server, `vite preview`, and a static host only deliver Volti’s own HTML, JS, CSS, and assets. The app does not `fetch` a backend for scores or for page turns.
- **`file://` will not do.** Open the built `index.html` from disk and you get no service worker and no camera. Both require a secure context (HTTPS, or `localhost` on that same machine). A LAN address over plain `http://` is not a secure context on the iPad.

PDF.js, the service worker, and the landmark model are files bundled at build time. They are not network APIs.

## V1 slice

Ship this and use it on a real score before adding the camera.

- Empty library with one import action.
- Import PDFs, then open, rename, delete, and resume at the last page.
- Full-screen reader: one page, swipe, tap zones, portrait and landscape, black surround, screen stays awake, page indicator.
- Installable PWA. After the first load, the shell opens with no network.

## Later, in this order

1. Hands-free head yaw. Swipe stays the fallback when the camera cannot see him.
2. Invert / high-contrast page rendering, only if the black surround still leaves the page too bright on stage.
3. Setlists, then annotations, then a Bluetooth pedal. Separate passes. Do not bundle them.

A pedal is a weak fit for this platform: iOS Safari does not expose Web Bluetooth. Treat a pedal as a later decision only if the browser gains it, or if the app ever leaves the web. It is not part of v1 or the hands-free milestone.

## Screens and flows

### Import

- From the empty state, and from an add button once scores exist.
- `<input type="file" accept="application/pdf" multiple>`. On iPhone and iPad this opens the system file picker. Read the bytes in the page and write them into private storage. Do not call `showOpenFilePicker`.
- Default title is the file name without `.pdf`. Rename from the library.
- Unreadable or non-PDF input fails with a short error. The library stays as it was.
- Each file is its own score.

### Library

- List on a phone width. Grid once the width is an iPad. Cell: thumbnail, title, page count, and last page after the score has been opened.
- **Open** enters the full-screen reader. First open starts at page 1. Later opens start at the stored page.
- **Rename** changes the display title only. It does not rewrite PDF metadata.
- **Delete** asks for confirmation, then removes the stored PDF, thumbnail, and metadata. The user’s original file is left alone.
- **Resume** writes the current page when it changes, and flushes that write when the page hides or the reader closes.
- Sort is most recently opened first. A new import sorts as just opened. No folders in v1.

### Reader

- Full screen, black page surround. Close, title, and page indicator hide after a short idle and return on a center tap.
- One screen, no extra history entry per page, so a horizontal swipe is a page turn and not Safari’s back gesture.
- Close returns to the library and keeps the page.
- The hands-free control is absent in v1. The reader chrome is where the toggle will go.

### Home Screen

- Web app manifest: name Volti, `display: standalone`, black `background_color` and `theme_color`, icons.
- iOS still wants an apple touch icon and the apple mobile web app capable meta tag. Set both.
- A service worker precaches the app shell (HTML, JS, CSS, PDF.js worker and assets). Use a build-time precache list (vite-plugin-pwa / Workbox is the straightforward Vite tool). Workbox is bundled into the worker at build time. It is not a remote API.
- First load has to reach the server once so the worker can cache the shell. After that, Add to Home Screen opens Volti with no network.
- The hands-free model file joins that precache list in milestone 2, so pose also works in airplane mode after it has been installed once.

## Reader UX

- **Single page.** Render the current page to a canvas with PDF.js. Fit it inside the safe area. Do not use a continuous scroll viewer.
- **Swipe.** Drag toward the left for the next page, toward the right for the previous page. Same directions in portrait and landscape.
- **Tap zones.** Left zone: previous page. Right zone: next page. Center: show or hide chrome. These zones stay active when the camera is off or permission is denied.
- **Landscape.** Required on iPhone and iPad. The page letterboxes on the black surround. It is not cropped. Rotation keeps the current page.
- **Viewport.** Use `100dvh` and `viewport-fit=cover`, and pad for the safe-area insets, so the score sits clear of the home indicator and Safari’s chrome. Standalone Home Screen is the layout to judge.
- **Awake.** While the reader is open, take a screen wake lock (`navigator.wakeLock.request("screen")`). Release it on exit. Re-request it when the page becomes visible again, because the browser drops the lock on hide. Wake lock needs a secure context and Safari 16.4 or later. If the API is missing, reading still works and the operating system may dim the screen.
- **Page indicator.** `current / count`, 1-based, with the chrome. No page scrubber in v1.
- **Large PDFs.** Open the stored blob with PDF.js and draw the visible page only. Prefetch the render of the next and previous page. Cap the canvas pixel ratio (about 2) so a full-page scan does not allocate a huge bitmap on an iPad. The library thumbnail is page 1 at a small size, made at import. If a page is slow, keep the outgoing canvas up until the incoming page is ready. Do not rasterize the whole document at import.

## Hands-free page turns

Milestone 2. The person holding the device turns pages while their hands stay on the instrument. The camera looks at that person during a reading session. It is a page-turn control, not surveillance: no recording, no background camera, no upload.

### Behavior

- Off by default. Toggle lives in the reader chrome.
- Front camera only, via `getUserMedia` with `facingMode: "user"`, and only while the reader is open and the toggle is on.
- Stop the camera tracks when the toggle goes off, the reader closes, the page hides, or the app backgrounds.
- Gesture: a short yaw. Right is next, left is previous. Yaw is the axis so looking down at the stand does not turn the page.
- One motion turns one page. Holding the pose does not repeat.
- Swipe and tap zones work when the camera is off, permission is denied, or the model cannot see a face. Swipe is the fallback. There is no spoken “next” / “back”: iOS Safari’s Web Speech API sends audio to Apple’s servers, which breaks the no-API rule.

### Pose

- Ship a face-landmark model inside the app. Recommended: MediaPipe Face Landmarker, with its WASM runtime and `.task` model committed as build assets and served from the same origin. Point the runtime at those local files. The published package’s default CDN base path must not be used.
- No runtime download and no network request. The service worker precaches the model with the shell.
- Read yaw from the model’s face transformation, or from eye and nose landmarks if that matrix is not in the bundled file. One pipeline.
- Run inference on a downscaled frame (on the order of 128–256 px) at about 10 fps. The score stays full screen. Do not cover it with the camera preview. A small “camera on” state is enough; iOS also shows the system camera indicator.
- If `getUserMedia` fails or the device has no front camera, hide the toggle.

### Calibration, debounce, cooldown

- First enable in a session: look at the page, confirm, store that yaw as zero. Recalibrate from the reader chrome.
- **Debounce.** Yaw must pass the threshold and hold for about a quarter second. A glance or a sway must not turn the page.
- **Cooldown.** After a turn, ignore triggers until the head is back near neutral and about a second has passed.
- Ship conservative thresholds. Add a low / medium / high sensitivity control only if the first device test shows people differ. Store it in local settings.

### Lighting, battery, privacy

- **Lighting.** The model needs a visible face. A dark stage or a blocked camera shows a small “can’t see you” state. Swipe still turns the page. That is the fallback.
- **Battery.** The camera and the model run only in the reader with the feature on. No recording and no photo-library writes.
- **Privacy.** Frames stay in memory and are discarded. Nothing is uploaded. The permission prompt is the browser’s camera prompt. The in-app purpose is page turns.

Test the camera on a real iPhone or iPad over HTTPS, including from the Home Screen icon. A desktop webcam check does not stand in for that.

## Data

Origin-private browser storage for this site. It survives reload. It is not a folder he can see in Files, and it is not permanent.

- **PDF bytes:** OPFS, one file per score (`scores/<uuid>/score.pdf`). If OPFS is missing or throws on that Safari, store the PDF blob in IndexedDB instead. Same metadata either way.
- **Thumbnail:** a small JPEG of page 1 next to the PDF, made with PDF.js at import.
- **Metadata** in IndexedDB, one record per score:
  - `id`
  - `title`
  - `pageCount`
  - `lastPage` (1-based; `1` until the reader moves)
  - `addedAt`
  - `lastOpenedAt` (library sort)
  - where the bytes and thumbnail live
- Do not put PDF bytes in `localStorage`.
- Delete removes that score’s bytes, thumbnail, and metadata record.
- **iOS may evict site storage under pressure,** including OPFS, IndexedDB, and the service-worker cache. Add to Home Screen does not make this permanent. `navigator.storage.persist()` is not a promise iOS will honor. If the library disappears, import the PDFs again.

Settings that are not the library (sensitivity, once it exists) can live in `localStorage`. They can be evicted too.

## Milestones

One developer, on Windows. Each milestone is usable on an iPad before the next starts. Camera, wake lock, and the installed PWA are judged on a device over HTTPS.

### 1. V1 — library and swipe reader

- Vite + React + TypeScript + Tailwind SPA. No server routes.
- File-input import, OPFS or IndexedDB, metadata index, thumbnail, empty state, unreadable-file error.
- Reader: PDF.js single page, swipe, tap zones, landscape, black surround, wake lock, page indicator, persist `lastPage`.
- Manifest, icons, service worker precache of the shell and PDF.js assets.
- Pass on a short PDF and a large scanned PDF, phone and iPad, both orientations.
- Done when a score imported on the iPad can be read through in airplane mode after the shell has loaded once.

### 2. Hands-free

- Camera toggle, default off. Tracks stopped outside the reader.
- Bundled face-landmark model, local WASM, no CDN.
- Calibration, debounce, cooldown, “can’t see you”.
- Airplane-mode check: swipe and head yaw both turn pages. No request leaves the device.

### 3. Later

Leave these until the reader is in regular use.

- **Stage invert.** A separate small pass if paper-white pages are too bright. The black surround is already in v1.
- **Setlists.** Ordered local lists of scores for a rehearsal or service. Stored in the same private storage. No sync.
- **Annotations.** Marks stored per page beside the PDF, so the original bytes stay intact.
- **Bluetooth pedal.** Only if a future platform can see the pedal without sending the score anywhere. Not a Safari milestone today.

Sync is not on this list. Adding it later is a new decision.

## Stage appearance

Decided. V1 draws the page on a black surround so the stand is not a bright chrome UI. Invert / high-contrast page rendering waits until after v1, and only if a dark room still needs it.

## How to run it

On Windows. No Mac.

1. Install Node.js.
2. `npm install` in the repo.
3. Start the dev server bound to the LAN, for example `npm run dev -- --host`.
4. On the iPad, same Wi-Fi, open `http://<windows-lan-ip>:<port>`. Use that pass for layout, import, PDF rendering, and swipe.
5. `npm run build` writes a static `dist/` directory.
6. Host those files as static files, over HTTPS, for the checks that need a secure context: Add to Home Screen, the service worker, the wake lock, and the camera. A static host is still just serving files.

`localhost` on the Windows machine is a secure context for that machine only. The iPad’s `localhost` is the iPad. Plain `http://` to the Windows LAN address is the right swipe check and the wrong camera check. `file://` gives neither a service worker nor a camera.

After the first HTTPS load, turn on airplane mode and open Volti from the Home Screen. The shell and any scores still in private storage should open. Import still works offline when the PDF is already a file on the iPad. If iOS has evicted storage, the shell may need one online load, and the scores need to be imported again.

## Out of scope

- Accounts, subscriptions, sharing, and any sync of score bytes off the device.
- Optical music recognition, playback, transposition, part extraction.
- A native iOS app, Xcode, or an App Store binary.
- Spoken page turns.
- Analytics or crash reporting that sends data off the device.
