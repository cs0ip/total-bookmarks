import type { BookmarkNode } from '../platform/bookmarks';
import type { SortOptions } from '../bookmarks/requests';

export function planSort(items: BookmarkNode[], options: SortOptions, locale: string, ids: readonly string[] = []) {
  const selected = new Set(ids);
  const sortable = (item: BookmarkNode) => item.type !== 'separator' && (!options.onlySelected || selected.has(item.id));
  const names = new Intl.Collator(locale, { sensitivity: options.ignoreCase ? 'accent' : 'variant' });
  const addresses = new Intl.Collator(locale, { sensitivity: 'variant' });
  const order = options.reverse ? -1 : 1;
  const domains = new Map<string, string>();
  for (const item of items) {
    if (!item.url) continue;
    let domain = '';
    try { domain = new URL(item.url).hostname.toLowerCase().replace(/\.$/, ''); } catch { /* Keep addresses without a domain after domain-based addresses. */ }
    domains.set(item.id, domain);
  }

  function compareText(left: string, right: string): number {
    if (!left || !right) return Number(!left) - Number(!right);
    return addresses.compare(left, right) * order;
  }

  function compare(left: BookmarkNode, right: BookmarkNode): number {
    const leftFolder = left.type === 'folder';
    const rightFolder = right.type === 'folder';
    if (options.separateFolders && leftFolder !== rightFolder) {
      return (Number(rightFolder) - Number(leftFolder)) * (options.foldersFirst ? 1 : -1);
    }
    if (options.by === 'name') {
      return names.compare(left.title, right.title) * order;
    }
    if (options.by === 'date') {
      if (left.dateAdded === undefined || right.dateAdded === undefined) return Number(left.dateAdded === undefined) - Number(right.dateAdded === undefined);
      return (left.dateAdded - right.dateAdded) * order;
    }
    if (options.by === 'domain') {
      const leftDomain = domains.get(left.id) ?? '';
      const rightDomain = domains.get(right.id) ?? '';
      if (leftDomain && rightDomain) {
        const parts = (domain: string) => /^\d+(?:\.\d+){3}$/.test(domain) ? 1 : domain.split('.').length;
        const depth = parts(leftDomain) - parts(rightDomain);
        if (depth) return depth * order;
      }
      const domain = compareText(leftDomain, rightDomain);
      if (domain) return domain;
    }
    return compareText(left.url ?? '', right.url ?? '');
  }

  // Equal keys retain their order; separators do not participate in comparisons.
  const sorted = items.filter(sortable).sort(compare);
  let next = 0;
  const current = items.map((item) => item.id);
  const moves: { id: string; index: number }[] = [];
  if (options.onlySelected && options.groupSelected) {
    const first = items.findIndex((item) => selected.has(item.id));
    const group = items.filter((item) => selected.has(item.id)).map((item) => item.type === 'separator' ? item : sorted[next++]);
    // Pack the selection from its first original slot, retaining the order of all other items.
    for (const [offset, item] of group.entries()) {
      const index = first + offset;
      const oldIndex = current.indexOf(item.id);
      if (oldIndex === index) continue;
      moves.push({ id: item.id, index });
      current.splice(oldIndex, 1);
      current.splice(index, 0, item.id);
    }
    return moves;
  }
  // Without grouping, unselected items and separators keep their slots.
  const desired = items.map((item) => sortable(item) ? sorted[next++] : item);
  for (const [index, item] of desired.entries()) {
    const oldIndex = current.indexOf(item.id);
    if (oldIndex === index) continue;
    const displaced = current[index];
    moves.push({ id: item.id, index });
    current.splice(oldIndex, 1);
    current.splice(index, 0, item.id);
    if (options.onlySelected && oldIndex > index + 1) {
      // Complete the swap using only selected IDs, restoring all intervening slots.
      moves.push({ id: displaced, index: oldIndex });
      current.splice(index + 1, 1);
      current.splice(oldIndex, 0, displaced);
    }
  }
  return moves;
}
