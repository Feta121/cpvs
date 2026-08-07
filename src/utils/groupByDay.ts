import { isToday, isYesterday, format } from 'date-fns';

/** Groups items by calendar day, labeling "Today" and "Yesterday" specially
 * (matching Gmail/Slack-style notification lists), with a full date for
 * anything older. Returns [label, items][] in the same order as the
 * pre-sorted input (so pass already-newest-first data). */
export function groupByDayLabel<T>(items: T[], getDate: (item: T) => string): [string, T[]][] {
  const groups: [string, T[]][] = [];

  for (const item of items) {
    const date = new Date(getDate(item));
    const label = isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'EEEE, MMMM d, yyyy');

    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0] === label) {
      lastGroup[1].push(item);
    } else {
      groups.push([label, [item]]);
    }
  }

  return groups;
}
