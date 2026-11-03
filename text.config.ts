import { defineConfig } from "@textjs/app";

export default defineConfig({
  title: "Dead Signal",
  viewport: { width: 120, height: 40, theme: "geistDark" },
  hints: [
    { keys: "mouse", label: "aim" },
    { keys: "click", label: "shoot" },
    { keys: "R", label: "reload" },
  ],
  action: "click to start",
});
