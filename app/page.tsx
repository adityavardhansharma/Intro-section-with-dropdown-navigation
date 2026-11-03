import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Text, useInput, useViewport } from "@textjs/app";
import { Pixels, useKeyState, type PixelSource } from "@textjs/react/experimental";
import { Game, type Hud } from "../lib/game";

const FRAME_MS = 1000 / 30;

function bar(n: number, max: number, on: string, off: string): string {
  return on.repeat(Math.max(0, Math.min(max, n))) + off.repeat(Math.max(0, max - n));
}

function ReloadBar({ hud }: { hud: Hud }): ReactNode {
  if (hud.reload === null) return null;
  const N = 18;
  const cells: ReactNode[] = [];
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const done = t <= hud.reload;
    const sweet = t >= hud.sweet[0] && t <= hud.sweet[1];
    cells.push(
      <Text key={i} color={sweet ? (done ? "#fff3a0" : "#ffd84a") : done ? "#ffffff" : "#44444c"}>
        {done ? "█" : sweet ? "▒" : "░"}
      </Text>,
    );
  }
  return (
    <Text>
      <Text color="#ffd84a">RELOAD </Text>
      {cells}
      <Text color="#8a8a96"> tap R in the gold</Text>
    </Text>
  );
}

export default function Page(): ReactNode {
  const vp = useViewport();
  const game = useRef<Game | null>(null);
  const [ready, setReady] = useState(false);
  const [frame, setFrame] = useState(0);
  const [hud, setHud] = useState<Hud | null>(null);
  const autoPaused = useRef(false);

  // The game needs a real <canvas>, so it starts in the browser, never during prerendering.
  useEffect(() => {
    const g = new Game();
    game.current = g;
    (globalThis as { __deadSignal?: Game }).__deadSignal = g;
    g.render();
    setHud(g.hud());
    setReady(true);
  }, []);

  const active = ready && vp.focused && !vp.paused;

  // Pause while the page is unfocused (you're typing in DevTools) and resume when you click back.
  useEffect(() => {
    const g = game.current;
    if (!g) return;
    if (!active && g.mode === "play" && !g.paused) {
      g.paused = true;
      autoPaused.current = true;
    } else if (active && autoPaused.current) {
      g.paused = false;
      autoPaused.current = false;
    }
    g.render();
    setFrame((f) => f + 1);
    setHud(g.hud());
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const g = game.current!;
    let last = performance.now();
    let lastFrame = 0;
    let raf = 0;
    const step = (): void => {
      const now = performance.now();
      g.update((now - last) / 1000);
      last = now;
      if (now - lastFrame >= FRAME_MS) {
        lastFrame = now;
        g.render();
        setFrame((f) => f + 1);
        setHud(g.hud());
      }
    };
    const loop = (): void => {
      step();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    // rAF can stall while DevTools holds focus; a timer keeps the game moving.
    const timer = setInterval(() => {
      if (performance.now() - last > 60) step();
    }, 50);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, [active]);

  // The page is the light gun: aim with the mouse anywhere on it, click to shoot.
  useEffect(() => {
    if (!ready) return;
    const g = game.current!;
    const move = (e: MouseEvent): void => g.aimAt(e.clientX / Math.max(1, innerWidth), e.clientY / Math.max(1, innerHeight));
    const down = (e: MouseEvent): void => {
      g.aimAt(e.clientX / Math.max(1, innerWidth), e.clientY / Math.max(1, innerHeight));
      if (e.button === 2) g.reloadKey();
      else if (e.button === 0) g.press();
    };
    const up = (e: MouseEvent): void => {
      if (e.button === 0) g.release();
    };
    const ctx = (e: MouseEvent): void => e.preventDefault();
    const wheel = (e: WheelEvent): void => g.wheel(e.deltaY);
    window.addEventListener("mousemove", move, true);
    window.addEventListener("mousedown", down, true);
    window.addEventListener("mouseup", up, true);
    window.addEventListener("contextmenu", ctx, true);
    window.addEventListener("wheel", wheel, { capture: true, passive: true });
    return () => {
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("mouseup", up, true);
      window.removeEventListener("contextmenu", ctx, true);
      window.removeEventListener("wheel", wheel, true);
    };
  }, [ready]);

  useKeyState((e) => {
    game.current?.key(e.code, e.down);
  });
  useInput((e) => {
    // Keep game keys away from the router and focus handling.
    if (game.current && /^(Key[A-Z]|Digit\d|Space|Enter|Escape|Arrow\w+)$/.test(e.code)) e.stopPropagation();
  });

  const availCols = Math.max(32, vp.cols - 2);
  const availRows = Math.max(9, vp.rows - 4);
  const cols = Math.min(availCols, Math.round((availRows * 32) / 9));
  const rows = Math.min(availRows, Math.round((cols * 9) / 32));

  const h = hud;
  return (
    <Box className="flex-col w-full h-full items-center">
      <Box width={cols} height={1} flexDirection="row" justifyContent="space-between">
        <Text wrap="nowrap">
          <Text color="#c8ff5a" bold>
            ▼ DEAD SIGNAL
          </Text>
          <Text color="#6a6a78">{h ? `  ${h.stage}` : ""}</Text>
        </Text>
        <Text wrap="nowrap">
          {h && h.chain > 1 ? (
            <Text color="#ff9a3a" bold>{`CHAIN ${h.chain}  x${h.mult.toFixed(1)}   `}</Text>
          ) : null}
          <Text color="#ffffff" bold>{h ? String(h.score).padStart(8, "0") : "00000000"}</Text>
          <Text color="#6a6a78">{h ? `  BEST ${h.best}` : ""}</Text>
        </Text>
      </Box>
      <Box width={cols} height={rows}>
        {ready && game.current ? (
          <Pixels source={game.current.source as PixelSource} frame={frame} width={cols} height={rows} />
        ) : (
          <Box width={cols} height={rows} bg="#05060f" alignItems="center" justifyContent="center">
            <Text color="#c8ff5a">DEAD SIGNAL · loading…</Text>
          </Box>
        )}
      </Box>
      <Box width={cols} height={1} flexDirection="row" justifyContent="space-between">
        <Text wrap="nowrap">
          <Text color="#8a8a96">HP </Text>
          <Text color="#ff3b4a">{h ? bar(h.hp, h.maxHp, "♥", "") : ""}</Text>
          <Text color="#3a2a2e">{h ? "♡".repeat(Math.max(0, h.maxHp - h.hp)) : ""}</Text>
          <Text color="#8a8a96">{"   "}</Text>
          {h ? (
            <Text>
              <Text color={h.golden > 0 ? "#ffd84a" : "#e0e0e8"} bold>{`${h.weapon} `}</Text>
              <Text color={h.golden > 0 ? "#ffd84a" : "#e6b84a"}>{bar(h.ammo, Math.min(h.mag, 30), "▮", "")}</Text>
              <Text color="#3a3a42">{"▯".repeat(Math.max(0, Math.min(h.mag, 30) - h.ammo))}</Text>
              <Text color="#8a8a96">{h.reserve === null ? "  ∞" : `  +${h.reserve}`}</Text>
              {h.golden > 0 ? <Text color="#ffd84a">{"  GOLD ROUNDS"}</Text> : null}
            </Text>
          ) : null}
        </Text>
        {h ? <ReloadBar hud={h} /> : <Text> </Text>}
      </Box>
      <Box width={cols} height={1}>
        <Text color="#5a5a66" wrap="truncate-end">
          {vp.focused
            ? "mouse/arrows aim · click/space shoot · R reload (again in gold = perfect) · Q/E/1-3 weapons · P pause · M mute"
            : "click the page to play · the page is your light gun"}
        </Text>
      </Box>
    </Box>
  );
}
