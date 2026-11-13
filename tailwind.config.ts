import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
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
      },
    },
  },
  plugins: [],
};

export default config;
