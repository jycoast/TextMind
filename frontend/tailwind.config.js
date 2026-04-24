/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        text: "var(--text)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        hairline: "var(--hairline)",
        panel: "var(--panel)",
        "panel-elevated": "var(--panel-elevated)",
        "panel-input": "var(--panel-input)",
        "sidebar-bg": "var(--sidebar-bg)",
        overlay: "var(--overlay)",
      },
      fontFamily: {
        mono: [
          "Consolas",
          '"Courier New"',
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
