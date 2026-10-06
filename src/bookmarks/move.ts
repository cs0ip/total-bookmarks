type BookmarkNode = browser.bookmarks.BookmarkTreeNode;

export type ItemRequest = {
  sourceId: string;
  ids: string[];
};

export type MoveRequest = ItemRequest & {
  destinationId: string;
  direction?: 'up' | 'down';
  afterId?: string;
};

export type CreateRequest = {
  parentId: string;
  afterId?: string;
  type: 'bookmark' | 'folder';
  title: string;
  url?: string;
};

export function planMoves(source: BookmarkNode[], destination: BookmarkNode[], request: MoveRequest) {
  const selected = new Set(request.ids);
  const ids = source.filter((item) => selected.has(item.id)).map((item) => item.id);
  if (ids.length !== selected.size) throw new Error('Selected bookmarks are no longer in the source folder');
  if (!ids.length) return { ids, moves: [] };
  const sameFolder = request.sourceId === request.destinationId;
  const remaining = destination.filter((item) => !selected.has(item.id)).map((item) => item.id);
  let insertionIndex: number;
  if (request.direction) {
    const first = source.findIndex((item) => selected.has(item.id));
    const last = source.findIndex((item) => item.id === ids.at(-1));
    insertionIndex = request.direction === 'up' ? Math.max(0, first - 1) : Math.min(remaining.length, last - ids.length + 2);
  } else {
    const focused = destination.findIndex((item) => item.id === request.afterId);
    insertionIndex = destination.slice(0, focused + 1).filter((item) => !selected.has(item.id)).length;
  }
  const desired = [...remaining.slice(0, insertionIndex), ...ids, ...remaining.slice(insertionIndex)];
  const current = destination.map((item) => item.id);
  const moves: { id: string; parentId: string; index: number }[] = [];
  if (sameFolder && desired.every((id, index) => id === current[index])) return { ids, moves };
  const anchor = remaining[insertionIndex];
  // Insert each item before the same unselected anchor, preserving source order.
  for (const id of ids) {
    const oldIndex = current.indexOf(id);
    const anchorIndex = anchor === undefined ? current.length : current.indexOf(anchor);
    const index = anchorIndex - (oldIndex >= 0 && oldIndex < anchorIndex ? 1 : 0);
    if (oldIndex !== index) moves.push({ id, parentId: request.destinationId, index });
    if (oldIndex >= 0) current.splice(oldIndex, 1);
    current.splice(index, 0, id);
  }
  return { ids, moves };
}
