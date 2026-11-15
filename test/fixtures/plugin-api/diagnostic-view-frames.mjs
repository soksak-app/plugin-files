// The fixture of the diagnostic view-frames entry of the plugin API: observeViewDocumentFrames (core docs/spec/plugins.md#diagnostic-declarations).
// It observes the size of the document root, and each observed resize is traced as the content frame of the next animation frame. The
// frame is requested through the animation frame functions that the page passes, so a test runs it with the frame of its window.
import { recorder } from "./recorder.mjs";

/** Starts the observation and returns the function that stops it. */
export function observeViewDocumentFrames({ document, log, ResizeObserver, requestAnimationFrame, cancelAnimationFrame, now, timeOriginMs }) {
  let sequence = 0;
  let resizeCount = 0;
  let firstResizeAtMs = null;
  let frame = null;
  const observer = new ResizeObserver(() => {
    resizeCount += 1;
    const resizeAtMs = now();
    firstResizeAtMs ??= resizeAtMs;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = null;
      sequence += 1;
      const root = document.documentElement;
      log.trace("view.content_frame", {
        sequence,
        width: root.clientWidth,
        height: root.clientHeight,
        documentTimeOriginMs: timeOriginMs,
        firstResizeAtMs,
        resizeAtMs,
        resizeCount,
        frameTimeMs: now(),
      });
    });
  });
  observer.observe(document.documentElement);
  recorder.calls.push({ method: "frames.start", args: {} });
  return () => {
    observer.disconnect();
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    recorder.calls.push({ method: "frames.stop", args: {} });
  };
}
