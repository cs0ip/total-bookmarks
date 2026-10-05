<script lang="ts">
  import BookmarkList, { PARENT_FOLDER_ITEM_ID } from './BookmarkList.svelte';

  type BookmarkNode = browser.bookmarks.BookmarkTreeNode;
  type Side = 0 | 1;
  type PaneView = {
    side: Side;
    folder: BookmarkNode | null;
    items: BookmarkNode[];
    selectedId: string;
    selected: BookmarkNode | null;
  };
  type Props = {
    left: PaneView;
    right: PaneView;
    loading: boolean;
    canMoveRight: boolean;
    canMoveLeft: boolean;
    onSelect: (side: Side, id: string) => void;
    onOpenFolder: (side: Side, id: string) => void;
    onOpenBookmark: (url: string) => void | Promise<void>;
    onMove: (side: Side) => void | Promise<void>;
  };

  let {
    left,
    right,
    loading,
    canMoveRight,
    canMoveLeft,
    onSelect,
    onOpenFolder,
    onOpenBookmark,
    onMove
  }: Props = $props();

  function itemTitle(item: BookmarkNode): string {
    return item.title || (item.type === 'separator' ? 'Разделитель' : 'Без названия');
  }
</script>

<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_52px_minmax(0,1fr)] gap-3 max-[700px]:grid-cols-[minmax(0,1fr)]">
  {#each [left, right] as pane (pane.side)}
    <section
      class="flex min-h-[360px] min-w-0 max-h-[calc(100vh-116px)] flex-col overflow-hidden rounded-xl border border-[#dce2ed] bg-white max-[700px]:min-h-[260px] max-[700px]:max-h-[45vh]"
      aria-label={pane.side === 0 ? 'Левая панель' : 'Правая панель'}
    >
      <header class="border-b border-[#e6eaf1] px-4 pt-[14px] pb-3">
        <h2 class="mb-1 truncate text-[17px]">{pane.folder?.title || 'Все закладки'}</h2>
        <span class="text-xs text-[#758097]">Элементов: {pane.items.length}</span>
      </header>

      <BookmarkList
        items={pane.items}
        selectedId={pane.selectedId}
        parentFolderId={pane.folder?.parentId}
        {loading}
        onSelect={(id) => onSelect(pane.side, id)}
        onOpenFolder={(id) => onOpenFolder(pane.side, id)}
        {onOpenBookmark}
      />

      <footer class="truncate border-t border-[#e6eaf1] px-4 py-[10px] text-[#69748b]">
        {#if pane.selectedId === PARENT_FOLDER_ITEM_ID}
          Выбрано: ..
        {:else if pane.selected}
          Выбрано: {itemTitle(pane.selected)}
        {:else}
          Выберите элемент
        {/if}
      </footer>
    </section>

    {#if pane.side === 0}
      <div class="flex flex-col items-center justify-center gap-[10px] max-[700px]:flex-row" role="group" aria-label="Перемещение между панелями">
        <button
          class="size-[42px] cursor-pointer rounded-lg border border-[#d5dbea] bg-white text-[22px] text-[#6243ba] disabled:cursor-not-allowed disabled:opacity-[.45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f44b4]"
          type="button"
          title="Переместить выбранное вправо"
          aria-label="Переместить выбранное вправо"
          onclick={() => void onMove(0)}
          disabled={!canMoveRight}
        >→</button>
        <button
          class="size-[42px] cursor-pointer rounded-lg border border-[#d5dbea] bg-white text-[22px] text-[#6243ba] disabled:cursor-not-allowed disabled:opacity-[.45] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f44b4]"
          type="button"
          title="Переместить выбранное влево"
          aria-label="Переместить выбранное влево"
          onclick={() => void onMove(1)}
          disabled={!canMoveLeft}
        >←</button>
      </div>
    {/if}
  {/each}
</div>
