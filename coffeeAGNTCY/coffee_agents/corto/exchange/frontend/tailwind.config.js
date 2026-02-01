/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        surface: {
          850: "rgb(18 18 22)",
          800: "rgb(24 24 30)",
          750: "rgb(30 30 38)",
          700: "rgb(38 38 48)",
          600: "rgb(55 55 68)",
        },
        accent: {
          blue: "rgb(99 102 241)",
          cyan: "rgb(34 211 238)",
          emerald: "rgb(16 185 129)",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.35s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
