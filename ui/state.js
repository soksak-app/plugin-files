// 파일 플러그인의 상태 모듈(docs/spec/plugins.md#plugin-state). 북마크를 프로젝트 데이터 bookmarks 에 저장해 files.bookmarks 로 공개하고,
// 파일 열기 실패를 기록한다. 트리(files.tree)는 플러그인 호스트 페이지가 파일 사이드카의 tree 작업으로 만든다(host-runtime.js).
import { createEmitter } from "./events.js";
import { bookmarkValue } from "./declared-data.js";

export async function mount(context) {
  const emitEvent = createEmitter(context.runtime, "files");
  /** 단조 시계로 잰 경과 시간(마이크로초, 음이 아닌 정수). */
  const since = (started) => Math.round((performance.now() - started) * 1000);
  const listeners = new Set();
  const storedBookmarks = () => context.data.get("bookmarks");
  const bookmarks = () => bookmarkValue(storedBookmarks(), context.project.root);
  const notify = () => { const value = bookmarks(); for (const fn of listeners) fn(value); };
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
  context.exposure.status("files.bookmarks", bookmarks, (fn) => { listeners.add(fn); return () => listeners.delete(fn); });
  context.exposure.command("files.open.failed", measured("files.open.failed", async ({ error } = {}) => {
    if (typeof error !== "string" || error === "") throw new Error("files.open.failed requires error, a non-empty string");
    emitEvent("warn", "plugin.files.open.failed", { error });
    return null;
  }));
  context.exposure.command("files.bookmarks.add", measured("files.bookmarks.add", async ({ path }) => {
    const current = storedBookmarks();
    if (!current.includes(path)) await context.data.set("bookmarks", [...current, path]);
    notify();
    return null;
  }));
  context.exposure.command("files.bookmarks.remove", measured("files.bookmarks.remove", async ({ path }) => {
    const current = storedBookmarks();
    if (!current.includes(path)) throw new Error(`${path} is not bookmarked`);
    await context.data.set("bookmarks", current.filter((item) => item !== path));
    notify();
    return null;
  }));
  return {
    async dispose() {
      listeners.clear();
    },
  };
}
