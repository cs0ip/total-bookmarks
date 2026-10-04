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

<div class="items">
  {#if loading}
    <p class="empty">Загрузка…</p>
  {:else if items.length === 0}
    <p class="empty">Папка пуста</p>
  {:else}
    {#each items as item (item.id)}
      <div class:selected={selectedId === item.id} class="item">
        <button
          class="item-select"
          type="button"
          aria-pressed={selectedId === item.id}
          onclick={() => onSelect(item.id)}
        >
          <span class="item-symbol" aria-hidden="true">{item.children ? '▣' : item.type === 'separator' ? '—' : '↗'}</span>
          {#if item.url}
            <Bookmark bookmark={item} />
          {:else}
            <span class="item-text">
              <span class="item-title">{itemTitle(item)}</span>
              <span class="item-type">{item.type === 'separator' ? 'Разделитель' : 'Папка'}</span>
            </span>
          {/if}
        </button>
        {#if item.children}
          <button class="item-open" type="button" onclick={() => onOpenFolder(item.id)}>Открыть</button>
        {:else if item.url}
          <button
            class="item-open"
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

<style>
  .items { flex: 1; min-height: 0; overflow: auto; padding: 6px; }
  .item { display: flex; align-items: center; gap: 4px; min-width: 0; border-radius: 8px; }
  .item:hover { background: #f5f6fb; }
  .item.selected { background: #ebe6fb; }
  .item-select { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; padding: 9px; border: 0; background: transparent; color: inherit; text-align: left; }
  .item-symbol { width: 22px; flex: none; color: #6243ba; font-size: 18px; text-align: center; }
  .item-text { display: flex; flex-direction: column; min-width: 0; }
  .item-title { overflow: hidden; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .item-type { color: #738098; font-size: 12px; }
  .item-open { flex: none; margin-right: 8px; padding: 5px 8px; border: 1px solid #d5dbea; border-radius: 8px; background: #fff; color: #34405a; font-size: 12px; }
  .empty { margin: 0; padding: 30px 14px; color: #758097; text-align: center; }
</style>
