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
} & ({
  type: 'bookmark' | 'folder';
  title: string;
  url?: string;
} | { type: 'separator' });

export type EditRequest = {
  id: string;
  title: string;
  url?: string;
};
