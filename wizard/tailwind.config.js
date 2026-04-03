/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: { extend: { colors: { ovni: { bg: "#0a0a12", surface: "#0d0f1a", border: "rgba(127,119,221,0.2)", accent: "#7F77DD", purple: "#c4b5fd", green: "#5DCAA5", text: "#e2e8f0", muted: "#64748b", dark: "#080810" } } } },
  plugins: [],
};
