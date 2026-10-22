export type ItemRequest = {
  sourceId: string;
  ids: string[];
};

export type MoveRequest = ItemRequest & {
  destinationId: string;
  direction?: 'up' | 'down';
  afterId?: string;
  position?: 'start' | 'end';
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

export type SortOptions = {
  by: 'name' | 'date' | 'url' | 'domain';
  ignoreCase: boolean;
  reverse: boolean;
  separateFolders: boolean;
  foldersFirst: boolean;
  onlySelected: boolean;
  groupSelected: boolean;
};

export type SortRequest = SortOptions & { parentId: string; ids?: string[] };
