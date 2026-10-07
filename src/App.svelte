<script lang="ts">
  import { t, type TranslationKey } from './i18n';
  import { onMount } from 'svelte';
  import LanguagePicker from './components/LanguagePicker.svelte';
  import BookmarkPanels from './components/BookmarkPanels.svelte';
  import { PARENT_FOLDER_ITEM_ID } from './components/BookmarkList.svelte';
  import { ICON_ORIGINS } from './icons/protocol';
  import { planMoves, type CreateRequest, type ItemRequest, type MoveRequest } from './bookmarks/move';

  type BookmarkNode = browser.bookmarks.BookmarkTreeNode;
  type Side = 0 | 1;
  type PaneState = { folderId: string; selectedId: string };
  type FocusPosition = PaneState & { index: number };

  let roots: BookmarkNode[] = $state([]);
  let nodesById = $state(new Map<string, BookmarkNode>());
  let rootId = $state('');
  let panes: PaneState[] = $state([
    { folderId: '', selectedId: '' },
    { folderId: '', selectedId: '' }
  ]);
  let loading = $state(true);
  let mutating = $state(false);
  let mutationFocusPositions: FocusPosition[] | undefined;
  let refreshAfterMutation: () => Promise<void> = async () => {};
  let error = $state<TranslationKey | ''>('');
  let languageMenuOpen = $state(false);
  let iconAccessAllowed = $state<boolean | null>(null);
  let requestingIconAccess = $state(false);
  const manifest = browser.runtime.getManifest();
  const iconManifestReady = ICON_ORIGINS.every((origin) => manifest.host_permissions?.includes(origin));

  async function checkIconAccess(): Promise<void> {
    try {
      iconAccessAllowed = await browser.permissions.contains({ origins: ICON_ORIGINS });
    } catch (cause) {
      console.error('Failed to check host permissions', cause);
    }
  }

  async function requestIconAccess(): Promise<void> {
    requestingIconAccess = true;
    try {
      // Call directly from the click handler to retain Firefox's user gesture.
      iconAccessAllowed = await browser.permissions.request({ origins: ICON_ORIGINS });
    } catch (cause) {
      error = 'iconPermissionError';
      console.error('Failed to request favicon host permissions', cause);
    } finally {
      requestingIconAccess = false;
    }
  }

  function findNode(id: string | undefined): BookmarkNode | null {
    if (!id) return null;
    return nodesById.get(id) ?? null;
  }

  function currentFolder(side: Side): BookmarkNode | null {
    return findNode(panes[side].folderId);
  }

  function itemsIn(side: Side): BookmarkNode[] {
    return currentFolder(side)?.children ?? [];
  }

  function folderPath(side: Side): string {
    const names: string[] = [];
    let folder = currentFolder(side);
    while (folder && folder.id !== rootId) {
      names.push(folder.title || $t('untitled'));
      folder = findNode(folder.parentId);
    }
    return names.reverse().join(' / ');
  }

  function paneView(side: Side) {
    return {
      side,
      folder: currentFolder(side),
      items: itemsIn(side),
      selectedId: panes[side].selectedId,
      folderPath: folderPath(side)
    };
  }

  async function loadTree(isActive: () => boolean) {
    loading = true;
    error = '';
    try {
      const tree = await browser.bookmarks.getTree();
      if (!isActive() || mutating) return;
      roots = tree;
      const index = new Map<string, BookmarkNode>();
      const pending = [...roots];
      while (pending.length) {
        const node = pending.pop();
        if (!node) break;
        index.set(node.id, node);
        if (node.children) pending.push(...node.children);
      }
      nodesById = index;
      rootId = roots[0]?.id ?? '';
      const focusPositions = mutationFocusPositions;
      mutationFocusPositions = undefined;
      for (const side of [0, 1] as const) {
        const pane = panes[side];
        if (!findNode(pane.folderId)) pane.folderId = rootId;
        const parentSelected = pane.selectedId === PARENT_FOLDER_ITEM_ID && findNode(pane.folderId)?.parentId;
        if (!parentSelected && findNode(pane.selectedId)?.parentId !== pane.folderId) {
          const position = focusPositions?.[side];
          const items = itemsIn(side);
          // Choose the nearest remaining position before the new rows render.
          pane.selectedId = position?.folderId === pane.folderId && position.selectedId === pane.selectedId && position.index >= 0
            ? items[Math.min(position.index, items.length - 1)]?.id ?? ''
            : '';
        }
      }
    } catch (cause) {
      if (!isActive()) return;
      error = 'loadError';
      console.error('Failed to load bookmarks', cause);
    } finally {
      if (isActive()) loading = false;
    }
  }

  function navigate(side: Side, id: string): void {
    const folder = findNode(id);
    if (!folder?.children) return;
    panes[side].folderId = id;
    panes[side].selectedId = '';
  }

  async function openBookmark(url: string): Promise<void> {
    try {
      await browser.tabs.create({ url });
    } catch (cause) {
      error = 'openError';
      console.error('Failed to open the bookmark', cause);
    }
  }

  function canRemoveItems(request: ItemRequest): boolean {
    if (loading || mutating || !request.ids.length || request.sourceId === rootId) return false;
    const source = findNode(request.sourceId);
    if (!source?.children || source.unmodifiable) return false;
    return request.ids.every((id) => {
      const item = findNode(id);
      return item && item.parentId === request.sourceId && !item.unmodifiable && item.type !== 'separator';
    });
  }

  function canMoveItems(request: MoveRequest): boolean {
    if (!canRemoveItems(request) || request.destinationId === rootId) return false;
    const destination = findNode(request.destinationId);
    if (!destination?.children || destination.unmodifiable) return false;
    const ids = new Set(request.ids);
    let folder = findNode(request.destinationId);
    while (folder) {
      if (ids.has(folder.id)) return false;
      folder = findNode(folder.parentId);
    }
    return true;
  }

  function focusPositions(): FocusPosition[] {
    return panes.map((pane) => ({
      ...pane,
      index: findNode(pane.folderId)?.children?.findIndex((item) => item.id === pane.selectedId) ?? -1
    }));
  }

  function canCreateItem(parentId: string): boolean {
    const folder = findNode(parentId);
    return !loading && !mutating && parentId !== rootId && !!folder?.children && !folder.unmodifiable;
  }

  async function createItem(request: CreateRequest): Promise<string | undefined> {
    if (!canCreateItem(request.parentId) || !request.title.trim() || (request.type === 'bookmark' && !request.url?.trim())) return;
    mutating = true;
    error = '';
    let createdId: string | undefined;
    let failed = false;
    try {
      const children = await browser.bookmarks.getChildren(request.parentId);
      const index = children.findIndex((item) => item.id === request.afterId) + 1;
      const created = await browser.bookmarks.create({
        parentId: request.parentId,
        index,
        type: request.type,
        title: request.title.trim(),
        ...(request.type === 'bookmark' ? { url: request.url!.trim() } : {})
      });
      createdId = created.id;
    } catch (cause) {
      failed = true;
      console.error('Failed to create a bookmark item', cause);
    } finally {
      mutating = false;
      await refreshAfterMutation();
      if (failed) error = 'createError';
    }
    return createdId;
  }

  async function removeItems(request: ItemRequest): Promise<void> {
    if (!canRemoveItems(request)) return;
    const positions = focusPositions();
    mutating = true;
    error = '';
    let failed = false;
    try {
      const items = await browser.bookmarks.getChildren(request.sourceId);
      const selected = items.filter((item) => request.ids.includes(item.id));
      if (selected.length !== new Set(request.ids).size || selected.some((item) => item.unmodifiable || item.type === 'separator')) {
        throw new Error('Selected bookmarks cannot be removed');
      }
      for (const item of selected) {
        if (item.type === 'folder' || item.children) await browser.bookmarks.removeTree(item.id);
        else await browser.bookmarks.remove(item.id);
      }
    } catch (cause) {
      failed = true;
      console.error('Failed to remove selected bookmarks', cause);
    } finally {
      mutating = false;
      mutationFocusPositions = positions;
      await refreshAfterMutation();
      mutationFocusPositions = undefined;
      if (failed) error = 'removeError';
    }
  }

  async function moveItems(request: MoveRequest): Promise<string[]> {
    if (!canMoveItems(request)) return [];
    const positions = focusPositions();
    mutating = true;
    error = '';
    const completed: string[] = [];
    let result: string[] = [];
    let failed = false;
    try {
      const source = await browser.bookmarks.getChildren(request.sourceId);
      const destination = request.sourceId === request.destinationId ? source : await browser.bookmarks.getChildren(request.destinationId);
      if (source.some((item) => request.ids.includes(item.id) && (item.unmodifiable || item.type === 'separator'))) {
        throw new Error('Selected bookmarks cannot be moved');
      }
      const plan = planMoves(source, destination, request);
      for (const move of plan.moves) {
        await browser.bookmarks.move(move.id, { parentId: move.parentId, index: move.index });
        completed.push(move.id);
      }
      result = plan.ids;
    } catch (cause) {
      failed = true;
      result = completed;
      console.error('Failed to move selected bookmarks', cause);
    } finally {
      mutating = false;
      if (request.sourceId !== request.destinationId) mutationFocusPositions = positions;
      await refreshAfterMutation();
      mutationFocusPositions = undefined;
      if (failed) error = 'moveError';
    }
    return result;
  }

  onMount(() => {
    let active = true;
    let pending = true;
    let refreshing: Promise<void> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function refreshTree(): Promise<void> {
      timer = undefined;
      if (!active || mutating) return Promise.resolve();
      if (refreshing) return refreshing;
      if (!pending) return Promise.resolve();
      refreshing = (async () => {
        try {
          // An event arriving during getTree requests another pass. Reads never
          // overlap, so an older snapshot cannot overwrite a newer one.
          while (active && pending && !mutating) {
            pending = false;
            await loadTree(() => active);
          }
        } finally {
          refreshing = undefined;
        }
      })();
      return refreshing;
    }

    refreshAfterMutation = async () => {
      pending = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      if (refreshing) await refreshing;
      await refreshTree();
    };

    function onBookmarksChanged(): void {
      pending = true;
      // Batch a burst of events, including changes made in this manager.
      if (!mutating && !refreshing && timer === undefined) timer = setTimeout(() => void refreshTree(), 50);
    }

    const events = [
      browser.bookmarks.onCreated,
      browser.bookmarks.onRemoved,
      browser.bookmarks.onChanged,
      browser.bookmarks.onMoved,
      browser.bookmarks.onChildrenReordered
    ];
    for (const event of events) event?.addListener(onBookmarksChanged);
    void refreshTree();
    void checkIconAccess();
    browser.permissions.onAdded.addListener(checkIconAccess);
    browser.permissions.onRemoved.addListener(checkIconAccess);
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      for (const event of events) event?.removeListener(onBookmarksChanged);
      browser.permissions.onAdded.removeListener(checkIconAccess);
      browser.permissions.onRemoved.removeListener(checkIconAccess);
    };
  });
