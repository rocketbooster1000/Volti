# Volti

Volti reads sheet music PDFs one page at a time. Scores stay in this browser, on this device. There is no account and no server.

The name is the score marking *volti subito*: turn the page at once.

## Run it on Windows

1. Install Node.js.
2. In this folder:

```
npm install
npm run dev -- --host
```

3. On this PC, open http://localhost:43123
4. On an iPhone or iPad on the same Wi-Fi, open `http://<the-pc-lan-ip>:43123`

Use that address to check import, page rendering, and swipe. `localhost` on the phone is the phone, not the PC. The camera check is separate and needs HTTPS. See below.

Arrow keys also turn the page when a keyboard is attached.

## Build

```
npm run build
```

This writes a static `dist/` folder. Host those files over HTTPS for Add to Home Screen, the service worker, and the screen wake lock. A static host only serves Volti’s own files. The app does not call an API.

Opening `dist/index.html` from disk (`file://`) will not run the service worker. Wake lock, Home Screen install, and the camera need a secure context: HTTPS, or `localhost` on that same machine. A plain `http://` address on the LAN is the right check for import and swipe, and the wrong check for the installed app or the camera.

After the first HTTPS load, the shell is cached. Airplane mode can open Volti from the Home Screen, including scores still in this site’s private storage. iOS may evict that storage under pressure. If the library disappears, import the PDFs again.

## Hands-free page turns

Hands-free is off until you turn it on in the reader. A short turn of your head to your right goes to the next page. A turn to your left goes back. Looking down at the stand does not turn the page. One motion turns one page. The first time you turn it on while a score is open, look straight at the page and confirm. That direction is the center. Recalibrate from the reader if you move the stand.

The front camera runs only while that score is open and the switch is on. It stops when you turn the switch off, close the score, or leave the app. Frames stay in memory. Nothing is uploaded. There is no camera preview on the score.

Swipe and the tap zones still turn the page if the camera is off, permission is denied, or the model cannot see a face.

### Camera on an iPhone or iPad

The camera needs a secure context. On `http://<the-pc-lan-ip>:43123` the switch can still show, and a denied or missing camera must leave the reader usable, but the iPad will not grant the camera on plain HTTP.

`localhost` on the PC is a secure context for the PC only. It is not the iPad.

To check the camera on the device, open an HTTPS tunnel from the PC and use that address on the iPad:

```
cloudflared tunnel --url http://localhost:43123
```

Install `cloudflared` if you do not have it. The command prints an `https://` address. Open that on the iPad. Volti has no backend. The tunnel only forwards the pages this dev server already serves.

Add to Home Screen and the service worker need that same HTTPS address. After one HTTPS load, airplane mode can open the app, including the face model, from the cache.

## This version

Import a PDF, then open, rename, delete, and resume at the last page. The reader shows one page on a black surround. Swipe left for the next page, swipe right for the previous page. Tap the left side for previous, the right side for next, and the center to show or hide the close button and page indicator. Hands-free head turns are optional and off by default. The screen stays awake while a score is open.
