export function readCommandResult(result, command) {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `${command} failed`);
  return result.stdout?.trim() ?? "";
}
