// Makes test/index.html from src/index.html, pointing at the pretend backend.
import { readFile, writeFile } from "node:fs/promises";
let h = await readFile("src/index.html", "utf8");
h = h.replace('href="styles.css"', 'href="../src/styles.css"')
     .replaceAll('src="icons/', 'src="../src/icons/').replaceAll('href="icons/', 'href="../src/icons/')
     .replace('src="main.js"', 'src="test-main.js"');
await writeFile("test/index.html", h);
console.log("test/index.html written");
