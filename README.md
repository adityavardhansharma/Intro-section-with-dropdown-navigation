# Dead Signal

An original zombie rail shooter that runs inside your browser's DevTools console.

## Files

- `index.html` – the launcher page (play in DevTools, play on the page, or copy the console snippet).
- `dead-signal.js` – the full game script. Paste it into any tab's DevTools console and press Enter.

## Deploy on Vercel

This is a plain static site with no build step.

1. Import this repository in Vercel.
2. Framework preset: **Other**. Leave the build command and output directory empty.
3. Deploy. The launcher is served at `/` and the script at `/dead-signal.js`.

To run it locally, open `index.html` in a browser or serve the folder with any static server (for example `npx serve .`).
