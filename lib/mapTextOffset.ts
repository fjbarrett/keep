/** Keep an insertion anchor attached to surrounding text while an upload waits. */
export function mapTextOffset(before: string, after: string, offset: number) {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  if (offset <= prefix) return Math.min(offset, after.length);
  if (offset >= before.length - suffix) return Math.max(0, offset + after.length - before.length);
  return after.length - suffix;
}
