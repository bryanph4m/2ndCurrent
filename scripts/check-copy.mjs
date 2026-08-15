import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const roots = ["apps/web/app", "apps/web/components", "packages/domain/src/messaging", "README.md"];

const forbidden = [
  { label: "em dash", pattern: /\u2014/g },
  { label: "AI-powered", pattern: /\bAI-powered\b/gi },
  { label: "cutting-edge", pattern: /\bcutting-edge\b/gi },
  { label: "game-changing", pattern: /\bgame-changing\b/gi },
  { label: "next-generation", pattern: /\bnext-generation\b/gi },
  { label: "seamless", pattern: /\bseamless\b/gi },
  { label: "unlock", pattern: /\bunlock\b/gi },
  { label: "supercharge", pattern: /\bsupercharge\b/gi },
  { label: "empower", pattern: /\bempower\b/gi },
  { label: "reimagine", pattern: /\breimagine\b/gi },
  { label: "revolutionize", pattern: /\brevolutionize\b/gi },
  { label: "powerful platform", pattern: /\bpowerful platform\b/gi },
  { label: "intelligent insights", pattern: /\bintelligent insights\b/gi },
];

const extensions = new Set([".ts", ".tsx", ".md", ".json"]);
const violations = [];

async function walk(target) {
  let info;
  try {
    info = await stat(target);
  } catch {
    return [];
  }
  if (info.isFile()) return [target];

  const entries = await readdir(target, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(target, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return nested.flat();
}

for (const root of roots) {
  const files = await walk(root);
  for (const file of files) {
    if (!extensions.has(path.extname(file))) continue;
    const text = await readFile(file, "utf8");
    for (const rule of forbidden) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(text)) {
        violations.push(`${file}: ${rule.label}`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error("Public copy check failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Public copy check passed.");
