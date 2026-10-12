/**
 * The web app's design tokens (web/src/app/globals.css) for NativeWind. Every
 * colour is a CSS variable holding "r g b" channels, so opacity modifiers
 * (`bg-primary/10`) work and light/dark switch at runtime: the values are set
 * from src/theme/palette.json by <ThemeRoot> (src/theme/theme.tsx).
 */
const palette = require("./src/theme/palette.json");

const colors = Object.fromEntries(
  Object.keys(palette.light).map((name) => [name, `rgb(var(--${name}) / <alpha-value>)`])
);

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors,
      borderRadius: { sm: "8px", md: "10px", lg: "12px", xl: "16px", "2xl": "20px", "3xl": "24px" },
    },
  },
  plugins: [],
};
