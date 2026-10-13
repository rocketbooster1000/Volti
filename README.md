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

Use that address to check import, page rendering, and swipe. `localhost` on the phone is the phone, not the PC.

Arrow keys also turn the page when a keyboard is attached.

## Build

```
npm run build
```

This writes a static `dist/` folder. Host those files over HTTPS for Add to Home Screen, the service worker, and the screen wake lock. A static host only serves Volti’s own files. The app does not call an API.

Opening `dist/index.html` from disk (`file://`) will not run the service worker. Wake lock and Home Screen install need a secure context: HTTPS, or `localhost` on that same machine. A plain `http://` address on the LAN is the right check for import and swipe, and the wrong check for the installed app.

After the first HTTPS load, the shell is cached. Airplane mode can open Volti from the Home Screen, including scores still in this site’s private storage. iOS may evict that storage under pressure. If the library disappears, import the PDFs again.

## This version

Import a PDF, then open, rename, delete, and resume at the last page. The reader shows one page on a black surround. Swipe left for the next page, swipe right for the previous page. Tap the left side for previous, the right side for next, and the center to show or hide the close button and page indicator. The screen stays awake while a score is open.
