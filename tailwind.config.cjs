// tailwind.config.cjs
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          50:  "#F0F7FF",
          100: "#D9ECFF",
          200: "#B8DFFF",
          500: "#3B82F6",
        },
        accent: {
          100: "#FDF2F8",
          400: "#EC4899",
          500: "#DB2777",
        },
        neutral: {
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          700: "#374151",
        }
      },
      boxShadow: {
        card: "0 1px 4px rgba(0,0,0,0.06)",
        dropdown: "0 4px 12px rgba(0,0,0,0.1)",
      },
      borderRadius: {
        xl: "1rem",
      },
    },
  },
  plugins: [],
};
