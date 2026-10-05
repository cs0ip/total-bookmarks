<script lang="ts">
  import { onMount } from 'svelte';
  import BookmarkPanels from './components/BookmarkPanels.svelte';

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
  let busy = $state(false);
  let error = $state('');

  function findNode(id: string | undefined): BookmarkNode | null {
    if (!id) return null;
    return nodesById.get(id) ?? null;
  }

  function otherSide(side: Side): Side {
    return side === 0 ? 1 : 0;
  }

  function currentFolder(side: Side): BookmarkNode | null {
    return findNode(panes[side].folderId);
  }

  function itemsIn(side: Side): BookmarkNode[] {
    return currentFolder(side)?.children ?? [];
  }

  function selectedItem(side: Side): BookmarkNode | null {
    return findNode(panes[side].selectedId);
  }

  function paneView(side: Side) {
    return {
      side,
      folder: currentFolder(side),
      items: itemsIn(side),
      selectedId: panes[side].selectedId,
      selected: selectedItem(side)
    };
  }

  async function loadTree() {
    loading = true;
    error = '';
    try {
      roots = await browser.bookmarks.getTree();
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
        if (!findNode(pane.selectedId)) pane.selectedId = '';
      }
    } catch (cause) {
      error = 'Не удалось загрузить закладки.';
      console.error(error, cause);
    } finally {
      loading = false;
    }
  }

  function navigate(side: Side, id: string): void {
    const folder = findNode(id);
    if (!folder?.children) return;
    panes[side].folderId = id;
    panes[side].selectedId = '';
  }

  function goUp(side: Side): void {
    const parentId = currentFolder(side)?.parentId;
    if (parentId) navigate(side, parentId);
  }

  function canMove(from: Side): boolean {
    const source = selectedItem(from);
    const destination = currentFolder(otherSide(from));
    if (!source || !destination || busy || loading) return false;
    if (source.unmodifiable || source.parentId === rootId) return false;
    if (destination.id === rootId || destination.id === source.parentId) return false;

    let folder: BookmarkNode | null = destination;
    while (folder) {
      if (folder.id === source.id) return false;
      folder = findNode(folder.parentId);
    }
    return true;
  }

  async function moveSelected(from: Side): Promise<void> {
    if (!canMove(from)) return;
    const sourceId = panes[from].selectedId;
    const destinationId = panes[otherSide(from)].folderId;
    busy = true;
    error = '';
    try {
      await browser.bookmarks.move(sourceId, { parentId: destinationId });
      panes[from].selectedId = '';
      await loadTree();
    } catch (cause) {
      error = 'Не удалось переместить элемент.';
      console.error(error, cause);
    } finally {
      busy = false;
    }
  }

  async function openBookmark(url: string): Promise<void> {
    try {
      await browser.tabs.create({ url });
    } catch (cause) {
      error = 'Не удалось открыть закладку.';
      console.error(error, cause);
    }
  }

  onMount(() => {
    void loadTree();
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
    <button
      class="cursor-pointer rounded-lg border border-[#d5dbea] bg-white px-[14px] py-2 text-[#34405a] disabled:cursor-not-allowed disabled:opacity-[.45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f44b4]"
      type="button"
      onclick={loadTree}
      disabled={loading || busy}
    >Обновить</button>
  </header>

  {#if error}
    <p class="rounded-lg bg-[#fff1f1] px-[14px] py-[10px] text-[#a02c2c]" role="alert">{error}</p>
  {/if}

  <BookmarkPanels
    left={paneView(0)}
    right={paneView(1)}
    loading={loading && roots.length === 0}
    canMoveRight={canMove(0)}
    canMoveLeft={canMove(1)}
    onGoUp={goUp}
    onSelect={(side, id) => (panes[side].selectedId = id)}
    onOpenFolder={navigate}
    onOpenBookmark={openBookmark}
    onMove={moveSelected}
  />
</main>
