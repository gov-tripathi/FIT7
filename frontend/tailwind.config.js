/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary accent — cyan "ice".
        brand: {
          50: "#ecfeff",
          100: "#cffafe",
          200: "#a5f3fc",
          300: "#67e8f9",
          400: "#22d3ee",
          500: "#06b6d4",
          600: "#0891b2",
          700: "#0e7490",
          800: "#155e75",
          900: "#164e63",
        },
        // Volt — Nike-style electric lime-yellow. The energy color.
        volt: {
          300: "#e4ff50",
          400: "#d4ff00",
          500: "#b8ff00",
          600: "#92d400",
        },
        // Ember — hot orange accent for heat/calorie/intensity.
        ember: {
          300: "#ffa26b",
          400: "#ff6b35",
          500: "#ff4d1f",
          600: "#d63d0f",
        },
        lime: {
          400: "#a3e635",
          500: "#84cc16",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        display: [
          "Oswald",
          "Impact",
          "Archivo Narrow",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      letterSpacing: {
        brutal: "0.12em",
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(6, 182, 212, 0.45)",
        "glow-volt": "0 0 50px -12px rgba(212, 255, 0, 0.55)",
        "glow-ember": "0 0 50px -12px rgba(255, 107, 53, 0.55)",
        "press": "inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 0 rgba(0,0,0,0.4)",
      },
      backgroundImage: {
        // Diagonal stripe texture for athletic "track" feel.
        stripes:
          "repeating-linear-gradient(135deg, rgba(148,163,184,0.05) 0 1px, transparent 1px 8px)",
        // Subtle grid lines like a stadium track.
        grid: "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-lg": "48px 48px",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(212, 255, 0, 0.6)" },
          "50%": { boxShadow: "0 0 0 10px rgba(212, 255, 0, 0)" },
        },
        slideRight: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        pulseGlow: "pulseGlow 2s ease-in-out infinite",
        slideRight: "slideRight 2.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
