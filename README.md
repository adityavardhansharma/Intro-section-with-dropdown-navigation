# Dead Signal

A zombie rail shooter that plays inside your browser's DevTools console. It is built with [Text.js](https://github.com/anomalyco/textjs), so each frame is one appended `console.log` sprite and the console doesn't flicker.

## Play

1. Open the site and open DevTools on the **Console** tab (F12, or Cmd+Option+J on a Mac). Docking it to the side works best.
2. Click the page. The page is your light gun: aim with the mouse anywhere on it and click to shoot.

| Input | Action |
| --- | --- |
| Mouse or arrow keys / WASD | Aim |
| Click, Space or J | Shoot (hold for the SMG) |
| R or right-click | Reload. Press R again while the ring is in the gold zone for a perfect reload and gold rounds |
| Q / E, 1-3 or the wheel | Switch weapon |
| P or Esc | Pause |
| M | Mute |

## What's in it

- Three stages (Kestrel Avenue, Mercy General, the Broadcast Tower), each with a boss: Big Rosie, The Matron and The Warden. Bosses have glowing weak points, and you can counter their swings by shooting the fist.
- Six enemy types. Walkers, runners, crawlers, spitters (shoot their acid out of the air), bloaters (pop them near the pack) and riot zombies with shields.
- Enemies climb out of alleys, drop from windows, rise from the street, come out from behind cars and ambush you from the sides.
- Locational damage. Headshots do triple damage, you can shoot off arms (no more swipes) and legs (they crawl), and shooting a zombie mid-swing staggers it.
- A pistol, plus a shotgun and an SMG from crates and from survivors you save.
- Chain multipliers, multi-kills, a stage grade from S to D, and continues.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000, then open the console
npm run build   # production build (Vercel builds pick the Vercel adapter automatically)
```

On Vercel, `vercel.json` sets the install and build commands, so no project settings need to change.
