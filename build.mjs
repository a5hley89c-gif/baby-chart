// Builds the app into www/ (used by both the Android app and the web version).
//   node build.mjs
import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";

const BUILD = process.env.BUILD_ID || String(Date.now());
await rm("www", { recursive: true, force: true });
await mkdir("www", { recursive: true });

await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "esm",
  target: ["es2020", "safari15"],
  minify: true,
  sourcemap: false,
  outfile: "www/main.js",
  logLevel: "info"
});

await cp("src/icons", "www/icons", { recursive: true });
await cp("src/styles.css", "www/styles.css");
await cp("src/manifest.webmanifest", "www/manifest.webmanifest");
await cp("src/privacy.html", "www/privacy.html");

const sw = (await readFile("src/sw.js", "utf8")).replaceAll("__BUILD__", BUILD);
await writeFile("www/sw.js", sw);

// cache-bust the script and stylesheet so phones pick up new versions
let html = await readFile("src/index.html", "utf8");
html = html.replace('src="main.js"', `src="main.js?v=${BUILD}"`).replace('href="styles.css"', `href="styles.css?v=${BUILD}"`);
await writeFile("www/index.html", html);
await writeFile("www/.nojekyll", "");
console.log("Built www/ (build " + BUILD + ")");
