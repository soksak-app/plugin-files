// The section-view entries of the view benchmark (core docs/spec/plugin-processes.md#section-views) at the consumer boundary.
// diagnostics.json declares files.view.frames, files.view.history and a ready status for each section with its module; in a diagnostic
// build the start values carry that declaration, and each section view (tree and bookmarks) serves the two commands and its own status
// on its own surface. The real page modules run in views of this repository's view host (test/fixtures/host.mjs), and the frame observer
// is the observer of the view document of the diagnostic-view-frames entry of the plugin API, which the section module starts.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { openSurfaceView } from "./fixtures/host.mjs";
import { filesSidecar, SIDECAR } from "./fixtures/files-sidecar.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (file) => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const manifest = readJson("plugin.json");
const pkg = readJson("package.json");
// diagnostics.json is read by each test, so a missing file fails each test that reads it.
const readDiagnostics = () => readJson("diagnostics.json");
// The project that the fixture `fresh` of core opens: a folder of the configuration directory, without bookmarks.
const FRESH_PROJECT = { id: "project-fresh", root: "/config/test-project" };
const PROJECT = { id: "project-1", root: "/work/project" };
const NO_PROJECT_TEXT = "프로젝트 없음";
const ROW = { path: "readme.md", name: "readme.md", directory: false, depth: 0, expanded: false, selected: false };

