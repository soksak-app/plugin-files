// Builds the UI tree of the tests (build/test/ui) with each @soksak/* import rewritten to its model in test/sdk-models.
// The tests run this tree, so no test loads the SDK. A UI import of an SDK name without a model, or of a name the model
// does not export, fails the build. The models are the consumer-boundary fakes of the plugin; their conformance to the
// published cases is checked by test/sdk-models/conformance.test.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceUI = path.join(root, "ui");
const sourceModels = path.join(root, "test", "sdk-models");
const outputRoot = path.join(root, "build", "test");
const outputUI = path.join(outputRoot, "ui");
const outputModels = path.join(outputRoot, "sdk-models");

// Each SDK specifier maps to its model file (relative to test/sdk-models) and the names that the model exports.
const MODELS = {
  "@soksak/plugin-api": { file: "expose.mjs", names: ["createExpose"] },
  "@soksak/plugin-api/view": { file: "view.mjs", names: ["createViewBridge"] },
};

const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
});

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.cpSync(sourceUI, outputUI, { recursive: true });
fs.cpSync(sourceModels, outputModels, { recursive: true });

let rewritten = 0;
for (const file of walk(outputUI).filter((name) => /\.(?:mjs|js)$/.test(name))) {
  const source = fs.readFileSync(file, "utf8");
  const next = source.replace(/import\s+(\{[^}]*\})\s+from\s+(["'])(@soksak\/[^"']+)\2\s*;?/g, (statement, names, quote, specifier) => {
    const model = MODELS[specifier];
    if (!model) throw new Error(`no test model for ${specifier} imported by ${path.relative(root, file)}`);
    const imported = names.slice(1, -1).split(",").map((name) => name.trim()).filter(Boolean).map((name) => name.split(/\s+as\s+/)[0]);
    for (const name of imported) {
      if (!model.names.includes(name)) throw new Error(`test model of ${specifier} does not export ${name} (${path.relative(root, file)})`);
    }
    const target = path.relative(path.dirname(file), path.join(outputModels, model.file)).split(path.sep).join("/");
    return `import ${names} from ${quote}${target.startsWith(".") ? target : "./" + target}${quote};`;
  });
  if (next !== source) {
    fs.writeFileSync(file, next);
    rewritten += 1;
  }
  if (/from\s+["']@soksak\//.test(next) || /import\(\s*["']@soksak\//.test(next)) {
    throw new Error(`SDK specifier left in test UI tree: ${path.relative(root, file)}`);
  }
}
console.log(`Built test UI tree: ${walk(outputUI).length} files, ${rewritten} rewritten to test models`);
