// 파일 플러그인의 상태 모듈(docs/spec/plugins.md#plugin-state). 파일 사이드카로 프로젝트 폴더를 나열해
// files.tree 를 만들고, 펼친 디렉터리를 감시해 바뀌면 다시 나열하며, 북마크를 프로젝트 데이터 bookmarks 에 저장해 files.bookmarks 로 공개한다.
import { createEmitter } from "./events.js";
import { bookmarkValue, treeValue } from "./declared-data.js";

export async function mount(context) {
  const emitEvent = createEmitter(context.runtime, "files");
  /** 단조 시계로 잰 경과 시간(마이크로초, 음이 아닌 정수). */
  const since = (started) => Math.round((performance.now() - started) * 1000);
  /* 펼친 디렉터리의 상대 경로. "" 는 프로젝트 폴더다. */
  const expanded = new Set([""]);
  /* 나열한 디렉터리마다 항목. */
  const listings = new Map();
  let error = null;
  /* 프로젝트 폴더의 git 상태. 폴더가 저장소가 아니면 비어 있다. */
  let git = [];
  const pending = new Map();
  let next = 0;
  const listeners = { tree: new Set(), bookmarks: new Set() };
  /* 고른 경로. 프로젝트의 모든 트리가 같은 선택을 보인다. */
  let selection = null;

  await context.sidecar.on((body) => {
    // 감시한 디렉터리가 바뀌었거나 감시가 도중에 실패했다(docs/spec/sidecars.md#files).
    if (body.changed !== undefined) {
      emitEvent("debug", "plugin.files.watch.changed", { path: body.changed });
      inTurn(refresh).catch(showFailure);
      return;
    }
    if (body.id === undefined) {
      emitEvent("warn", "plugin.files.watch.failed", { error: body.error });
      showFailure(new Error(body.error));
      return;
    }
    const request = pending.get(body.id);
    if (!request) return;
    pending.delete(body.id);
    if (body.error !== undefined) request.reject(new Error(body.error));
    else request.resolve(body.entries);
  });
  const send = (body) => new Promise((resolve, reject) => {
    const id = `${body.operation}-${++next}`;
    pending.set(id, { resolve, reject });
    context.sidecar.send({ ...body, id }).catch((failure) => {
      pending.delete(id);
      reject(failure);
    });
  });
  /** 요청의 결과와 시간을 event 로 남긴다. 실패는 호출한 쪽으로 그대로 넘어간다. */
  const request = async (body) => {
    const started = performance.now();
    try {
      const result = await send(body);
      emitEvent("debug", "plugin.files.sidecar.request", { operation: body.operation, ok: true, micros: since(started) });
      return result;
    } catch (failure) {
      emitEvent("warn", "plugin.files.sidecar.request", { operation: body.operation, ok: false, micros: since(started), error: `-32603: ${failure.message}` });
      throw failure;
    }
  };
  const list = async (path) => {
    const started = performance.now();
    const entries = await request({ operation: "list", path });
    emitEvent("debug", "plugin.files.list", { path, entries: entries.length, micros: since(started) });
    return entries;
  };
  /** 사이드카가 감시하는 디렉터리를 펼친 디렉터리로 바꾼다. */
  const watchExpanded = () => request({ operation: "watch", paths: [...expanded] });
  const join = (parent, name) => (parent ? `${parent}/${name}` : name);

  function rows(path = "", depth = 0) {
    // default: 아직 나열하지 않은(접힌) 디렉터리에는 보일 하위 행이 없다.
    return (listings.get(path) ?? []).flatMap((entry) => {
      const child = join(path, entry.name);
      const open = entry.directory && expanded.has(child);
      const row = { path: child, name: entry.name, directory: entry.directory, depth, expanded: open };
      return open ? [row, ...rows(child, depth + 1)] : [row];
    });
  }
  const gitPriority = { deleted: 5, modified: 4, added: 3, renamed: 2, untracked: 1 };
  const detailFor = (entry) => {
    const candidates = git.filter((change) => change.path === entry.path || (entry.directory && change.path.startsWith(`${entry.path}/`)));
    for (const change of candidates) if (!Object.hasOwn(gitPriority, change.status)) throw new Error(`unknown git status ${change.status}`);
    candidates.sort((a, b) => gitPriority[b.status] - gitPriority[a.status] || a.path.localeCompare(b.path));
    return candidates[0]?.status;
  };
  const tree = () => treeValue({ root: context.project.root, entries: rows().map((entry) => ({ ...entry, selected: entry.path === selection, detail: detailFor(entry) })), selected: selection, listingFailed: error !== null });
  const storedBookmarks = () => context.data.get("bookmarks");
  const bookmarks = () => bookmarkValue(storedBookmarks(), context.project.root);
  const notify = (name, read) => { const value = read(); for (const fn of listeners[name]) fn(value); };
  /** 요청 없이 생긴 실패는 files.tree 의 error 로 보인다. */
  const showFailure = (failure) => { error = failure.message; notify("tree", tree); };

  /** 펼친 디렉터리를 모두 다시 나열한다. 사라진 하위 디렉터리는 접는다. 프로젝트 폴더의 실패는 error 로 보인다. */
  async function refresh() {
    // 새 목록은 따로 모은 뒤 한 번에 바꾼다. 나열하는 동안 files.tree 를 읽는 쪽은 이전 목록을 본다.
    const fresh = new Map();
    let failed = null;
    for (const path of [...expanded].sort((a, b) => a.length - b.length)) {
      const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      // default: 새 목록에 부모가 없으면(부모가 사라졌거나 나열에 실패했으면) 이 폴더도 없는 것으로 보고 접는다.
      if (path && !(fresh.get(parent) ?? []).some((entry) => entry.directory && join(parent, entry.name) === path)) {
        expanded.delete(path);
        continue;
      }
      try {
        fresh.set(path, await list(path));
      } catch (failure) {
        if (path) { expanded.delete(path); continue; }
        failed = failure.message;
      }
    }
    listings.clear();
    for (const [path, entries] of fresh) listings.set(path, entries);
    error = failed;
    await watchExpanded();
    const gitStarted = performance.now();
    git = await request({ operation: "git" });
    emitEvent("debug", "plugin.files.git", { entries: git.length, micros: since(gitStarted) });
    notify("tree", tree);
  }

  // 새로 고침, 펼침, 변경 알림은 나열 결과를 함께 바꾸므로 받은 순서대로 하나씩 실행한다.
  let turn = Promise.resolve();
  const inTurn = (work) => {
    const done = turn.then(work);
    // silent: the failure of this work reaches its caller through done; the chain only keeps the order of the next work.
    turn = done.then(() => undefined, () => undefined);
    return done;
  };
  const watch = (name) => (fn) => { listeners[name].add(fn); return () => listeners[name].delete(fn); };
  context.exposure.status("files.tree", tree, watch("tree"));
  context.exposure.status("files.bookmarks", bookmarks, watch("bookmarks"));
  /** 명령의 실행마다 결과와 시간을 event 로 남기는 처리기를 돌려 준다. 명령 이름은 등록하는 곳에 그대로 적는다. */
  const measured = (name, run) => async (params) => {
    const started = performance.now();
    try {
      const result = await run(params);
      emitEvent("debug", "plugin.files.command", { name, ok: true, micros: since(started) });
      return result;
    } catch (failure) {
      emitEvent("warn", "plugin.files.command", { name, ok: false, micros: since(started), error: `-32000: ${failure.message}` });
      throw failure;
    }
  };
  context.exposure.command("files.open.failed", measured("files.open.failed", async ({ error } = {}) => {
    if (typeof error !== "string" || error === "") throw new Error("files.open.failed requires error, a non-empty string");
    emitEvent("warn", "plugin.files.open.failed", { error });
    return null;
  }));
  context.exposure.command("files.select", measured("files.select", async ({ path }) => {
    // 선택을 지우는 요청은 path 를 null 로 보낸다. path 가 빠진 요청을 지우기로 바꾸지 않는다.
    if (path === undefined) throw new Error("files.select requires path, a string or null");
    selection = path;
    notify("tree", tree);
    return null;
  }));
  context.exposure.command("files.refresh", measured("files.refresh", () => inTurn(async () => { await refresh(); return null; })));
  context.exposure.command("files.tree.toggle", measured("files.tree.toggle", ({ path }) => inTurn(async () => {
    const row = rows().find((entry) => entry.path === path);
    if (!row?.directory) throw new Error(`${path} is not a listed directory`);
    if (expanded.has(path)) {
      for (const open of [...expanded]) if (open === path || open.startsWith(`${path}/`)) expanded.delete(open);
    } else {
      listings.set(path, await list(path));
      expanded.add(path);
    }
    await watchExpanded();
    notify("tree", tree);
    return null;
  })));
  context.exposure.command("files.bookmarks.add", measured("files.bookmarks.add", async ({ path }) => {
    const current = storedBookmarks();
    if (!current.includes(path)) await context.data.set("bookmarks", [...current, path]);
    notify("bookmarks", bookmarks);
    return null;
  }));
  context.exposure.command("files.bookmarks.remove", measured("files.bookmarks.remove", async ({ path }) => {
    const current = storedBookmarks();
    if (!current.includes(path)) throw new Error(`${path} is not bookmarked`);
    await context.data.set("bookmarks", current.filter((item) => item !== path));
    notify("bookmarks", bookmarks);
    return null;
  }));
  await inTurn(refresh);
  return {
    async dispose() {
      listeners.tree.clear();
      listeners.bookmarks.clear();
      await inTurn(() => request({ operation: "watch", paths: [] }));
    },
  };
}
