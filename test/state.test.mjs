// 파일 플러그인 상태 모듈: 사이드카 목록으로 트리를 만들고, 펼침·새로 고침·북마크를 선언된 항목으로 공개한다.
import assert from "node:assert/strict";
import test from "node:test";

/** 가짜 문맥. listing 은 상대 경로마다 항목 배열이나 오류 문자열이다. */
function fakeContext(listing, git = []) {
  const statuses = new Map();
  const commands = new Map();
  const stored = {};
  let reply = null;
  const sent = [];
  const logged = [];
  const log = Object.fromEntries(["error", "warn", "info", "debug", "trace"].map((level) => [level, (event, fields) => logged.push({ level, event, fields })]));
  const context = {
    runtime: { log },
    project: { id: "p1", root: "/work/p1" },
    exposure: {
      status: (name, read, subscribe) => statuses.set(name, { read, subscribe }),
      command: (name, run) => commands.set(name, run),
    },
    sidecar: {
      on: async (fn) => { reply = fn; },
      send: async (body) => {
        sent.push(body);
        if (body.operation === "watch") { queueMicrotask(() => reply({ id: body.id })); return; }
        if (body.operation === "git") { queueMicrotask(() => reply({ id: body.id, entries: git.slice() })); return; }
        const value = listing[body.path];
        queueMicrotask(() => reply(typeof value === "string" ? { id: body.id, error: value } : { id: body.id, entries: value ?? [] }));
      },
    },
    data: {
      get: (key) => structuredClone(stored[key] ?? []),
      set: async (key, value) => { stored[key] = value; },
    },
  };
  return { context, statuses, commands, stored, sent, logged, emit: (body) => reply(body) };
}

const listing = () => ({
  "": [{ name: "src", directory: true }, { name: "a.txt", directory: false }],
  src: [{ name: "main.go", directory: false }],
});

function treeNodes(value) {
  const tree = value.elements.find((element) => element.kind === "tree");
  if (!tree) return [];
  const flatten = (nodes, depth = 0) => nodes.flatMap((node) => [
    { path: node.params.path, name: node.label, directory: node.branch === true, depth, expanded: node.expanded === true, selected: node.selected === true, detail: node.detail },
    ...(node.children ? flatten(node.children, depth + 1) : []),
  ]);
  return flatten(tree.nodes);
}

function bookmarkPaths(value) {
  return value.elements.find((element) => element.kind === "list").items.map((item) => item.params.path);
}

test("the state lists the project root, expands and folds a directory, and refreshes expanded directories", async () => {
  const files = listing();
  const f = fakeContext(files);
  const { mount } = await import("../ui/state.js");
  const mounted = await mount(f.context);
  const tree = () => f.statuses.get("files.tree").read();
  assert.deepEqual(treeNodes(tree()), [
    { path: "src", name: "src", directory: true, depth: 0, expanded: false, selected: false, detail: undefined },
    { path: "a.txt", name: "a.txt", directory: false, depth: 0, expanded: false, selected: false, detail: undefined },
  ]);
  const seen = [];
  const stop = f.statuses.get("files.tree").subscribe((value) => seen.push(value));
  await f.commands.get("files.tree.toggle")({ path: "src" });
  assert.deepEqual(treeNodes(tree()).map((e) => [e.path, e.depth, e.expanded]),
    [["src", 0, true], ["src/main.go", 1, false], ["a.txt", 0, false]]);
  assert.equal(seen.length, 1);
  files.src = [{ name: "main.go", directory: false }, { name: "util.go", directory: false }];
  await f.commands.get("files.refresh")({});
  assert.deepEqual(treeNodes(tree()).map((e) => e.path), ["src", "src/main.go", "src/util.go", "a.txt"]);
  await f.commands.get("files.tree.toggle")({ path: "src" });
  assert.deepEqual(treeNodes(tree()).map((e) => e.path), ["src", "a.txt"]);
  await assert.rejects(f.commands.get("files.tree.toggle")({ path: "a.txt" }), /a.txt is not a listed directory/);
  stop();
  await mounted.dispose();
});

test("a root listing failure is not placed in the declared tree value", async () => {
  const f = fakeContext({ "": "permission denied" });
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  const value = f.statuses.get("files.tree").read();
  assert.deepEqual(treeNodes(value), []);
  assert.equal(value.error, undefined);
  assert.equal(value.elements.find((element) => element.kind === "tree").empty, "");
  assert.ok(f.logged.some(({ event, fields }) => event.endsWith("sidecar.request") && fields.ok === false && fields.error.includes("permission denied")));
});

