// The section-view entries of the view benchmark (core docs/spec/plugin-processes.md#section-views) at the consumer boundary.
// diagnostics.json declares files.view.frames, files.view.history and a ready status for each section with its module; in a diagnostic
// build the start values carry that declaration, and each section view (tree and bookmarks) serves the two commands and its own status
// on its own surface. The frame observer is the consumer model of test/sdk-models/view-frames.mjs.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { changedOf, findAll, installViewWindow, registeredEntries, replyOf, sendExposureRequest, settle } from "./fixtures/view-host.mjs";

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
const languageOf = (section) => readyEntry(section).schema.properties.language.enum[0];

/** The declarations of a diagnostic build: the exposes of plugin.json with the exposes of diagnostics.json added. */
function diagnosticDeclarations() {
  const merged = {};
  for (const bundle of [manifest.exposes, readDiagnostics().exposes]) {
    for (const [kind, entries] of Object.entries(bundle)) merged[kind] = [...(merged[kind] ?? []), ...entries];
  }
  return merged;
}

// Each section: its page, its surface, the class of the element that shows its text, the text and its language, and the states of
// the view in which that element shows something else.
const SECTIONS = {
  "files.tree": {
    module: "tree.js",
    surface: "spc-1/card-4:left/files.tree",
    element: "files-tree__title",
    content: "test-project",
    language: "en-US",
    others: { "another project folder": { project: PROJECT, entries: [ROW] }, "no project": { project: null } },
  },
  "files.bookmarks": {
    module: "bookmarks.js",
    surface: "spc-1/card-4:left/files.bookmarks",
    element: "files-bookmarks__message",
    content: "북마크 없음",
    language: "ko-KR",
    others: { "a stored bookmark": { bookmarks: ["readme.md"] }, "no project": { project: null } },
  },
};
// The schema subset of core (core docs/spec/exposure.md).
const SCHEMA_FIELDS = ["type", "properties", "items", "enum"];
const SCHEMA_TYPES = ["string", "number", "integer", "boolean", "object", "array", "null"];
const elementOf = (section) => findAll(globalThis.document.body, (element) => element.className === SECTIONS[section].element)[0];
let caseNumber = 0;

/**
 * Starts the section view `section` in the fake window. By default it starts as the view benchmark does: with the diagnostic
 * declaration, in the project of the fixture `fresh` and without bookmarks. `entries` are the rows of the tree and `bookmarks` the
 * stored paths of the project.
 */
async function startSection(section, { theme = THEME, withDiagnostics = true, diagnostics = readDiagnostics(), startValues = null, project = FRESH_PROJECT, entries = [], bookmarks = [] } = {}) {
  const { module, surface } = SECTIONS[section];
  const start = startValues ?? {
    surface,
    params: null,
    origin: { directory: null },
    project,
    declarations: withDiagnostics ? diagnosticDeclarations() : manifest.exposes,
    diagnostics: withDiagnostics ? diagnostics : null,
    section: { id: section, sidebar: "card-4:left", card: "card-4" },
  };
  const store = { bookmarks };
  const host = installViewWindow({
    start,
    runtime(message, view) {
      const { command, params } = message;
      if (command === "runtime.sidecar.send") {
        const tree = { generation: 1, selected: null, entries };
        queueMicrotask(() => view.deliver({ event: "sidecar.message", data: { id: params.id, body: { id: params.body.id, tree } } }));
        return null;
      }
      if (command === "runtime.data.get") return structuredClone(store[params.key]);
      return null;
    },
  });
  globalThis.getComputedStyle = () => ({ getPropertyValue: (name) => theme[name] ?? "" });
  globalThis.ResizeObserver = class ResizeObserver {};
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  caseNumber += 1;
  let failure = null;
  try {
    await import(`../build/test/ui/${module}?case=${caseNumber}`);
  } catch (error) {
    failure = error;
  }
  await settle();
  return { host, surface, failure };
}

const run = async (view, command, params) => {
  const reply = await view.host.relay(command, params);
  return reply.error !== undefined ? { error: reply.error.message } : { result: reply.result };
};
const observations = async () => (await import("../build/test/sdk-models/view-frames.mjs")).observations;
const readyStatus = async (view, section) => {
  const id = sendExposureRequest(view.host, view.surface, "status.get", { name: readyName(section) });
  await settle();
  return replyOf(view.host, id);
};
const paintRules = () => globalThis.document.adoptedStyleSheets.map((sheet) => sheet.text).join("");

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

