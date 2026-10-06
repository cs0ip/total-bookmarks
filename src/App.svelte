<script lang="ts">
  import { onMount } from 'svelte';
  import BookmarkPanels from './components/BookmarkPanels.svelte';
  import { PARENT_FOLDER_ITEM_ID } from './components/BookmarkList.svelte';
  import { ICON_ORIGINS } from './icons/protocol';

  type BookmarkNode = browser.bookmarks.BookmarkTreeNode;
  type Side = 0 | 1;
  type PaneState = { folderId: string; selectedId: string };

  let roots: BookmarkNode[] = $state([]);
  let nodesById = $state(new Map<string, BookmarkNode>());
  let rootId = $state('');
  let panes: PaneState[] = $state([
    { folderId: '', selectedId: '' },
    { folderId: '', selectedId: '' }
  ]);
  let loading = $state(true);
  let error = $state('');
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
      error = 'Не удалось разрешить загрузку иконок.';
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
      names.push(folder.title || 'Без названия');
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
      if (!isActive()) return;
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
      for (const pane of panes) {
        if (!findNode(pane.folderId)) pane.folderId = rootId;
        const parentSelected = pane.selectedId === PARENT_FOLDER_ITEM_ID && findNode(pane.folderId)?.parentId;
        if (!parentSelected && findNode(pane.selectedId)?.parentId !== pane.folderId) pane.selectedId = '';
      }
    } catch (cause) {
      if (!isActive()) return;
      error = 'Не удалось загрузить закладки.';
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
      error = 'Не удалось открыть закладку.';
      console.error('Failed to open the bookmark', cause);
    }
  }

  onMount(() => {
    let active = true;
    let pending = true;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refreshTree(): Promise<void> {
      timer = undefined;
      if (!active || refreshing) return;
      refreshing = true;
      try {
        // An event arriving during getTree requests another pass. Reads never
        // overlap, so an older snapshot cannot overwrite a newer one.
        while (active && pending) {
          pending = false;
          await loadTree(() => active);
        }
      } finally {
        refreshing = false;
      }
    }

    function onBookmarksChanged(): void {
      pending = true;
      // Batch a burst of events, including changes made in this manager.
      if (!refreshing && timer === undefined) timer = setTimeout(() => void refreshTree(), 50);
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
  <title>Total Bookmarks — менеджер закладок</title>
</svelte:head>

<main class="flex min-h-screen flex-col gap-[18px] p-6 max-[700px]:p-[14px]">
  <header class="flex items-center justify-between gap-4">
    <div class="flex items-center gap-3">
      <img class="size-9" src="./icons/bookmark.svg" alt="" />
      <div>
        <h1 class="text-[21px] leading-[1.15]">Total Bookmarks</h1>
        <p class="mt-[3px] text-[#657088]">Двухпанельный менеджер закладок</p>
      </div>
    </div>
  </header>

  {#if iconAccessAllowed === false}
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#d5dbea] bg-white px-[14px] py-[10px] text-[#34405a]" role="status">
      {#if iconManifestReady}
        <span>Для загрузки иконок сайтов нужен доступ к сайтам закладок.</span>
        <button
          class="cursor-pointer rounded-lg border border-[#d5dbea] bg-white px-3 py-2 disabled:cursor-not-allowed disabled:opacity-[.45]"
          type="button"
          onclick={requestIconAccess}
          disabled={requestingIconAccess}
        >Разрешить загрузку иконок</button>
      {:else}
        <span>Перезагрузите расширение, чтобы применить обновление иконок.</span>
        <button
          class="cursor-pointer rounded-lg border border-[#d5dbea] bg-white px-3 py-2"
          type="button"
          onclick={() => browser.runtime.reload()}
        >Перезагрузить расширение</button>
      {/if}
    </div>
  {/if}

  {#if error}
    <p class="rounded-lg bg-[#fff1f1] px-[14px] py-[10px] text-[#a02c2c]" role="alert">{error}</p>
  {/if}

  <BookmarkPanels
    left={paneView(0)}
    right={paneView(1)}
    loading={loading && roots.length === 0}
    onSelect={(side, id) => (panes[side].selectedId = id)}
    onOpenFolder={navigate}
    onOpenBookmark={openBookmark}
  />
</main>
