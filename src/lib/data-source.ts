// Lets the app run against live ESPN data only, with no DB setup at all —
// set DATA_SOURCE=espn (default "db"). See docs/DATA_SOURCES.md.
export function isEspnOnly(): boolean {
  return process.env.DATA_SOURCE === "espn";
}
