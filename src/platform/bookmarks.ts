/** Common bookmark model. Chrome omits `type` and empty folder children. */
export type BookmarkNode = Omit<browser.bookmarks.BookmarkTreeNode, 'children' | 'type'> & {
  type: 'bookmark' | 'folder' | 'separator';
  children?: BookmarkNode[];
  folderType?: string;
};

type NativeNode = Omit<browser.bookmarks.BookmarkTreeNode, 'children'> & {
  children?: NativeNode[];
  folderType?: string;
};

export function normalizeBookmark(node: NativeNode): BookmarkNode {
  const { children, ...details } = node;
  const type = node.type ?? (node.url === undefined ? 'folder' : 'bookmark');
  return {
    ...details,
    type,
    ...(type === 'folder' ? { children: (children ?? []).map(normalizeBookmark) } : {})
  };
}

export async function getTree(): Promise<BookmarkNode[]> {
  return (await browser.bookmarks.getTree()).map(normalizeBookmark);
}

export async function getChildren(id: string): Promise<BookmarkNode[]> {
  return (await browser.bookmarks.getChildren(id)).map(normalizeBookmark);
}

export function getBookmarkChangeEvents() {
  const events = [
    browser.bookmarks.onCreated,
    browser.bookmarks.onRemoved,
    browser.bookmarks.onChanged,
    browser.bookmarks.onMoved
  ];
  // Firefox does not implement this event; exclude it from its compiled bundle.
  return __BROWSER_TARGET__ === 'chrome' ? [...events, browser.bookmarks.onChildrenReordered] : events;
}

export async function createBookmark(details: browser.bookmarks.CreateDetails): Promise<BookmarkNode> {
  // Chrome rejects Firefox's `type` property; a missing URL creates a folder.
  const { type, ...common } = details;
  const nativeDetails = __BROWSER_TARGET__ === 'firefox' ? details : common;
  if (__BROWSER_TARGET__ === 'chrome' && type === 'separator') {
    throw new Error('Chrome does not support bookmark separators');
  }
  return normalizeBookmark(await browser.bookmarks.create(nativeDetails));
}

export function isProtectedItem(node: BookmarkNode): boolean {
  return Boolean(node.unmodifiable || node.folderType);
}

/** The shared planner supplies the final index, after removing the moved node. */
export async function moveBookmark(id: string, destination: { parentId: string; index: number }): Promise<BookmarkNode> {
  let index = destination.index;
  if (__BROWSER_TARGET__ === 'chrome') {
    const [node] = await browser.bookmarks.get(id);
    // Chromium interprets index in the list BEFORE removing this node.
    if (node.parentId === destination.parentId && node.index !== undefined && node.index < index) index++;
  }
  return normalizeBookmark(await browser.bookmarks.move(id, { ...destination, index }));
}
