import { readFileSync } from "node:fs";
import { classifyProductCategory } from "../src/lib/catalog/category-classifier";
const paths = JSON.parse(readFileSync("/tmp/claude-0/scratch/paths.json", "utf8")) as Record<string, string[]>;
const allow: Record<string, string[]> = JSON.parse(readFileSync("config/catalog-discovery.json", "utf8")).departments;
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const counts: Record<string, number> = {};
const lines: string[] = [];
for (const [source, list] of Object.entries(paths)) {
  const allowed = new Set(allow[source]!.map(fold));
  for (const path of list) {
    const segs = path.split(" / ");
    if (!allowed.has(fold(segs[0]!))) continue;
    const cat = classifyProductCategory({ name: null, storePath: segs }) ?? "(none)";
    counts[cat] = (counts[cat] ?? 0) + 1;
    lines.push(`${cat.padEnd(20)} ${source.padEnd(9)} ${path}`);
  }
}
console.log(counts);
console.log(lines.sort().join("\n"));
