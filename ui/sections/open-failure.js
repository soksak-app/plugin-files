// The text of an Error that core.file.open refused.

export function openFailure(error) {
  if (!(error instanceof Error) || error.message === "") {
    throw new Error(`open failure must be an Error with a message, found ${JSON.stringify(error)}`);
  }
  return error.message;
}
