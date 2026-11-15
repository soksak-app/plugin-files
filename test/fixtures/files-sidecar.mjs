// The files sidecar at the consumer boundary: it answers the operations of the declared wire contract (test/fixtures/sidecar-files/tree-wire.json)
// over one tree. The page's send to the sidecar is answered by it (route), and its reply reaches the page as a sidecar message of the session,
// as the host delivers the reply of the sidecar. The sidecar holds the tree of the project; a test changes it with set() and tells the view
// that the project changed with message().
export const SIDECAR = "@soksak/sidecar-files";

/**
 * Creates the files sidecar fixture, which answers the declared wire contract over the tree `initial`. failSnapshot, when set, is the error of each snapshot.
 * attach(view, session) names the view and the session that the replies reach; `route` answers a send of the page, and requests lists each request body in order.
 */
export function filesSidecar(initial, { failSnapshot = null } = {}) {
  let tree = structuredClone(initial);
  let view = null;
  let session = null;
  const requests = [];
  let holding = false;
  const held = [];
  const setDirectory = (path, expanded) => {
    const row = tree.entries.find((item) => item.path === path);
    if (!row || !row.directory) return { error: `no directory ${path}` };
    row.expanded = expanded;
    tree = { ...tree, generation: tree.generation + 1 };
    return { tree };
  };
  const answer = (body) => {
    if (body.operation === "snapshot") return failSnapshot !== null ? { error: failSnapshot } : { tree };
    if (body.generation !== tree.generation) return { error: `stale tree generation ${body.generation}; current generation is ${tree.generation}` };
    if (body.operation === "expand") return setDirectory(body.path, true);
    if (body.operation === "collapse") return setDirectory(body.path, false);
    // A select changes the selection and keeps the generation of the listing, as the select reply of the wire contract states.
    if (body.operation === "select") {
      tree = {
        ...tree,
        selected: body.path === "" ? null : body.path,
        entries: tree.entries.map((item) => ({ ...item, selected: item.path === body.path })),
      };
      return { tree };
    }
    return { error: `unknown operation ${body.operation}` };
  };
  return {
    requests,
    attach(target, id) {
      view = target;
      session = id;
    },
    // Replaces the tree of the project, as a change on disk does before the sidecar reports it.
    set(next) {
      tree = structuredClone(next);
    },
    // Records a request and posts its reply to the view after the send returned, as the sidecar replies asynchronously.
    route(body) {
      requests.push(structuredClone(body));
      const reply = answer(body);
      const deliver = () => view.sidecarMessage(SIDECAR, session, { body: { id: body.id, ...reply } });
      if (holding) held.push(deliver);
      else queueMicrotask(deliver);
      return null;
    },
    // Holds the replies of the sidecar until release(), so a test can act while a request is in flight.
    hold() {
      holding = true;
    },
    release() {
      holding = false;
      for (const deliver of held.splice(0)) deliver();
    },
    // Posts a message of the sidecar that is not a reply, such as the change line of the project.
    message(body) {
      view.sidecarMessage(SIDECAR, session, { body });
    },
  };
}
