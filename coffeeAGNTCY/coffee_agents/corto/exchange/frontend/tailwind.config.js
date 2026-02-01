/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        serif: ["Cormorant Garamond", "Georgia", "serif"],
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
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        float: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(2%, -2%) scale(1.02)" },
          "66%": { transform: "translate(-1%, 1%) scale(0.98)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "10%, 30%, 50%, 70%, 90%": { transform: "translateX(-4px)" },
          "20%, 40%, 60%, 80%": { transform: "translateX(4px)" },
        },
        glow: {
          "0%, 100%": { boxShadow: "0 0 20px -4px rgba(99, 102, 241, 0.35)" },
          "50%": { boxShadow: "0 0 32px -2px rgba(99, 102, 241, 0.5)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "slide-up": "slideUp 0.35s ease-out",
        float: "float 18s ease-in-out infinite",
        shake: "shake 0.5s ease-in-out",
        glow: "glow 2.5s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)",
      },
    },
  },
  plugins: [],
};
