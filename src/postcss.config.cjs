// postcss.config.cjs  – CommonJS, Tailwind v4 bridge
const tailwindcssPostcss = require("@tailwindcss/postcss")();
const autoprefixer       = require("autoprefixer");

module.exports = {
  plugins: [tailwindcssPostcss, autoprefixer],
};