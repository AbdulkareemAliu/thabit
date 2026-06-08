#!/usr/bin/env node
/**
 * Catches missing React/component imports in main.tsx.
 * Run: node scripts/audit-main-imports.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(path.join(root, "src/main.tsx"), "utf8");

const defined = new Set();
for (const m of src.matchAll(/^(?:function|const) ([A-Za-z_$][\w$]*)/gm)) defined.add(m[1]);

const imported = new Set();
for (const m of src.matchAll(/^import\s+(?:type\s+)?{([^}]+)}/gm)) {
  for (const part of m[1].split(",")) {
    const name = part.trim().split(/\s+as\s+/).pop()?.trim();
    if (name) imported.add(name);
  }
}
for (const m of src.matchAll(/^import\s+([A-Za-z_$][\w$]*)\s+from/gm)) imported.add(m[1]);

// Exclude TypeScript generics like useState<ScreenState>
const jsxTags = [
  ...new Set(
    [...src.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)]
      .map((m) => m[1])
      .filter((t) => !src.includes(`type ${t}`) && !src.includes(`type ${t} =`)),
  ),
];
const missingJsx = jsxTags.filter((t) => !defined.has(t) && !imported.has(t));

const reactHooks = ["useState", "useEffect", "useMemo", "useCallback", "useRef", "useLayoutEffect", "Fragment"];
const missingReact = reactHooks.filter((h) => src.includes(h) && !imported.has(h));

const requiredComponents = ["StepStatusIcon", "LessonStatusIcon", "WritingStudyPanel", "VocabularyImage"];
const missingComponents = requiredComponents.filter((c) => !defined.has(c) && !imported.has(c));

const problems = [
  ...missingJsx.map((n) => `Missing JSX/import: ${n}`),
  ...missingReact.map((n) => `Missing React import: ${n}`),
  ...missingComponents.map((n) => `Missing component: ${n}`),
];

if (!src.includes('import "./styles.css"')) problems.push('Missing import "./styles.css"');

if (problems.length) {
  console.error("audit-main-imports: FAILED\n" + problems.map((p) => `  - ${p}`).join("\n"));
  process.exit(1);
}

console.log("audit-main-imports: OK");
