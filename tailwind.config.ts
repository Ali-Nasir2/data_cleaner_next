import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        soft: "0 10px 30px rgba(2,6,23,0.10)",
      },
      backgroundImage: {
        "radial-fade": "radial-gradient(60% 60% at 50% 0%, rgba(59,130,246,0.22) 0%, rgba(255,255,255,0) 70%)",
      },
    },
  },
  plugins: [],
};
export default config;
