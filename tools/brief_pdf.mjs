// Prints docs/brief/brief.html to docs/brief/Gridence_brief.pdf with a locally installed Edge or Chrome, and checks that
// the result has exactly two pages.   node tools/brief_pdf.mjs      (run tools/brief_figure.mjs first for a new figure)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { openBrowser, ROOT, sleep } from "../tests/e2e/harness.mjs";

const source = join(ROOT, "docs", "brief", "brief.html");
const target = join(ROOT, "docs", "brief", "Gridence_brief.pdf");
const b = await openBrowser(9482);
let pages = 0;
try {
  await b.goto(pathToFileURL(source).href);
  await sleep(800);
  const result = await b.send("Page.printToPDF", { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
  const pdf = Buffer.from(result.data, "base64");
  pages = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s])/g) || []).length;
  writeFileSync(target, pdf);
  console.log(`${target}: ${pages} pages, ${pdf.length} bytes`);
} finally {
  await b.close();
}
process.exit(pages === 2 ? 0 : 1);