</script>

<svelte:head>
  <title>{$t('pageTitle')}</title>
</svelte:head>

<main class="flex min-h-screen flex-col gap-[18px] p-6 max-[700px]:p-[14px]">
  <header class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <img class="size-9" src="./icons/logo.svg" alt="" />
      <div>
        <h1 class="text-[21px] leading-[1.15]">Total Bookmarks</h1>
        <p class="mt-[3px] text-[#657088]">{$t('subtitle')}</p>
      </div>
    </div>
    <LanguagePicker onOpenChange={(open) => (languageMenuOpen = open)} />
  </header>

  {#if iconAccessAllowed === false}
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d5dbea] bg-white px-[14px] py-[10px] text-[#34405a]" role="status">
      {#if iconManifestReady}
        <span>{$t('iconPermission')}</span>
        <button
          class="cursor-pointer rounded-lg border border-[#d5dbea] bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-[.45]"
          type="button"
          onclick={requestIconAccess}
          disabled={requestingIconAccess}
        >{$t('allowIcons')}</button>
      {:else}
        <span>{$t('reloadForIcons')}</span>
        <button
          class="cursor-pointer rounded-lg border border-[#d5dbea] bg-white px-3 py-2"
          type="button"
          onclick={() => browser.runtime.reload()}
        >{$t('reloadExtension')}</button>
      {/if}
    </div>
  {/if}

  {#if error}
    <p class="rounded-lg bg-[#fff1f1] px-[14px] py-[10px] text-[#a02c2c]" role="alert">{$t(error)}</p>
  {/if}

  <BookmarkPanels
    externalPopupOpen={languageMenuOpen}
    left={paneView(0)}
    right={paneView(1)}
    loading={loading && roots.length === 0}
    onSelect={(side, id) => (panes[side].selectedId = id)}
    onOpenFolder={navigate}
    onOpenBookmark={openBookmark}
    {canMoveItems}
    onMoveItems={moveItems}
    {canRemoveItems}
    onRemoveItems={removeItems}
    {canCreateItem}
    onCreateItem={createItem}
  />
</main>
