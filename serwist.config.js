/** @type {import("@serwist/cli").BuildOptions} */
module.exports = {
  globDirectory: ".",
  globPatterns: [
    ".next/static/**/*.{js,css,html,ico,apng,png,avif,jpg,jpeg,jfif,pjpeg,pjp,gif,svg,webp,json,webmanifest}",
    "public/**/*",
  ],
  modifyURLPrefix: {
    ".next/": "/_next/",
    "public/": "/",
  },
  globIgnores: ["public/sw.js", "public/sw.js.map"],
  additionalPrecacheEntries: [{ url: "/~offline", revision: null }],
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
};
