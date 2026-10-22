// A consumer-side model of createSnapshotSender of the plugin API, for the sender cases of
// test/fixtures/contract/declared-ui-snapshot.json. The model holds one snapshot in transit per status and one dirty value,
// as the published sender does. The receiver case of the fixture is not modeled, because the page receives no snapshot.
export const SNAPSHOT_EVENT = "declared-ui.snapshot";
export const SNAPSHOT_ACK_EVENT = "declared-ui.snapshot.ack";
export const SNAPSHOT_REQUEST_COMMAND = "declared-ui.snapshot.request";
const PEER_LOST_REASONS = ["process-ended", "surface-closed", "sidecar-ended"];

/**
 * Creates the sender of one plugin. send(message) posts a message; onMessage(listener) receives the acknowledgements;
 * report(event) receives the skipped and stalled counts.
 */
export function createSnapshotSender({ plugin, send, onMessage, report }) {
  const seqs = new Map();
  const latest = new Map();
  const transit = new Map();
  const dirty = new Map();
  const skipped = new Map();

  const sendValue = (status, seq, value) => {
    transit.set(status, { seq });
    send({ event: SNAPSHOT_EVENT, plugin, status, seq, value, skipped: skipped.get(status) ?? 0 });
    skipped.set(status, 0);
  };

  // Each push takes the next seq. A push while a snapshot is in transit replaces the dirty value and counts the value it overwrites.
  function push(status, value) {
    const seq = (seqs.get(status) ?? 0) + 1;
    seqs.set(status, seq);
    latest.set(status, { seq, value });
    if (!transit.has(status)) {
      sendValue(status, seq, value);
      return;
    }
    if (dirty.has(status)) {
      const count = (skipped.get(status) ?? 0) + 1;
      skipped.set(status, count);
      report({ kind: "skipped", plugin, status, count });
    }
    dirty.set(status, { seq, value });
  }

  // An acknowledgement must name the snapshot in transit. It sends the dirty value, if any, as the next snapshot.
  function acknowledge({ status, seq }) {
    const entry = transit.get(status);
    if (entry === undefined || entry.seq !== seq) {
      throw new Error(`declared UI snapshot ack ${status} ${seq} has no snapshot in transit`);
    }
    transit.delete(status);
    if (dirty.has(status)) {
      const next = dirty.get(status);
      dirty.delete(status);
      sendValue(status, next.seq, next.value);
    }
  }

  // The peer ends the transit. A stalled snapshot is reported once per status; a dirty value is reported only when the surface closed.
  function peerLost(reason) {
    if (!PEER_LOST_REASONS.includes(reason)) {
      throw new Error(`peer lost reason must be one of ${PEER_LOST_REASONS.join(", ")}, got ${reason}`);
    }
    for (const status of new Set([...transit.keys(), ...dirty.keys()])) {
      const count = (transit.has(status) ? 1 : 0) + (reason === "surface-closed" && dirty.has(status) ? 1 : 0);
      if (count > 0) report({ kind: "stalled", plugin, status, reason, count });
    }
    transit.clear();
    dirty.clear();
    skipped.clear();
  }

  function pull(status) {
    if (!latest.has(status)) throw new Error(`declared UI snapshot ${status} has no value`);
    return { ...latest.get(status) };
  }

  onMessage((message) => acknowledge(message));
  return { push, pull, has: (status) => latest.has(status), peerLost };
}