for (const [section, { content, language }] of Object.entries(SECTIONS)) {
  test(`${readyName(section)} declares content and language each as an enum of one string`, () => {
    assert.deepEqual(readyEntry(section).schema.properties, {
      ready: { type: "boolean" },
      content: { type: "string", enum: [content] },
      language: { type: "string", enum: [language] },
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
  test(`${section} in the state of the fixture fresh shows its declared content and is ready`, async () => {
    const view = await startSection(section);
    assert.equal(view.failure, null);
    assert.equal(elementOf(section).textContent, contentOf(section));
    assert.equal(elementOf(section).hidden, false);
    assert.deepEqual(await readyStatus(view, section), { result: { ready: true, content: contentOf(section), language: languageOf(section) } });
    assert.deepEqual(view.host.errors, []);
  });

  test(`${section} registers its own ready status and no other`, async () => {
    const view = await startSection(section);
    const names = registeredEntries(view.host).filter((entry) => entry.kind === "status" && entry.name.endsWith(".view.ready")).map((entry) => entry.name);
    assert.deepEqual(names, [readyName(section)]);
  });

  for (const [state, values] of Object.entries(SECTIONS[section].others)) {
    test(`${section} is not ready with ${state}, where its element does not show the declared content`, async () => {
      const view = await startSection(section, values);
      assert.equal(view.failure, null);
      const element = elementOf(section);
      assert.equal(!element.hidden && element.textContent === contentOf(section), false, `${section} shows the text with ${state}`);
      assert.deepEqual(await readyStatus(view, section), { result: { ready: false, content: contentOf(section), language: languageOf(section) } });
      assert.deepEqual(view.host.errors, []);
    });
  }

  test(`${section} is not ready while its element keeps the text but is hidden`, async () => {
    const view = await startSection(section);
    elementOf(section).hidden = true;
    assert.deepEqual(await readyStatus(view, section), { result: { ready: false, content: contentOf(section), language: languageOf(section) } });
  });

  test(`${section} is not ready while its element keeps the text but is out of the document`, async () => {
    const view = await startSection(section);
    elementOf(section).remove();
    assert.deepEqual(await readyStatus(view, section), { result: { ready: false, content: contentOf(section), language: languageOf(section) } });
  });

  test(`${section} reads the text and the language of its status from the declaration of its start values`, async () => {
    const diagnostics = readDiagnostics();
    const { properties } = readyEntry(section, diagnostics).schema;
    properties.content.enum = ["another text"];
    properties.language.enum = ["fr-FR"];
    const view = await startSection(section, { diagnostics });
    assert.equal(view.failure, null);
    assert.deepEqual(await readyStatus(view, section), { result: { ready: false, content: "another text", language: "fr-FR" } });
    elementOf(section).textContent = "another text";
    assert.deepEqual(await readyStatus(view, section), { result: { ready: true, content: "another text", language: "fr-FR" } });
  });

  for (const field of ["content", "language"]) {
    for (const [state, values] of Object.entries({ "no enum": undefined, "an empty enum": [], "an enum of two strings": ["one", "two"], "an enum of a number": [1] })) {
      test(`${section} refuses a declaration of its status with ${state} for ${field}`, async () => {
        const diagnostics = readDiagnostics();
        readyEntry(section, diagnostics).schema.properties[field].enum = values;
        const view = await startSection(section, { diagnostics });
        assert.equal(view.failure?.message, `the diagnostic declaration of the files section views gives ${readyName(section)} no ${field} enum of one string`);
      });
    }
  }

  test(`${section} refuses a declaration without its status`, async () => {
    const diagnostics = readDiagnostics();
    diagnostics.exposes.status = diagnostics.exposes.status.filter((entry) => entry.name !== readyName(section));
    const view = await startSection(section, { diagnostics });
    assert.equal(view.failure?.message, `the diagnostic declaration of the files section views gives ${readyName(section)} no content enum of one string`);
  });

  test(`${section} answers files.view.history with the length of its session history`, async () => {
    const view = await startSection(section);
    assert.deepEqual(await run(view, "files.view.history", {}), { result: { length: 1 } });
    globalThis.history.length = 3;
    assert.deepEqual(await run(view, "files.view.history", {}), { result: { length: 3 } });
  });

  test(`${section} starts the frame observer on its document, paints its root with the marker color and restores it on stop`, async () => {
    const view = await startSection(section);
    const before = (await observations()).length;
    const rulesBefore = paintRules();
    const started = await run(view, "files.view.frames", { action: "start" });
    assert.equal(started.error, undefined, started.error);
    const { enabled, sourceClock, markerColor } = started.result;
    assert.equal(enabled, true);
    assert.deepEqual(Object.keys(sourceClock).sort(), ["documentTimeOriginMs", "sourceNowMs", "sourceResolutionMs"]);
    assert.equal(sourceClock.documentTimeOriginMs, performance.timeOrigin);
    assert.ok(Number.isFinite(sourceClock.sourceNowMs) && sourceClock.sourceNowMs >= 0);
    assert.equal(sourceClock.sourceResolutionMs, 1);
    assert.ok(Array.isArray(markerColor) && markerColor.length === 3
      && markerColor.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255), JSON.stringify(markerColor));
    for (const token of THEME_COLORS) {
      const color = rgbOf(THEME[token]);
      assert.ok(color.some((channel, index) => Math.abs(channel - markerColor[index]) > 4), `${markerColor} is the color of ${token}`);
    }
    const observed = (await observations()).slice(before);
    assert.equal(observed.length, 1, "the observer did not start once");
    assert.equal(observed[0].document, globalThis.document);
    assert.equal(observed[0].timeOriginMs, performance.timeOrigin);
    const hex = hexOf(markerColor);
    assert.match(paintRules(), new RegExp(`:root\\{[^}]*background-color:${hex} !important`), "the root is not painted");
    assert.match(paintRules(), new RegExp(`:root\\{[^}]*--card:${hex} !important`), "the card color is not the marker color");
    observed[0].frame({ sequence: 0, width: 200, height: 100, documentTimeOriginMs: performance.timeOrigin, firstResizeAtMs: 1,
      resizeAtMs: 1, resizeCount: 1, frameTimeMs: 2 });
    await settle();
    // The emitter of the plugin writes the event without the plugin prefix (ui/events.js).
    const frames = view.host.logs.filter((record) => record.event === "view.content_frame");
    assert.deepEqual(frames.map((record) => record.level), ["trace"], `the frame was written as ${JSON.stringify(view.host.logs)}`);
    assert.deepEqual(await run(view, "files.view.frames", { action: "stop" }), { result: { enabled: false } });
    assert.equal(observed[0].stopped, true, "stop did not stop the observer");
    assert.equal(paintRules(), rulesBefore, "stop did not restore the paint");
    assert.deepEqual(view.host.errors, []);
  });

  test(`${section} chooses a marker color that no theme color is within 4 of in every channel`, async () => {
    const theme = { ...THEME, "--card": "#ff00ff", "--bg": "#03fcfc", "--edge": "#fcfc03" };
    const view = await startSection(section, { theme });
    const { result } = await run(view, "files.view.frames", { action: "start" });
    for (const token of THEME_COLORS) {
      const color = rgbOf(theme[token]);
      assert.ok(color.some((channel, index) => Math.abs(channel - result.markerColor[index]) > 4), `${result.markerColor} is the color of ${token}`);
    }
    await run(view, "files.view.frames", { action: "stop" });
  });

  test(`${section} refuses a start under a theme color that is not an RGB hex color, and starts no observer`, async () => {
    const view = await startSection(section, { theme: { ...THEME, "--rule": "rgb(1, 2, 3)" } });
    const before = (await observations()).length;
    const rulesBefore = paintRules();
    assert.deepEqual(await run(view, "files.view.frames", { action: "start" }),
      { error: "files.view.frames requires the theme color --rule as #rrggbb, not \"rgb(1, 2, 3)\"" });
    assert.equal((await observations()).length, before);
    assert.equal(paintRules(), rulesBefore);
  });

  test(`${section} refuses a second start, a stop without a start and another action`, async () => {
    const view = await startSection(section);
    assert.deepEqual(await run(view, "files.view.frames", { action: "stop" }), { error: "files.view.frames is not started" });
    assert.deepEqual(await run(view, "files.view.frames", { action: "read" }), { error: "files.view.frames action must be start or stop" });
    await run(view, "files.view.frames", { action: "start" });
    assert.deepEqual(await run(view, "files.view.frames", { action: "start" }), { error: "files.view.frames is already started" });
    assert.deepEqual(await run(view, "files.view.frames", { action: "stop" }), { result: { enabled: false } });
  });

  test(`${section} without a diagnostic declaration serves no section-view entry and still shows the text`, async () => {
    const before = (await observations()).length;
    const view = await startSection(section, { withDiagnostics: false });
    assert.equal(view.failure, null);
    const names = registeredEntries(view.host).map((entry) => entry.name);
    assert.equal(names.some((name) => name.startsWith("files.view.")), false, names.join(", "));
    assert.equal(view.host.posted.some((message) => message.command === "runtime.command.register" && message.params.name.startsWith("files.view.")), false);
    assert.equal(elementOf(section).textContent, contentOf(section));
    assert.equal((await observations()).length, before);
  });

  test(`${section} refuses start values without the diagnostics member`, async () => {
    const { surface } = SECTIONS[section];
    const view = await startSection(section, { startValues: { surface, params: null, origin: { directory: null }, project: null,
      declarations: manifest.exposes, section: { id: section, sidebar: "card-4:left", card: "card-4" } } });
    assert.equal(view.failure?.message,
      "the start values of the files section view have no diagnostics: window.sokSurface {surface, params, origin, project, declarations, diagnostics, section} carries it");
  });
}

// The section views show no text for the benchmark: each status names a text that its view already shows.
test("the tree view keeps the project folder in its head, and shows the text there without a project", async () => {
  const titleOf = () => findAll(globalThis.document.body, (element) => element.className === "files-tree__title")[0];
  const messageOf = () => findAll(globalThis.document.body, (element) => element.className === "files-tree__message")[0];
  await startSection("files.tree", { project: PROJECT, entries: [ROW] });
  assert.equal(titleOf().textContent, "project");
  assert.equal(titleOf().title, PROJECT.root);
  await startSection("files.tree", { project: null });
  assert.equal(titleOf().textContent, NO_PROJECT_TEXT);
  assert.equal(titleOf().title, "");
  assert.equal(messageOf().hidden, true, "the message line shows without a project");
});

test("the bookmarks view has no head line and shows the text on its message line without a project", async () => {
  await startSection("files.bookmarks", { project: null });
  assert.deepEqual(globalThis.document.body.children.filter((element) => element.tagName !== "SCRIPT").map((element) => element.className),
    ["files-bookmarks", "files-bookmarks__message"]);
  const [message] = findAll(globalThis.document.body, (element) => element.className === "files-bookmarks__message");
  assert.equal(message.textContent, NO_PROJECT_TEXT);
  assert.equal(message.hidden, false);
  assert.doesNotMatch(globalThis.document.adoptedStyleSheets.map((sheet) => sheet.text).join(""), /files-bookmarks__head/);
});

test("files.bookmarks.view.ready turns false for its watchers when an error replaces the text of the message line", async () => {
  const name = readyName("files.bookmarks");
  const view = await startSection("files.bookmarks");
  const message = elementOf("files.bookmarks");
  const watch = sendExposureRequest(view.host, view.surface, "status.watch", { name });
  await settle();
  assert.deepEqual(replyOf(view.host, watch), { result: null });
  assert.deepEqual(changedOf(view.host, name).map((change) => change.value.ready), [true]);
  const refused = sendExposureRequest(view.host, "left/other", "status.get", { name });
  await settle();
  assert.equal(message.textContent, `exposure request ${refused} names surface left/other, not ${view.surface}`);
  // The fake DOM notifies no observer by itself, so the test delivers the mutation of the message line.
  const observers = globalThis.mutationObservers.filter((observer) => observer.target === message);
  assert.equal(observers.length, 1, "no observer watches the element that shows the text");
  for (const observer of observers) observer.callback([]);
  await settle();
  assert.deepEqual(changedOf(view.host, name).map((change) => change.value.ready), [true, false]);
});

test("files.tree.view.ready turns false for its watchers when the head title shows another text", async () => {
  const name = readyName("files.tree");
  const view = await startSection("files.tree");
  const title = elementOf("files.tree");
  sendExposureRequest(view.host, view.surface, "status.watch", { name });
  await settle();
  assert.deepEqual(changedOf(view.host, name).map((change) => change.value.ready), [true]);
  title.textContent = "another text";
  const observers = globalThis.mutationObservers.filter((observer) => observer.target === title);
  assert.equal(observers.length, 1, "no observer watches the element that shows the text");
  for (const observer of observers) observer.callback([]);
  await settle();
  assert.deepEqual(changedOf(view.host, name).map((change) => change.value.ready), [true, false]);
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
