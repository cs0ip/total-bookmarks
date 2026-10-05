<script lang="ts">
  import Bookmark from './Bookmark.svelte';

  type BookmarkNode = browser.bookmarks.BookmarkTreeNode;
  type Props = {
    items: BookmarkNode[];
    selectedId: string;
    loading?: boolean;
    onSelect: (id: string) => void;
    onOpenFolder: (id: string) => void;
    onOpenBookmark: (url: string) => void | Promise<void>;
  };

  let { items, selectedId, loading = false, onSelect, onOpenFolder, onOpenBookmark }: Props = $props();

  function itemTitle(item: BookmarkNode): string {
    return item.title || (item.type === 'separator' ? 'Разделитель' : 'Без названия');
  }

</script>

<div class="min-h-0 flex-1 overflow-auto p-[6px]">
  {#if loading}
    <p class="m-0 px-[14px] py-[30px] text-center text-[#758097]">Загрузка…</p>
  {:else if items.length === 0}
    <p class="m-0 px-[14px] py-[30px] text-center text-[#758097]">Папка пуста</p>
  {:else}
    {#each items as item (item.id)}
      <div class={`flex min-w-0 items-center gap-1 rounded-lg ${selectedId === item.id ? 'bg-[#ebe6fb]' : 'hover:bg-[#f5f6fb]'}`}>
        <button
          class="flex min-w-0 flex-1 cursor-pointer items-center gap-[10px] border-0 bg-transparent p-[9px] text-left text-inherit focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f44b4]"
          type="button"
          aria-pressed={selectedId === item.id}
          onclick={() => onSelect(item.id)}
        >
          {#if item.url}
            <Bookmark bookmark={item} />
          {:else}
            <span class="w-[22px] shrink-0 text-center text-[18px] text-[#6243ba]" aria-hidden="true">{item.children ? '▣' : '—'}</span>
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-semibold">{itemTitle(item)}</span>
              <span class="text-xs text-[#738098]">{item.type === 'separator' ? 'Разделитель' : 'Папка'}</span>
            </span>
          {/if}
        </button>
        {#if item.children}
          <button
            class="mr-2 shrink-0 cursor-pointer rounded-lg border border-[#d5dbea] bg-white px-2 py-[5px] text-xs text-[#34405a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f44b4]"
            type="button"
            onclick={() => onOpenFolder(item.id)}
          >Открыть</button>
        {:else if item.url}
          <button
            class="mr-2 shrink-0 cursor-pointer rounded-lg border border-[#d5dbea] bg-white px-2 py-[5px] text-xs text-[#34405a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5f44b4]"
            type="button"
            aria-label={`Открыть ${itemTitle(item)} в новой вкладке`}
            onclick={() => {
              if (item.url) void onOpenBookmark(item.url);
            }}
          >↗</button>
        {/if}
      </div>
    {/each}
  {/if}
</div>
