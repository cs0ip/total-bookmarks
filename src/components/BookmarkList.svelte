<script module lang="ts">
  export const PARENT_FOLDER_ITEM_ID = '..';
</script>

<script lang="ts">
  import Bookmark from './Bookmark.svelte';
  import Favicons from './Favicons.svelte';

  type BookmarkNode = browser.bookmarks.BookmarkTreeNode;
  type Props = {
    items: BookmarkNode[];
    selectedId: string;
    parentFolderId?: string;
    loading?: boolean;
    onSelect: (id: string) => void;
    onOpenFolder: (id: string) => void;
    onOpenBookmark: (url: string) => void | Promise<void>;
  };

  let { items, selectedId, parentFolderId, loading = false, onSelect, onOpenFolder, onOpenBookmark }: Props = $props();
  const rows: BookmarkNode[] = $derived(parentFolderId ? [
    { id: PARENT_FOLDER_ITEM_ID, title: '..', type: 'folder', children: [] },
    ...items
  ] : items);

  function itemTitle(item: BookmarkNode): string {
    return item.title || (item.type === 'separator' ? 'Разделитель' : 'Без названия');
  }

  function openItem(item: BookmarkNode): void {
    if (item.id === PARENT_FOLDER_ITEM_ID) {
      if (parentFolderId) onOpenFolder(parentFolderId);
    }
    else if (item.url) void onOpenBookmark(item.url);
    else if (item.children) onOpenFolder(item.id);
  }

  function onItemKeydown(event: KeyboardEvent, item: BookmarkNode): void {
    if (event.key !== 'Enter') return;
    // Suppress the button's native click so Enter opens only the selected item.
    event.preventDefault();
    if (!event.repeat && selectedId === item.id) openItem(item);
  }

</script>

<div class="min-h-0 flex-1 overflow-auto p-[6px]">
  {#if loading}
    <p class="m-0 px-[14px] py-[30px] text-center text-[#758097]">Загрузка…</p>
  {:else if rows.length === 0}
    <p class="m-0 px-[14px] py-[30px] text-center text-[#758097]">Папка пуста</p>
  {:else}
    {#each rows as item (item.id)}
      <div class={`flex min-w-0 items-center gap-1 rounded-lg ${selectedId === item.id ? 'bg-[#ebe6fb]' : 'hover:bg-[#f5f6fb]'}`}>
        <button
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-[10px] border-0 bg-transparent p-[9px] text-left text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f44b4]"
          type="button"
          aria-pressed={selectedId === item.id}
          aria-label={item.id === PARENT_FOLDER_ITEM_ID ? 'На уровень выше' : undefined}
          onclick={() => onSelect(item.id)}
          ondblclick={() => openItem(item)}
          onkeydown={(event) => onItemKeydown(event, item)}
        >
          {#if item.url}
            <Bookmark bookmark={item} />
          {:else}
            {#if item.id === PARENT_FOLDER_ITEM_ID}
              <span class="flex size-[22px] shrink-0 items-center justify-center text-[19px] text-[#34405a]" aria-hidden="true">↑</span>
            {:else if item.type === 'separator'}
              <span class="w-[22px] shrink-0 text-center text-[18px] text-[#738098]" aria-hidden="true">—</span>
            {:else}
              <Favicons folder />
            {/if}
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-semibold">{itemTitle(item)}</span>
              <span class="text-xs text-[#738098]">{item.id === PARENT_FOLDER_ITEM_ID ? 'Родительская папка' : item.type === 'separator' ? 'Разделитель' : 'Папка'}</span>
            </span>
          {/if}
        </button>
      </div>
    {/each}
  {/if}
</div>
