// 상태 값이 바뀌어도 바뀌지 않은 항목의 조작 요소는 문서에 남는다(core docs/spec/exposure.md, P11). 누름과 뗌
// 사이에 눌린 요소가 문서에서 빠지면 WebKit 은 click 을 보내지 않는다.
import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { bookmarkValue, treeValue } from "../build/test/ui/declared-data.js";

function setup() {
  const dom = new JSDOM("<body><div id=root></div></body>");
  globalThis.document = dom.window.document;
  // JSDOM 에는 생성 가능한 스타일시트가 없다. 섹션이 쓰는 두 가지(replaceSync, adoptedStyleSheets)만 준다.
  globalThis.CSSStyleSheet = class { replaceSync() {} };
  dom.window.document.adoptedStyleSheets = [];
  const listeners = new Map();
  const context = {
    orientation: "horizontal",
    status: (name, fn) => { listeners.set(name, fn); return () => listeners.delete(name); },
    bind: (element, command, params) => { element.dataset.command = command; element.dataset.params = JSON.stringify(params); return element; },
    icon: () => "",
  };
  const send = (name, value, source = "state") => listeners.get(name)(value, source);
  return { dom, root: dom.window.document.getElementById("root"), context, send };
}

for (const [file, orientation] of [["../build/test/ui/sections/bookmarks.js", "vertical"], ["../build/test/ui/sections/bookmarks-horizontal.js", "horizontal"]]) {
  test(`${file}: a new bookmark keeps the remove controls of the other bookmarks in the document`, async () => {
    const { dom, root, context, send } = setup();
    context.orientation = orientation;
    const { mount } = await import(`${file}?${orientation}`);
    const section = mount(root, context);
    send("files.bookmarks", bookmarkValue(["a", "b"]));
    const before = [...root.querySelectorAll("button")];
    assert.equal(before.length, 2);
    send("files.bookmarks", bookmarkValue(["a", "b", "c"]));
    assert.ok(before.every((button) => button.isConnected), "a new bookmark took the other remove controls out of the document");
    assert.deepEqual([...root.querySelectorAll("button")].map((button) => JSON.parse(button.dataset.params).path), ["a", "b", "c"]);
    section.dispose();
    dom.window.close();
  });
}

test("the horizontal tree keeps the controls of unchanged entries when a folder opens", async () => {
  const { dom, root, context, send } = setup();
  const { mount } = await import("../build/test/ui/sections/tree-horizontal.js");
  const section = mount(root, context);
  const entries = [{ path: "src", name: "src", directory: true, expanded: false, depth: 0 }, { path: "a.txt", name: "a.txt", directory: false, depth: 0 }];
  send("files.tree", treeValue({ root: "/p", entries }));
  const select = root.querySelector('[data-command="files.select"]');
  send("files.tree", treeValue({ root: "/p", entries: [{ ...entries[0], expanded: true }, { path: "src/b.txt", name: "b.txt", directory: false, depth: 1 }, entries[1]] }));
  assert.ok(select.isConnected, "opening a folder took the select control of an unchanged entry out of the document");
  assert.equal(root.querySelector('[data-command="files.tree.toggle"]').textContent, "접기");
  section.dispose();
  dom.window.close();
});
