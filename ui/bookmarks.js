// The bookmarks section view (docs/spec/native-surfaces.md#view-surfaces). It draws the bookmarked project paths of the project data
// key bookmarks and removes a path through the declared command files.bookmarks.remove. The file tree view adds a path to the same key.
import { createBinder, createExpose } from "@soksak/plugin-api";
import { createViewBridge } from "@soksak/plugin-api/view";

const KEY = "bookmarks";
const EMPTY_TEXT = "북마크 없음";
const NO_PROJECT_TEXT = "프로젝트 없음";
const project = window.sokSurface.project;
const start = window.sokSurface;

/*
 * The section's styles. A path fills the free width and is cut with an ellipsis when it overflows; the remove button stands apart
 * from the path at the right of the row.
 */
const STYLE = `
.files-bookmarks{list-style:none;margin:0;padding:0}
.files-bookmarks__row{display:flex;align-items:center;gap:8px;min-height:24px}
.files-bookmarks__path{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.files-bookmarks__remove{flex:0 0 auto;padding:0 2px;border:0;background:none;color:var(--muted);font:inherit;cursor:pointer}
.files-bookmarks__remove:hover{color:var(--fg)}
.files-bookmarks__message{color:var(--muted)}
`;

// The bridge reports its lost calls and snapshots here. A count or a skipped call is not an error; each other report is shown.
const bridge = createViewBridge({
  handler: window.webkit.messageHandlers["sok-view"],
  report: (event) => {
    if (event.kind === "open-calls" || event.kind === "skipped") return;
    showError(event.where ?? "view bridge", event.text ?? event.kind);
  },
});

const sheet = new CSSStyleSheet();
sheet.replaceSync(STYLE);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
const list = document.createElement("ul");
list.className = "files-bookmarks";
const message = document.createElement("div");
message.className = "files-bookmarks__message";
message.hidden = true;
document.body.append(list, message);

const binder = createBinder((name, params) => bridge.runtime.command(name, params), {
  check: (name) => {
    if (name !== "files.bookmarks.remove") throw new Error(`${name} is not a command of the bookmarks view`);
  },
});

// The exposure of the page: the declared status files.bookmarks and the dom names of the items and their remove buttons. The
// requests of the surface arrive as the host event exposure-request and are answered through exposureReply.
const expose = createExpose({
  register: (kind, name) => bridge.exposure.register(kind, name),
  onRequest: (answer) => bridge.runtime.native.on("exposure-request", ({ id, surface, method, params }) => {
    if (surface !== start.surface) {
      showError("files bookmarks", new Error(`exposure request ${id} names surface ${surface}, not ${start.surface}`));
      return;
    }
    answer({ id, method, params });
  }),
  reply: bridge.exposure.reply,
  changed: bridge.exposure.changed,
  report: (text) => showError("files bookmarks", new Error(text)),
}, () => start.declarations);
// The paths that the list draws, and the watchers of the files.bookmarks status, which receive the paths on each change.
let listed = [];
const statusListeners = new Set();
const notifyBookmarks = () => {
  const value = [...listed];
  for (const listener of [...statusListeners]) listener(value);
};

/** Shows a message line; an empty text hides the line. */
function showMessage(text) {
  message.textContent = text;
  message.hidden = text === "";
}

/**
 * The one display path of an error of this view: the error line of the view writes it to the application log at the moment it
 * appears, and the message line shows it until the next list is drawn.
 */
function showError(where, error) {
  const text = error instanceof Error ? error.message : String(error);
  showMessage(text);
  bridge.runtime.error(where, text).catch((failure) => console.error(`files bookmarks could not write an error: ${failure instanceof Error ? failure.message : String(failure)}`));
}

// The drawn rows by path, each {row, remove}. A row that stays keeps its elements, so a press on it is not lost to a redraw of the list.
const rowsByPath = new Map();
let drawn = null;

function createRow(path) {
  const row = document.createElement("li");
  row.className = "files-bookmarks__row";
  row.dataset.expose = "files.bookmarks.item";
  const name = document.createElement("span");
  name.className = "files-bookmarks__path";
  name.textContent = path;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "files-bookmarks__remove";
  remove.textContent = "삭제";
  remove.dataset.expose = "files.bookmarks.remove";
  row.append(name, remove);
  binder.bind(remove, "files.bookmarks.remove", { path }, { failed: (error) => showError("files bookmarks", error) });
  return { row, remove };
}

/** Draws the paths of the list in order. A list equal to the drawn one changes nothing. */
function draw(paths) {
  const key = JSON.stringify(paths);
  if (key === drawn) return;
  drawn = key;
  const next = new Map();
  for (const path of paths) next.set(path, rowsByPath.get(path) ?? createRow(path));
  for (const [path, drawnRow] of rowsByPath) if (!next.has(path)) drawnRow.row.remove();
  rowsByPath.clear();
  for (const [path, drawnRow] of next) {
    rowsByPath.set(path, drawnRow);
    list.append(drawnRow.row);
  }
  listed = paths;
  showMessage(paths.length === 0 ? (project === null ? NO_PROJECT_TEXT : EMPTY_TEXT) : "");
  notifyBookmarks();
}

/** The stored list of paths. A stored value of another form throws, and the list is not drawn from it. */
async function read() {
  const stored = await bridge.runtime.data.get(KEY);
  if (!Array.isArray(stored) || stored.some((item) => typeof item !== "string")) {
    throw new Error("the stored bookmarks are not a list of paths");
  }
  return stored;
}

async function load() {
  try {
    draw(await read());
  } catch (error) {
    draw([]);
    showError("files bookmarks", error);
  }
}

/** Removes a path from the stored list and draws the list that the store accepted. */
async function remove({ path } = {}) {
  if (typeof path !== "string" || path === "") throw new TypeError("files.bookmarks.remove requires a path");
  const stored = await read();
  if (!stored.includes(path)) throw new Error(`${path} is not bookmarked`);
  const next = stored.filter((item) => item !== path);
  await bridge.runtime.data.set(KEY, next);
  draw(next);
  return null;
}

await Promise.all([
  expose.status("files.bookmarks", () => [...listed], (listener) => {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  }),
  // The providers read the rows as they are drawn now, so a removed row is not kept by the page.
  expose.dom("files.bookmarks.item", () => [...rowsByPath.values()].map((drawnRow) => drawnRow.row)),
  expose.dom("files.bookmarks.remove", () => [...rowsByPath.values()].map((drawnRow) => drawnRow.remove)),
  bridge.commands.register("files.bookmarks.remove", remove),
]);
if (project === null) showMessage(NO_PROJECT_TEXT);
else {
  // The subscription starts before the first read, so a write between the read and the subscription is not lost. The file tree
  // view writes the same key, and a change of another key reads nothing.
  await bridge.runtime.data.on(({ key }) => {
    if (key === KEY) load();
  });
  await load();
}
