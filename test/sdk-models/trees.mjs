// A consumer-side model of the vendored tree library (ui/vendor/trees.js) for the view tests. It keeps each rendered tree in
// trees, the paths and the expansion and selection of its items, and the options the page passed to the constructor, so a test
// plays the user's expansion and selection through them. The model does not draw; the real library draws in the application.
export const trees = [];

/** The theme styles of the library are read by the page only as values, so the model returns none. */
export function themeToTreeStyles() {
  return {};
}

// The open shadow root of the tree container. The library draws each row as an element with data-item-path in this root, and a
// change of its rows is a subtree mutation of the root, which the observers of the fake DOM receive.
class FakeShadowRoot {
  constructor() {
    this.rows = [];
  }
  querySelectorAll(selector) {
    if (selector !== "[data-item-path]") throw new Error(`the fake shadow root answers [data-item-path] only, not ${selector}`);
    return this.rows;
  }
  changed() {
    for (const observer of globalThis.mutationObservers ?? []) if (observer.target === this) observer.callback([]);
  }
}

export class FileTree {
  constructor(options) {
    this.options = options;
    this.paths = new Map();
    this.listeners = new Set();
    this.rendered = null;
    this.container = null;
    this.gitStatus = [];
    trees.push(this);
  }
  render({ containerWrapper }) {
    this.rendered = containerWrapper;
    this.container = { shadowRoot: new FakeShadowRoot() };
  }
  getFileTreeContainer() {
    return this.container;
  }
  // The rows drawn now: an element is kept for each path that stays, as the library keeps its rows.
  draw() {
    const root = this.container.shadowRoot;
    const before = new Map(root.rows.map((row) => [row.dataset.itemPath, row]));
    root.rows = [...this.paths.keys()].map((path) => before.get(path) ?? { dataset: { itemPath: path } });
    root.changed();
  }
  batch(operations) {
    for (const operation of operations) {
      if (operation.type === "add") {
        this.paths.set(operation.path, { expanded: false, selected: false });
      } else if (operation.type === "remove") {
        for (const path of [...this.paths.keys()]) {
          if (path === operation.path || (operation.recursive && path.startsWith(operation.path))) this.paths.delete(path);
        }
      }
    }
    this.draw();
  }
  // The library names a directory with its trailing slash; the page names it without.
  key(path) {
    if (this.paths.has(path)) return path;
    return this.paths.has(`${path}/`) ? `${path}/` : null;
  }
  getItem(path) {
    const key = this.key(path);
    if (key === null) return null;
    const state = this.paths.get(key);
    const directory = key.endsWith("/");
    return {
      isDirectory: () => directory,
      isExpanded: () => state.expanded,
      isSelected: () => state.selected,
      expand: () => this.set(key, { expanded: true }),
      collapse: () => this.set(key, { expanded: false }),
      select: () => this.set(key, { selected: true }),
      deselect: () => this.set(key, { selected: false }),
    };
  }
  // A change of the state by the user notifies the subscribers, as the library does.
  set(key, change) {
    Object.assign(this.paths.get(key), change);
    this.draw();
    for (const listener of [...this.listeners]) listener();
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  getSelectedPaths() {
    return [...this.paths].filter(([, state]) => state.selected).map(([path]) => path);
  }
  setGitStatus(status) {
    this.gitStatus = status;
  }
  cleanUp() {
    this.listeners.clear();
  }
}
