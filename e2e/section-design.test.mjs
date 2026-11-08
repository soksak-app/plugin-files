// Leaves stills of the files sections in light and dark modes for inspection at original resolution in build/section-design/. An
// image is an observation and no result of a check; the check fails when a section does not mount or reports an error.
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { APPS, open } from "@soksak/window-check/app.mjs";
import { cardSidebar, fresh, START_PROBE } from "./start.mjs";

const OUTPUT = new URL("../build/section-design/", import.meta.url).pathname;

/** Waits until the sidebar shows every section mounted and free of errors. */
async function shown(s, sidebar, sections) {
  await s.until("core.sidebars", (bars) => {
    const bar = bars.find((item) => item.sidebar === sidebar);
    return bar && sections.every((id) => bar.sections.find((item) => item.id === id)?.mounted)
      && bar.sections.every((item) => item.error === null);
  }, `${sidebar} did not mount ${sections.join(", ")}`);
}

for (const app of Object.values(APPS))
  test(`${app.name}: stills of the files sections in each mode`, { timeout: 120000 }, async (t) => {
    const s = await open(t, app);
    await fresh(s);
    const project = await s.until("core.project", (value) => value?.root, "the fixture project was not shown");
    const folder = mkdtempSync(join(project.root, "design-"));
    s.cleanup(() => rmSync(folder, { recursive: true, force: true }));
    for (const name of ["alpha.txt", "beta.md", "gamma.json"]) writeFileSync(join(folder, name), "text\n");
    // The environment of the application links the set set-install (tree, bookmarks) to the left sidebar; a card sidebar shows the same
    // sections beside it on a card of the start probe.
    const [sidebar] = await cardSidebar(s, { plugin: START_PROBE, sections: ["files.tree", "files.bookmarks"] });
    await shown(s, "left", ["files.tree", "files.bookmarks"]);
    await shown(s, sidebar, ["files.tree", "files.bookmarks"]);
    mkdirSync(OUTPUT, { recursive: true });
    for (const mode of ["light", "dark"]) {
      await s.run("core.settings.set", { patch: { mode } });
      await s.until("core.settings", (value) => value.values.mode === mode, `the mode did not become ${mode}`);
      await s.presented();
      const { path } = await s.request("diagnostics.capture.still", {});
      s.cleanup(() => rmSync(dirname(path), { recursive: true, force: true }));
      copyFileSync(path, join(OUTPUT, `${app.name}-${mode}.png`));
      unlinkSync(path);
      t.diagnostic(`still ${join(OUTPUT, `${app.name}-${mode}.png`)}`);
    }
  });