test("bookmarks are stored as project data, kept unique, and removed", async () => {
  const f = fakeContext(listing());
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  const bookmarks = () => f.statuses.get("files.bookmarks").read();
  assert.deepEqual(bookmarkPaths(bookmarks()), []);
  await f.commands.get("files.bookmarks.add")({ path: "a.txt" });
  await f.commands.get("files.bookmarks.add")({ path: "src" });
  await f.commands.get("files.bookmarks.add")({ path: "a.txt" });
  assert.deepEqual(bookmarkPaths(bookmarks()), ["a.txt", "src"]);
  assert.deepEqual(f.stored.bookmarks, ["a.txt", "src"]);
  await f.commands.get("files.bookmarks.remove")({ path: "a.txt" });
  assert.deepEqual(bookmarkPaths(bookmarks()), ["src"]);
  await assert.rejects(f.commands.get("files.bookmarks.remove")({ path: "none" }), /none is not bookmarked/);
});

test("the state watches the expanded directories, refreshes on a change, and stops watching on dispose", async () => {
  const files = listing();
  const f = fakeContext(files);
  const { mount } = await import("../ui/state.js");
  const mounted = await mount(f.context);
  const watched = () => f.sent.filter((body) => body.operation === "watch").at(-1)?.paths;
  assert.deepEqual(watched(), [""]);
  await f.commands.get("files.tree.toggle")({ path: "src" });
  assert.deepEqual(watched(), ["", "src"]);
  const seen = [];
  f.statuses.get("files.tree").subscribe((value) => seen.push(treeNodes(value).map((e) => e.path)));
  files.src = [{ name: "main.go", directory: false }, { name: "new.go", directory: false }];
  f.emit({ changed: "src" });
  await f.commands.get("files.refresh")({});
  assert.deepEqual(seen[0], ["src", "src/main.go", "src/new.go", "a.txt"], "the change refreshed the tree before the next command");
  await f.commands.get("files.tree.toggle")({ path: "src" });
  assert.deepEqual(watched(), [""]);
  await mounted.dispose();
  assert.deepEqual(watched(), []);
});

test("git status details appear in tree nodes and refresh from the sidecar", async () => {
  const git = [{ path: "a.txt", status: "modified" }];
  const f = fakeContext(listing(), git);
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  assert.equal(treeNodes(f.statuses.get("files.tree").read()).find((entry) => entry.path === "a.txt").detail, "modified");
  await f.commands.get("files.tree.toggle")({ path: "src" });
  const asked = () => f.sent.filter((body) => body.operation === "git").length;
  const before = asked();
  git.push({ path: "src/main.go", status: "untracked" });
  f.emit({ changed: "" });
  await f.commands.get("files.refresh")({});
  assert.ok(asked() > before);
  const entries = treeNodes(f.statuses.get("files.tree").read());
  assert.equal(entries.find((entry) => entry.path === "src/main.go").detail, "untracked");
  assert.equal(entries.find((entry) => entry.path === "src").detail, "untracked");
});

test("a directory shows the highest-priority descendant git detail", async () => {
  const files = listing();
  files.src.push({ name: "util.go", directory: false });
  const git = [
    { path: "src/main.go", status: "modified" },
    { path: "src/util.go", status: "deleted" },
  ];
  const f = fakeContext(files, git);
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  await f.commands.get("files.tree.toggle")({ path: "src" });
  const rows = treeNodes(f.statuses.get("files.tree").read());
  assert.equal(rows.find((row) => row.path === "src/main.go").detail, "modified");
  assert.equal(rows.find((row) => row.path === "src/util.go").detail, "deleted");
  assert.equal(rows.find((row) => row.path === "src").detail, "deleted");
});

test("selection is carried by each declared tree node", async () => {
  const f = fakeContext(listing());
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  await f.commands.get("files.select")({ path: "a.txt" });
  assert.equal(treeNodes(f.statuses.get("files.tree").read()).find((entry) => entry.path === "a.txt").selected, true);
  await f.commands.get("files.select")({ path: null });
  assert.equal(treeNodes(f.statuses.get("files.tree").read()).some((entry) => entry.selected), false);
  await f.commands.get("files.select")({ path: "a.txt" });
  await assert.rejects(f.commands.get("files.select")({}), /requires path/);
  assert.equal(treeNodes(f.statuses.get("files.tree").read()).find((entry) => entry.path === "a.txt").selected, true);
});

