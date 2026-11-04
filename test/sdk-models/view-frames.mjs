// A consumer-side model of observeViewDocumentFrames of the plugin API diagnostic view-frames entry, for the diagnostic module of
// the section views. It takes the arguments that the entry documents (document, log, ResizeObserver, requestAnimationFrame,
// cancelAnimationFrame, now, timeOriginMs), refuses a missing one with the text of the entry, and returns the stop function.
// The test drives the observation: each observation is kept in `observations` with its arguments, and frame(fields) writes one
// `view.content_frame` event through the log of the observation, as the entry does after the next animation frame.
export const observations = [];

export function observeViewDocumentFrames({ document, log, ResizeObserver, requestAnimationFrame, cancelAnimationFrame, now, timeOriginMs }) {
  const root = document?.documentElement;
  if (!root) throw new TypeError("view frame observation requires a view document with documentElement");
  if (typeof log?.trace !== "function") throw new TypeError("view frame observation requires runtime.log.trace");
  if (typeof ResizeObserver !== "function") throw new TypeError("view frame observation requires ResizeObserver");
  if (typeof requestAnimationFrame !== "function") throw new TypeError("view frame observation requires requestAnimationFrame");
  if (typeof cancelAnimationFrame !== "function") throw new TypeError("view frame observation requires cancelAnimationFrame");
  if (typeof now !== "function") throw new TypeError("view frame observation requires performance.now");
  if (!Number.isFinite(timeOriginMs) || timeOriginMs < 0) {
    throw new TypeError("view frame observation requires a finite document time origin");
  }
  const observation = {
    document,
    timeOriginMs,
    stopped: false,
    frame(fields) {
      if (observation.stopped) throw new Error("the view frame observation is stopped");
      return log.trace("view.content_frame", fields);
    },
  };
  observations.push(observation);
  return () => {
    observation.stopped = true;
  };
}
