// The DOM-free rules of the file tree view: the rows of a files sidecar tree reply, the paths that the tree library shows for
// the rows, the batch from one path list to the next, the expansion requests of the library, and the file that a double click opens.

/** A placeholder child of a folder whose listing has no child, so that the library shows the folder as expandable. The name
 * cannot be a file name of the project, which the sidecar lists. */
export const PLACEHOLDER = "​";

/** The rows, selection and generation of a files sidecar tree reply (test/fixtures/sidecar-files/tree-wire.json). A reply
 * with a row of another form is refused with the text of the first defect. */
export function treeOf(tree) {
  if (!tree || typeof tree !== "object" || !Number.isSafeInteger(tree.generation) || tree.generation < 1 || !Array.isArray(tree.entries)) {
    throw new Error("files sidecar returned an invalid tree snapshot");
  }
  if (tree.selected !== null && typeof tree.selected !== "string") throw new Error("files sidecar returned an invalid selected path");
  const rows = tree.entries.map((entry) => {
    if (!entry || typeof entry.path !== "string" || typeof entry.name !== "string" || typeof entry.directory !== "boolean" ||
        !Number.isInteger(entry.depth) || entry.depth < 0 || typeof entry.selected !== "boolean") {
      throw new Error("files sidecar returned an invalid tree row");
    }
    if (entry.directory && typeof entry.expanded !== "boolean") throw new Error("files sidecar returned an invalid tree row");
    if (entry.detail !== undefined && typeof entry.detail !== "string") throw new Error("files sidecar returned an invalid tree row");
    const row = {
      path: entry.path,
      name: entry.name,
      directory: entry.directory,
      depth: entry.depth,
      expanded: entry.directory && entry.expanded === true,
      selected: entry.selected,
    };
    if (entry.detail !== undefined) row.detail = entry.detail;
    return row;
  });
  return { generation: tree.generation, selected: tree.selected, rows };
}

/** The paths of the rows in the tree library. A folder is its own path with a trailing slash; a folder with no listed child also
 * has the placeholder child, so the library keeps it expandable. */
export function treePaths(rows) {
  const parents = new Set(rows.map((row) => row.path.slice(0, row.path.lastIndexOf("/"))).filter(Boolean));
  return rows.flatMap((row) => {
    if (!row.directory) return [row.path];
    return parents.has(row.path) ? [`${row.path}/`] : [`${row.path}/`, `${row.path}/${PLACEHOLDER}`];
  });
}

/** The batch from the before path list to the after path list. Additions come first. A removed folder is removed once with its
 * subtree, and the paths inside it are not removed again. */
export function pathDiff(before, after) {
  const had = new Set(before);
  const has = new Set(after);
  const gone = before.filter((path) => !has.has(path));
  const goneDirectories = gone.filter((path) => path.endsWith("/"));
  const inside = (path) => goneDirectories.some((dir) => path !== dir && path.startsWith(dir));
  return [
    ...after.filter((path) => !had.has(path)).map((path) => ({ type: "add", path })),
    ...gone.filter((path) => !inside(path))
      .map((path) => (path.endsWith("/") ? { type: "remove", path, recursive: true } : { type: "remove", path })),
  ];
}

/**
 * The folders whose expansion in the library differs from the row's expansion. Each one is requested once: pending holds the paths
 * with a request that the next tree reply has not yet answered. Returns {path, expanded} for each new request, where expanded is the
 * state the library shows.
 */
export function expansionRequests(rows, isExpanded, pending) {
  const requests = [];
  for (const row of rows) {
    if (!row.directory) continue;
    const open = isExpanded(row.path);
    if (open === row.expanded) {
      pending.delete(row.path);
      continue;
    }
    if (pending.has(row.path)) continue;
    pending.add(row.path);
    requests.push({ path: row.path, expanded: open });
  }
  return requests;
}

/** The path of the selected row when it is a file, or null for a folder and for no selection. */
export function openablePath(rows, selection) {
  const row = rows.find((entry) => entry.path === selection);
  return row && !row.directory ? row.path : null;
}
