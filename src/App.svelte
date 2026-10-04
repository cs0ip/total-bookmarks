<script lang="ts">
  import { onMount } from 'svelte';
  import BookmarkList from './components/BookmarkList.svelte';

  type BookmarkNode = browser.bookmarks.BookmarkTreeNode;
  type Side = 0 | 1;
  type PaneState = { folderId: string; selectedId: string };

  const sides: Side[] = [0, 1];
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

  function itemTitle(item: BookmarkNode | null): string {
    return item?.title || (item?.type === 'separator' ? 'Разделитель' : 'Без названия');
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

<main class="app">
  <header class="topbar">
    <div class="brand">
      <img src="./icons/bookmark.svg" alt="" width="36" height="36" />
      <div>
        <h1>Total Bookmarks</h1>
        <p>Двухпанельный менеджер закладок</p>
      </div>
    </div>
    <button class="refresh" type="button" onclick={loadTree} disabled={loading || busy}>Обновить</button>
  </header>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="workspace">
    {#each sides as side}
      <section class="pane" aria-label={side === 0 ? 'Левая панель' : 'Правая панель'}>
        <header class="pane-header">
          <span class="pane-label">{side === 0 ? 'Левая панель' : 'Правая панель'}</span>
          <div class="location">
            <button
              class="up"
              type="button"
              title="На уровень выше"
              aria-label="На уровень выше"
              onclick={() => goUp(side)}
              disabled={!currentFolder(side)?.parentId}
            >↑</button>
            <h2>{currentFolder(side)?.title || 'Все закладки'}</h2>
          </div>
          <span class="items-count">Элементов: {itemsIn(side).length}</span>
        </header>

        <BookmarkList
          items={itemsIn(side)}
          selectedId={panes[side].selectedId}
          loading={loading && roots.length === 0}
          onSelect={(id) => (panes[side].selectedId = id)}
          onOpenFolder={(id) => navigate(side, id)}
          onOpenBookmark={openBookmark}
        />

        <footer class="pane-footer">
          {#if selectedItem(side)}
            Выбрано: {itemTitle(selectedItem(side))}
          {:else}
            Выберите элемент
          {/if}
        </footer>
      </section>

      {#if side === 0}
        <div class="moves" role="group" aria-label="Перемещение между панелями">
          <button
            type="button"
            title="Переместить выбранное вправо"
            aria-label="Переместить выбранное вправо"
            onclick={() => moveSelected(0)}
            disabled={!canMove(0)}
          >→</button>
          <button
            type="button"
            title="Переместить выбранное влево"
            aria-label="Переместить выбранное влево"
            onclick={() => moveSelected(1)}
            disabled={!canMove(1)}
          >←</button>
        </div>
      {/if}
    {/each}
  </div>
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #f4f6fa; color: #20273b; font: 14px/1.4 system-ui, sans-serif; }
  :global(button) { font: inherit; cursor: pointer; }
  :global(button:disabled) { cursor: not-allowed; opacity: 0.45; }
  :global(button:focus-visible) { outline: 2px solid #5f44b4; outline-offset: 2px; }
  .app { display: flex; flex-direction: column; min-height: 100vh; padding: 24px; gap: 18px; }
  .topbar, .brand, .location, .moves { display: flex; align-items: center; }
  .topbar { justify-content: space-between; gap: 16px; }
  .brand { gap: 12px; }
  h1, h2, p { margin: 0; }
  h1 { font-size: 21px; line-height: 1.15; }
  .brand p { margin-top: 3px; color: #657088; }
  .refresh, .up, .moves button { border: 1px solid #d5dbea; border-radius: 8px; background: #fff; color: #34405a; }
  .refresh { padding: 8px 14px; }
  .error { padding: 10px 14px; border-radius: 8px; background: #fff1f1; color: #a02c2c; }
  .workspace { display: grid; grid-template-columns: minmax(0, 1fr) 52px minmax(0, 1fr); gap: 12px; flex: 1; min-height: 0; }
  .pane { display: flex; flex-direction: column; min-width: 0; min-height: 360px; max-height: calc(100vh - 116px); overflow: hidden; border: 1px solid #dce2ed; border-radius: 12px; background: #fff; }
  .pane-header { padding: 14px 16px 12px; border-bottom: 1px solid #e6eaf1; }
  .pane-label { color: #69748b; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  .location { gap: 9px; margin: 8px 0 4px; }
  .up { width: 30px; height: 30px; flex: none; font-size: 19px; }
  h2 { overflow: hidden; font-size: 17px; text-overflow: ellipsis; white-space: nowrap; }
  .items-count { color: #758097; font-size: 12px; }
  .pane-footer { overflow: hidden; padding: 10px 16px; border-top: 1px solid #e6eaf1; color: #69748b; text-overflow: ellipsis; white-space: nowrap; }
  .moves { flex-direction: column; justify-content: center; gap: 10px; }
  .moves button { width: 42px; height: 42px; color: #6243ba; font-size: 22px; }
  @media (max-width: 700px) {
    .app { padding: 14px; }
    .workspace { grid-template-columns: minmax(0, 1fr); }
    .pane { min-height: 260px; max-height: 45vh; }
    .moves { flex-direction: row; }
  }
</style>
