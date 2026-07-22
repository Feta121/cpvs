/**
 * Groups a list of items by batch and returns sorted [batch, items[]] pairs.
 * Used by the Students, Rotations, and Attendance pages so "All batches"
 * shows a distinct, clearly-labeled table per batch (in a consistent order)
 * instead of one intermixed table.
 */
export function groupByBatch<T>(items: T[], getBatch: (item: T) => string | null | undefined): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const batch = getBatch(item)?.trim() || 'Unassigned';
    if (!groups.has(batch)) groups.set(batch, []);
    groups.get(batch)!.push(item);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
}
