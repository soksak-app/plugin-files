// The message row of a file tree: why the tree shows no files, and why a file did not open.

/** The text of an error that core.file.open refused; anything that is not an Error with a message is refused. */
export function openFailure(error) {
  if (!(error instanceof Error) || error.message === "") {
    throw new Error(`open failure must be an Error with a message, found ${JSON.stringify(error)}`);
  }
  return error.message;
}

/** The text of the message row, or null when the row is hidden. `value` is files.tree of the project, `openError` the failure to open a file or null. */
export function treeMessage(source, value, openError) {
  if (source === null) return "프로젝트 없음";
  if (value.error !== null) return `오류: ${value.error}`;
  return openError === null ? null : `열 수 없음: ${openError}`;
}
