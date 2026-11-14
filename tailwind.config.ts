import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-serif", "Georgia", "serif"],
      },
      colors: {
        brand: {
          50: "#fdf7ed",
          100: "#faecd2",
          200: "#f3d49e",
          300: "#eab868",
          400: "#dd9a3c",
          500: "#c9801f",
          600: "#a66316",
          700: "#824a15",
          800: "#6b3c17",
          900: "#5a3217",
        },
        ink: {
          50: "#f7f6f5",
          100: "#e7e4e1",
          200: "#cfc9c3",
          300: "#a89e95",
          400: "#7d7268",
          500: "#5c5248",
          600: "#453c34",
          700: "#342c26",
          800: "#241e19",
          900: "#1c1917",
          950: "#13100e",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(28,25,23,0.04), 0 4px 16px -4px rgba(28,25,23,0.08)",
        card: "0 1px 3px rgba(28,25,23,0.06), 0 8px 24px -8px rgba(28,25,23,0.10)",
        "card-hover": "0 2px 6px rgba(28,25,23,0.08), 0 16px 32px -12px rgba(166,99,22,0.18)",
        gold: "0 4px 14px -4px rgba(166,99,22,0.35)",
      },
      backgroundImage: {
        "sidebar-sheen": "linear-gradient(180deg, rgba(234,184,104,0.08) 0%, rgba(28,25,23,0) 30%)",
      },
    },
  },
  plugins: [],
};

export default config;