// The theme of the view: the tokens that the host sets on the root of the view document (core packages/workbench/settings.js).
const THEME = { "--bg": "#14161e", "--card": "#191b24", "--edge": "#2a2d3a", "--rule": "#23252f", "--focus": "#5b8cff" };
const THEME_COLORS = ["--card", "--bg", "--edge", "--rule", "--focus"];
const rgbOf = (hex) => [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
const hexOf = (rgb) => `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

/** The name of the ready status of `section`, and that entry of a diagnostic declaration. */
const readyName = (section) => `${section}.view.ready`;
const readyEntry = (section, diagnostics = readDiagnostics()) => diagnostics.exposes.status.find((entry) => entry.name === readyName(section));
const contentOf = (section) => readyEntry(section).schema.properties.content.enum[0];

/** The declarations of a diagnostic build: the exposes of plugin.json with the exposes of diagnostics.json added. */
function diagnosticDeclarations() {
  const merged = {};
  for (const bundle of [manifest.exposes, readDiagnostics().exposes]) {
    for (const [kind, entries] of Object.entries(bundle)) merged[kind] = [...(merged[kind] ?? []), ...entries];
  }
  return merged;
}

// Each section: its page, its surface, the class of the element that shows its text, that text, and the states of the view
// in which that element shows something else.
const SECTIONS = {
  "files.tree": {
    module: "tree.js",
    surface: "spc-1/card-4:left/files.tree",
    element: "files-tree__title",
    content: "test-project",
    others: { "another project folder": { project: PROJECT, entries: [ROW] }, "no project": { project: null } },
  },
  "files.bookmarks": {
    module: "bookmarks.js",
    surface: "spc-1/card-4:left/files.bookmarks",
    element: "files-bookmarks__message",
    content: "북마크 없음",
    others: { "a stored bookmark": { bookmarks: ["readme.md"] }, "no project": { project: null } },
  },
};
// The schema subset of core (core docs/spec/exposure.md).
const SCHEMA_FIELDS = ["type", "properties", "items", "enum"];
const SCHEMA_TYPES = ["string", "number", "integer", "boolean", "object", "array", "null"];
const elementOf = (view, section) => view.window.document.querySelector(`.${SECTIONS[section].element}`);
const PAGE_OF = (module) => new URL(`../ui/${module}`, import.meta.url);

/**
 * Starts the section view `section` in a view of the test host, and loads its page module. By default it starts as the view benchmark
 * does: with the diagnostic declaration, in the project of the fixture `fresh` and without bookmarks. `entries` are the rows of the tree
 * and `bookmarks` the stored paths of the project. Resolves with the view and the error of the page load (null when the page loaded).
 */
async function startSection(t, section, { theme = THEME, withDiagnostics = true, diagnostics = readDiagnostics(), startValues = null, project = FRESH_PROJECT, entries = [], bookmarks = [] } = {}) {
  const { module, surface } = SECTIONS[section];
  const declarations = withDiagnostics ? diagnosticDeclarations() : manifest.exposes;
  const start = startValues ?? {
    surface,
    params: null,
    origin: { directory: null },
    project,
    declarations,
    diagnostics: withDiagnostics ? diagnostics : null,
    section: { id: section, sidebar: "card-4:left", card: "card-4" },
  };
  const files = filesSidecar({ generation: 1, selected: null, entries });
  // The theme tokens are set on the root by the start script of the view, before the page runs.
  const view = openSurfaceView({
    start,
    theme: { tokens: theme },
    sidecars: { [SIDECAR]: (body) => files.route(body) },
    data: { bookmarks },
  });
  t.after(() => view.close());
  files.attach(view, surface);
  let failure = null;
  // The module awaits its start, so the start of the view ends when the load resolves or rejects.
  try {
    await view.load(PAGE_OF(module));
  } catch (error) {
    failure = error;
  }
  return { view, surface, failure };
}

let exposureRequests = 0;
/** One exposure request of the surface: the answer of the page is the payload of its exposureReply call, returned as {result} or {error}. */
async function exposure(view, surface, method, params) {
  const id = `probe-${++exposureRequests}`;
  view.push("exposure-request", { id, surface, method, params });
  await view.settled();
  const reply = view.calls.findLast((call) => call.command === "runtime.native.call" && call.params.name === "exposureReply" && call.params.payload.id === id);
  assert.ok(reply, `the page did not answer ${method} ${id}`);
  const { id: _id, ...answer } = reply.params.payload;
  return answer;
}
const readyStatus = async (view, section) => {
  const answer = await exposure(view, SECTIONS[section].surface, "status.get", { name: readyName(section) });
  return answer.error === undefined ? { result: answer.result } : { error: answer.error.message };
};
// The payloads {name, value, version} of the changed calls of the page for the status name, in order.
const changedOf = (view, name) => view.calls
  .filter((call) => call.command === "runtime.native.call" && call.params.name === "changed" && call.params.payload.name === name)
  .map((call) => call.params.payload);
// The command of the page, run as the host runs a command of a view: its result, or {error} with the message of its failure.
const run = async (view, command, params) => {
  try {
    return { result: await view.request(command, params) };
  } catch (error) {
    return { error: error.message };
  }
};
// The rules of the paint of the view document: the :root rule of each adopted sheet, serialized in order.
const paintText = (view) => view.window.document.adoptedStyleSheets.map((sheet) => [...sheet.cssRules].map((rule) => rule.cssText).join("")).join("");
const rootRule = (view) => {
  const rules = view.window.document.adoptedStyleSheets.flatMap((sheet) => [...sheet.cssRules]).filter((rule) => rule.selectorText === ":root");
  return rules.at(-1)?.style ?? null;
};

test("diagnostics.json declares the section-view entries with its module, and the package lists both", () => {
  const diagnostics = readDiagnostics();
  assert.equal(diagnostics.module, "ui/section-diagnostics.js");
  assert.deepEqual(diagnostics.exposes.commands.map((entry) => entry.name), ["files.view.frames", "files.view.history"]);
  assert.deepEqual(diagnostics.exposes.status.map((entry) => entry.name), Object.keys(SECTIONS).map(readyName));
  assert.deepEqual(diagnostics.exposes.commands[0].params.properties.action, { type: "string", enum: ["start", "stop"] });
  assert.ok(pkg.files.includes("diagnostics.json"), "package.json files does not list diagnostics.json");
  const [pack] = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8" }));
  const packed = new Set(pack.files.map((entry) => entry.path));
  for (const file of ["diagnostics.json", diagnostics.module]) assert.ok(packed.has(file), `${file} is not in the package`);
});

for (const [section, { content }] of Object.entries(SECTIONS)) {
  test(`${readyName(section)} declares content as an enum of one string`, () => {
    assert.deepEqual(readyEntry(section).schema.properties, {
      ready: { type: "boolean" },
      content: { type: "string", enum: [content] },
    });
  });
}

// The exposure check of core finds a status by its written name, so a name built from the section id counts as not registered.
test("each view writes the name of its status at its registration", () => {
  for (const [section, { module }] of Object.entries(SECTIONS)) {
    const source = readFileSync(path.join(root, "ui", module), "utf8");
    assert.ok(source.includes(`expose.status("${readyName(section)}"`), `ui/${module} does not write ${readyName(section)} at its registration`);
  }
});

/** The places in the schema `schema` at `where` that the schema subset of core refuses (core docs/spec/exposure.md). */
function subsetViolations(schema, where) {
  if (schema === null || typeof schema !== "object" || Array.isArray(schema)) return [`${where} is not an object`];
  const violations = Object.keys(schema).filter((field) => !SCHEMA_FIELDS.includes(field)).map((field) => `${where} has the field ${field}`);
  if (schema.type !== undefined && ![schema.type].flat().every((name) => SCHEMA_TYPES.includes(name))) violations.push(`${where} has the type ${JSON.stringify(schema.type)}`);
  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) violations.push(`${where} has an enum that is not a non-empty list`);
  for (const [name, property] of Object.entries(schema.properties ?? {})) violations.push(...subsetViolations(property, `${where}.properties.${name}`));
  if (schema.items !== undefined) violations.push(...subsetViolations(schema.items, `${where}.items`));
  return violations;
}

test("every schema of diagnostics.json holds only the fields of the schema subset", () => {
  const entries = Object.values(readDiagnostics().exposes).flat();
  const schemas = entries.flatMap((entry) => ["schema", "params", "result"].filter((key) => entry[key] !== undefined).map((key) => [`${entry.name} ${key}`, entry[key]]));
  assert.equal(schemas.length, entries.length + 2, "a status has one schema and a command has params and a result");
  assert.deepEqual(schemas.flatMap(([where, schema]) => subsetViolations(schema, where)), []);
});

test("no name of diagnostics.json is declared in plugin.json", () => {
  const declared = new Set(Object.values(manifest.exposes).flat().map((entry) => entry.name));
  for (const entry of Object.values(readDiagnostics().exposes).flat()) assert.equal(declared.has(entry.name), false, entry.name);
});

for (const section of Object.keys(SECTIONS)) {
  test(`${section} in the state of the fixture fresh shows its declared content and is ready`, async (t) => {
    const { view, failure } = await startSection(t, section);
    assert.equal(failure, null);
    assert.equal(elementOf(view, section).textContent, contentOf(section));
    assert.equal(elementOf(view, section).hidden, false);
    assert.deepEqual(await readyStatus(view, section), { result: { ready: true, content: contentOf(section) } });
    assert.deepEqual(view.observed.errors, []);
  });

  test(`${section} registers its own ready status and no other`, async (t) => {
    const { view } = await startSection(t, section);
    const names = view.registered("status").filter((name) => name.endsWith(".view.ready"));
    assert.deepEqual(names, [readyName(section)]);
  });

  for (const [state, values] of Object.entries(SECTIONS[section].others)) {
    test(`${section} is not ready with ${state}, where its element does not show the declared content`, async (t) => {
      const { view, failure } = await startSection(t, section, values);
      assert.equal(failure, null);
      const element = elementOf(view, section);
      assert.equal(!element.hidden && element.textContent === contentOf(section), false, `${section} shows the text with ${state}`);
      assert.deepEqual(await readyStatus(view, section), { result: { ready: false, content: contentOf(section) } });
      assert.deepEqual(view.observed.errors, []);
    });
  }

  test(`${section} is not ready while its element keeps the text but is hidden`, async (t) => {
    const { view } = await startSection(t, section);
    elementOf(view, section).hidden = true;
    assert.deepEqual(await readyStatus(view, section), { result: { ready: false, content: contentOf(section) } });
  });

  test(`${section} is not ready while its element keeps the text but is out of the document`, async (t) => {
    const { view } = await startSection(t, section);
    elementOf(view, section).remove();
    assert.deepEqual(await readyStatus(view, section), { result: { ready: false, content: contentOf(section) } });
  });

  test(`${section} reads the text of its status from the declaration of its start values`, async (t) => {
    const diagnostics = readDiagnostics();
    const { properties } = readyEntry(section, diagnostics).schema;
    properties.content.enum = ["another text"];
    const { view, failure } = await startSection(t, section, { diagnostics });
    assert.equal(failure, null);
    assert.deepEqual(await readyStatus(view, section), { result: { ready: false, content: "another text" } });
    elementOf(view, section).textContent = "another text";
    assert.deepEqual(await readyStatus(view, section), { result: { ready: true, content: "another text" } });
  });

  for (const [state, values] of Object.entries({ "no enum": undefined, "an empty enum": [], "an enum of two strings": ["one", "two"], "an enum of a number": [1] })) {
    test(`${section} refuses a declaration of its status with ${state} for content`, async (t) => {
      const diagnostics = readDiagnostics();
      readyEntry(section, diagnostics).schema.properties.content.enum = values;
      const { failure } = await startSection(t, section, { diagnostics });
      assert.equal(failure?.message, `the diagnostic declaration of the files section views gives ${readyName(section)} no content enum of one string`);
    });
  }

  test(`${section} refuses a declaration without its status`, async (t) => {
    const diagnostics = readDiagnostics();
    diagnostics.exposes.status = diagnostics.exposes.status.filter((entry) => entry.name !== readyName(section));
    const { failure } = await startSection(t, section, { diagnostics });
    assert.equal(failure?.message, `the diagnostic declaration of the files section views gives ${readyName(section)} no content enum of one string`);
  });

  test(`${section} answers files.view.history with the length of its session history`, async (t) => {
    const { view } = await startSection(t, section);
    assert.deepEqual(await run(view, "files.view.history", {}), { result: { length: 1 } });
    // Each entry is a fragment of the document, which the view document can push on its own origin.
    view.window.history.pushState(null, "", "#second");
    view.window.history.pushState(null, "", "#third");
    assert.deepEqual(await run(view, "files.view.history", {}), { result: { length: 3 } });
  });

  test(`${section} starts the frame observer on its document, paints its root with the marker color and restores it on stop`, async (t) => {
    const { view } = await startSection(t, section);
    const observersBefore = view.observers.length;
    const rulesBefore = paintText(view);
    const started = await run(view, "files.view.frames", { action: "start" });
    assert.equal(started.error, undefined, started.error);
    const { enabled, sourceClock, markerColor } = started.result;
    assert.equal(enabled, true);
    assert.deepEqual(Object.keys(sourceClock).sort(), ["documentTimeOriginMs", "sourceNowMs", "sourceResolutionMs"]);
    assert.equal(sourceClock.documentTimeOriginMs, view.window.performance.timeOrigin);
    assert.ok(Number.isFinite(sourceClock.sourceNowMs) && sourceClock.sourceNowMs >= 0);
    assert.equal(sourceClock.sourceResolutionMs, 1);
    assert.ok(Array.isArray(markerColor) && markerColor.length === 3
      && markerColor.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255), JSON.stringify(markerColor));
    for (const token of THEME_COLORS) {
      const color = rgbOf(THEME[token]);
      assert.ok(color.some((channel, index) => Math.abs(channel - markerColor[index]) > 4), `${markerColor} is the color of ${token}`);
    }
    // The start creates one observer of the frames, which the view document root is observed by after its first frame.
    assert.equal(view.observers.length - observersBefore, 1, "the observer did not start once");
    const observer = view.observers.at(-1);
    const hex = hexOf(markerColor);
    // The style serializes the marker color as rgb(), which is the same color.
    assert.equal(rootRule(view).getPropertyValue("background-color"), `rgb(${markerColor.join(", ")})`, "the root is not painted");
    assert.equal(rootRule(view).getPropertyPriority("background-color"), "important");
    assert.equal(rootRule(view).getPropertyValue("--card"), hex, "the card color is not the marker color");
    // The size of the root is read after the next animation frame of the resize: the observer delivers the resize of the root.
    observer.notify([{ target: view.window.document.documentElement }]);
    const frame = await view.logged("plugin.files.view.content_frame");
    assert.equal(frame.level, "trace");
    assert.equal(frame.fields.documentTimeOriginMs, view.window.performance.timeOrigin);
    assert.deepEqual(await run(view, "files.view.frames", { action: "stop" }), { result: { enabled: false } });
    assert.equal(observer.disconnected, true, "stop did not stop the observer");
    assert.equal(paintText(view), rulesBefore, "stop did not restore the paint");
    assert.deepEqual(view.observed.errors, []);
  });

  test(`${section} chooses a marker color that no theme color is within 4 of in every channel`, async (t) => {
    const theme = { ...THEME, "--card": "#ff00ff", "--bg": "#03fcfc", "--edge": "#fcfc03" };
    const { view } = await startSection(t, section, { theme });
    const { result } = await run(view, "files.view.frames", { action: "start" });
    for (const token of THEME_COLORS) {
      const color = rgbOf(theme[token]);
      assert.ok(color.some((channel, index) => Math.abs(channel - result.markerColor[index]) > 4), `${result.markerColor} is the color of ${token}`);
    }
    await run(view, "files.view.frames", { action: "stop" });
  });

  test(`${section} refuses a start under a theme color that is not an RGB hex color, and starts no observer`, async (t) => {
    const { view } = await startSection(t, section, { theme: { ...THEME, "--rule": "rgb(1, 2, 3)" } });
    const rulesBefore = paintText(view);
    assert.deepEqual(await run(view, "files.view.frames", { action: "start" }),
      { error: "files.view.frames requires the theme color --rule as #rrggbb, not \"rgb(1, 2, 3)\"" });
    assert.equal(view.observers.some((observer) => observer.targets.includes(view.window.document.documentElement)), false);
    assert.equal(paintText(view), rulesBefore);
  });

  test(`${section} refuses a second start, a stop without a start and another action`, async (t) => {
    const { view } = await startSection(t, section);
    assert.deepEqual(await run(view, "files.view.frames", { action: "stop" }), { error: "files.view.frames is not started" });
    assert.deepEqual(await run(view, "files.view.frames", { action: "read" }), { error: "files.view.frames action must be start or stop" });
    await run(view, "files.view.frames", { action: "start" });
    assert.deepEqual(await run(view, "files.view.frames", { action: "start" }), { error: "files.view.frames is already started" });
    assert.deepEqual(await run(view, "files.view.frames", { action: "stop" }), { result: { enabled: false } });
  });

  test(`${section} without a diagnostic declaration serves no section-view entry and still shows the text`, async (t) => {
    const { view, failure } = await startSection(t, section, { withDiagnostics: false });
    assert.equal(failure, null);
    const names = view.registered("status").concat(view.registered("command"), view.registered("element"));
    assert.equal(names.some((name) => name.startsWith("files.view.")), false, names.join(", "));
    assert.equal(view.calls.some((call) => call.command === "runtime.command.register" && call.params.name.startsWith("files.view.")), false);
    assert.equal(elementOf(view, section).textContent, contentOf(section));
    assert.equal(view.observers.some((observer) => observer.targets.includes(view.window.document.documentElement)), false);
  });

  test(`${section} refuses start values without the diagnostics member`, async (t) => {
    const { surface } = SECTIONS[section];
    const { failure } = await startSection(t, section, { startValues: { surface, params: null, origin: { directory: null }, project: null,
      declarations: manifest.exposes, section: { id: section, sidebar: "card-4:left", card: "card-4" } } });
    assert.equal(failure?.message,
      "the start values of the files section view have no diagnostics: window.sokSurface {surface, params, origin, project, declarations, diagnostics, section} carries it");
  });
}

// The section views show no text for the benchmark: each status names a text that its view already shows.
test("the tree view keeps the project folder in its head, and shows the text there without a project", async (t) => {
  const titleOf = (view) => view.window.document.querySelector(".files-tree__title");
  const messageOf = (view) => view.window.document.querySelector(".files-tree__message");
  const withProject = await startSection(t, "files.tree", { project: PROJECT, entries: [ROW] });
  assert.equal(titleOf(withProject.view).textContent, "project");
  assert.equal(titleOf(withProject.view).title, PROJECT.root);
  const withoutProject = await startSection(t, "files.tree", { project: null });
  assert.equal(titleOf(withoutProject.view).textContent, NO_PROJECT_TEXT);
  assert.equal(titleOf(withoutProject.view).title, "");
  assert.equal(messageOf(withoutProject.view).hidden, true, "the message line shows without a project");
});

test("the bookmarks view has no head line and shows the text on its message line without a project", async (t) => {
  const { view } = await startSection(t, "files.bookmarks", { project: null });
  assert.deepEqual([...view.window.document.body.children].map((element) => element.className), ["files-bookmarks", "files-bookmarks__message"]);
  const message = view.window.document.querySelector(".files-bookmarks__message");
  assert.equal(message.textContent, NO_PROJECT_TEXT);
  assert.equal(message.hidden, false);
  const selectors = view.window.document.adoptedStyleSheets.flatMap((sheet) => [...sheet.cssRules]).map((rule) => rule.selectorText);
  assert.equal(selectors.some((selector) => selector.includes("files-bookmarks__head")), false);
});

test("files.bookmarks.view.ready turns false for its watchers when an error replaces the text of the message line", async (t) => {
  const name = readyName("files.bookmarks");
  const { view, surface } = await startSection(t, "files.bookmarks");
  const message = elementOf(view, "files.bookmarks");
  assert.deepEqual(await exposure(view, surface, "status.watch", { name }), { result: null });
  assert.deepEqual(changedOf(view, name).map((change) => change.value.ready), [true]);
  // A request of another surface is refused, and the refusal replaces the text of the message line, which the status watches.
  view.push("exposure-request", { id: "refused-1", surface: "left/other", method: "status.get", params: { name } });
  await view.settled();
  assert.equal(message.textContent, `exposure request refused-1 names surface left/other, not ${surface}`);
  assert.deepEqual(changedOf(view, name).map((change) => change.value.ready), [true, false]);
});

test("files.tree.view.ready turns false for its watchers when the head title shows another text", async (t) => {
  const name = readyName("files.tree");
  const { view, surface } = await startSection(t, "files.tree");
  const title = elementOf(view, "files.tree");
  assert.deepEqual(await exposure(view, surface, "status.watch", { name }), { result: null });
  assert.deepEqual(changedOf(view, name).map((change) => change.value.ready), [true]);
  title.textContent = "another text";
  await view.settled();
  assert.deepEqual(changedOf(view, name).map((change) => change.value.ready), [true, false]);
});

test("the events catalog declares the content frame of a section view", () => {
  const events = readJson("events.json").events;
  const entry = events["plugin.files.view.content_frame"];
  assert.ok(entry, "plugin.files.view.content_frame is not declared");
  assert.equal(entry.class, "frame");
  assert.equal(entry.level, "trace");
  assert.deepEqual(entry.fields.required,
    ["sequence", "width", "height", "documentTimeOriginMs", "firstResizeAtMs", "resizeAtMs", "resizeCount", "frameTimeMs"]);
});