test("files.tree read during a refresh shows the previous listing, not an empty tree", async () => {
  const f = fakeContext(listing());
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  const refreshing = f.commands.get("files.refresh")({});
  await Promise.resolve();
  assert.deepEqual(treeNodes(f.statuses.get("files.tree").read()).map((entry) => entry.path), ["src", "a.txt"]);
  await refreshing;
});

test("file-open failures are logged without a files.open status", async () => {
  const f = fakeContext(listing());
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  assert.equal(f.statuses.has("files.open"), false);
  await f.commands.get("files.open.failed")({ error: "no plugin opens a.txt" });
  assert.ok(f.logged.some(({ event, fields }) => event.endsWith("open.failed") && fields.error === "no plugin opens a.txt"));
  await assert.rejects(f.commands.get("files.open.failed")({ error: "" }), /requires error, a non-empty string/);
  await assert.rejects(f.commands.get("files.open.failed")({}), /requires error, a non-empty string/);
});

const micros = (value) => Number.isInteger(value) && value >= 0;

test("each request to the sidecar, each listing and the git status are events with their result", async () => {
  const f = fakeContext(listing(), [{ path: "a.txt", status: "modified" }]);
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  const named = (event) => f.logged.filter((entry) => entry.event === event);
  assert.deepEqual(named("sidecar.request").map((entry) => [entry.level, entry.fields.operation, entry.fields.ok]),
    [["debug", "list", true], ["debug", "watch", true], ["debug", "git", true]]);
  assert.ok(named("sidecar.request").every((entry) => micros(entry.fields.micros)));
  const [listed] = named("list");
  assert.deepEqual([listed.level, listed.fields.path, listed.fields.entries, micros(listed.fields.micros)], ["debug", "", 2, true]);
  const [status] = named("git");
  assert.deepEqual([status.level, status.fields.entries, micros(status.fields.micros)], ["debug", 1, true]);
});

test("a failed request is a warning that names its error in the form code and text", async () => {
  const f = fakeContext({ "": "permission denied" });
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  const failed = f.logged.find((entry) => entry.event === "sidecar.request" && !entry.fields.ok);
  assert.equal(failed.level, "warn");
  assert.equal(failed.fields.operation, "list");
  assert.equal(failed.fields.error, "-32603: permission denied");
  assert.ok(micros(failed.fields.micros));
});

test("a change that the watch reports and a failure that no request caused are events", async () => {
  const f = fakeContext(listing());
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  f.logged.length = 0;
  f.emit({ changed: "src" });
  assert.deepEqual(f.logged[0], { level: "debug", event: "watch.changed", fields: { path: "src" } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  f.emit({ error: "watch broke" });
  const failure = f.logged.find((entry) => entry.event === "watch.failed");
  assert.deepEqual(failure, { level: "warn", event: "watch.failed", fields: { error: "watch broke" } });
});

test("the result of a command is an event with its time and, when it failed, its error", async () => {
  const f = fakeContext(listing());
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  f.logged.length = 0;
  await f.commands.get("files.refresh")({});
  await assert.rejects(f.commands.get("files.tree.toggle")({ path: "a.txt" }), /a.txt is not a listed directory/);
  const results = f.logged.filter((entry) => entry.event === "command");
  assert.deepEqual(results.map((entry) => [entry.level, entry.fields.name, entry.fields.ok]),
    [["debug", "files.refresh", true], ["warn", "files.tree.toggle", false]]);
  assert.ok(results.every((entry) => micros(entry.fields.micros)));
  assert.equal(results[1].fields.error, "-32000: a.txt is not a listed directory");
  assert.equal(results[0].fields.error, undefined);
});

test("the failure to open a file is a warning event", async () => {
  const f = fakeContext(listing());
  const { mount } = await import("../ui/state.js");
  await mount(f.context);
  f.logged.length = 0;
  await f.commands.get("files.open.failed")({ error: "no plugin opens a.txt" });
  const failure = f.logged.find((entry) => entry.event === "open.failed");
  assert.deepEqual(failure, { level: "warn", event: "open.failed", fields: { error: "no plugin opens a.txt" } });
});
