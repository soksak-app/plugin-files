// The path that a double click or Enter on the file tree opens with core.file.open: the selected entry when it is a
// file, and nothing for a folder or no selection.

/** The path of the selected file among rows ({path, directory}), or null. */
export function openablePath(rows, selection) {
  const row = rows.find((entry) => entry.path === selection);
  return row && !row.directory ? row.path : null;
}
