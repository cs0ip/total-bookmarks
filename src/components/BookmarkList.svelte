<script module lang="ts">
  export const PARENT_FOLDER_ITEM_ID = '..';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import Bookmark from './Bookmark.svelte';

  type BookmarkNode = browser.bookmarks.BookmarkTreeNode;
  type Props = {
    items: BookmarkNode[];
    selectedId: string;
    markedIds: Set<string>;
    parentFolderId?: string;
    loading?: boolean;
    active?: boolean;
    dropMarkerTop?: number;
    draggedIds?: ReadonlySet<string>;
    onActivate: () => void;
    onSelect: (id: string) => void;
    onMarkedIdsChange: (ids: Set<string>) => void;
    onOpenFolder: (id: string) => void;
    onOpenBookmark: (url: string) => void | Promise<void>;
  };

  let { items, selectedId, markedIds, parentFolderId, loading = false, active = false, dropMarkerTop, draggedIds, onActivate, onSelect, onMarkedIdsChange, onOpenFolder, onOpenBookmark }: Props = $props();
  let list: HTMLDivElement;
  let preservingViewport = false;
  let previousRows: BookmarkNode[] | undefined;
  let previousSelectedId: string | undefined;
  const rows: BookmarkNode[] = $derived(parentFolderId ? [
    { id: PARENT_FOLDER_ITEM_ID, title: '..', type: 'folder', children: [] },
    ...items
  ] : items);
  const activeSelectedId = $derived(rows.some((item) => item.id === selectedId) ? selectedId : rows[0]?.id ?? '');

  onMount(() => {
    list.addEventListener('keydown', onListKeydown);
    return () => list.removeEventListener('keydown', onListKeydown);
  });

  $effect(() => {
    if (!loading && selectedId !== activeSelectedId) onSelect(activeSelectedId);
  });

  $effect(() => {
    if (loading) return;
    const available = new Set(items.filter((item) => item.type !== 'separator').map((item) => item.id));
    const retained = new Set([...markedIds].filter((id) => available.has(id)));
    if (retained.size !== markedIds.size) onMarkedIdsChange(retained);
  });

  function markItem(id: string, checked: boolean): void {
    const next = new Set(markedIds);
    if (checked) next.add(id);
    else next.delete(id);
    onMarkedIdsChange(next);
  }

  function toggleRange(from: number, to: number): void {
    const next = new Set(markedIds);
    let changed = false;
    for (let index = Math.min(from, to); index <= Math.max(from, to); index++) {
      const item = rows[index];
      if (item.id === PARENT_FOLDER_ITEM_ID || item.type === 'separator') continue;
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      changed = true;
    }
    if (changed) onMarkedIdsChange(next);
  }

  $effect(() => {
    const reveal = rows !== previousRows || activeSelectedId !== previousSelectedId;
    previousRows = rows;
    previousSelectedId = activeSelectedId;
    if (active) focusSelected(reveal);
  });

  export function focusSelected(reveal = true): void {
    const selectedIndex = rows.findIndex((item) => item.id === activeSelectedId);
    const selected = !loading && selectedIndex >= 0 ? list.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')[selectedIndex] : list;
    const target = selected ?? list;
    if (document.activeElement !== target) {
      preservingViewport = !reveal;
      try {
        target.focus({ preventScroll: true });
      } finally {
        preservingViewport = false;
      }
    }
    if (reveal && target !== list) keepRowVisible(target);
  }

  export function insertionAt(clientY: number): { afterId?: string; top: number } {
    const bounds = list.getBoundingClientRect();
    let afterId: string | undefined;
    let top = parseFloat(getComputedStyle(list).paddingTop);
    for (const row of list.querySelectorAll<HTMLElement>('[data-bookmark-row]')) {
      const rect = row.getBoundingClientRect();
      if (row.dataset.bookmarkId !== PARENT_FOLDER_ITEM_ID) {
        if (clientY < (rect.top + rect.bottom) / 2) {
          return { afterId, top: rect.top - bounds.top - list.clientTop + list.scrollTop };
        }
        afterId = row.dataset.bookmarkId;
      }
      top = rect.bottom - bounds.top - list.clientTop + list.scrollTop;
    }
    return { afterId, top };
  }

  function keepRowVisible(target: HTMLElement): void {
    const viewport = list.getBoundingClientRect();
    const padding = getComputedStyle(list);
    const top = viewport.top + list.clientTop + parseFloat(padding.paddingTop);
    const bottom = viewport.top + list.clientTop + list.clientHeight - parseFloat(padding.paddingBottom);
    const row = target.getBoundingClientRect();
    // Move only this list, and only far enough to reveal the focused row.
    if (row.top < top) list.scrollTop += row.top - top;
    else if (row.bottom > bottom) list.scrollTop += row.bottom - bottom;
  }

  function onItemFocus(item: BookmarkNode, target: HTMLButtonElement): void {
    onSelect(item.id);
    if (!preservingViewport) keepRowVisible(target);
  }

  function onListKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === ' ') {
      event.preventDefault();
      if (loading || event.repeat) return;
      const item = rows.find((row) => row.id === activeSelectedId);
      if (item && item.id !== PARENT_FOLDER_ITEM_ID && item.type !== 'separator') {
        markItem(item.id, !markedIds.has(item.id));
      }
      return;
    }
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (!loading && !event.repeat && parentFolderId) onOpenFolder(parentFolderId);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Insert', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (loading || rows.length === 0) return;
    const index = rows.findIndex((item) => item.id === activeSelectedId);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 :
      Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowUp' ? -1 : 1)));
    if (event.key === 'Insert' || event.shiftKey) {
      toggleRange(index, event.shiftKey && (event.key === 'Home' || event.key === 'End') ? nextIndex : index);
    }
    if (nextIndex === index) return;
    onSelect(rows[nextIndex].id);
  }

  function itemTitle(item: BookmarkNode): string {
    return item.title || (item.type === 'separator' ? 'Разделитель' : 'Без названия');
  }

  function openItem(item: BookmarkNode): void {
    if (item.type === 'separator') return;
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
    if (!event.repeat && activeSelectedId === item.id) openItem(item);
  }

</script>

<div bind:this={list} data-bookmark-list role="group" aria-label="Список закладок" tabindex="-1" onfocusin={onActivate} class="relative min-h-0 flex-1 overflow-auto p-[6px]">
  {#if loading}
    <p class="m-0 px-[14px] py-[30px] text-center text-[#758097]">Загрузка…</p>
  {:else if rows.length === 0}
    <p class="m-0 px-[14px] py-[30px] text-center text-[#758097]">Папка пуста</p>
  {:else}
    {#each rows as item (item.id)}
      <div data-bookmark-row data-bookmark-id={item.id} class:dragged={draggedIds?.has(item.id)} class={`flex min-w-0 items-center gap-1 rounded-lg focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-[#5f44b4] ${activeSelectedId === item.id ? 'bg-[#ebe6fb]' : markedIds.has(item.id) ? 'bg-[#f1f6fd]' : 'hover:bg-[#f5f6fb]'}`}>
        {#if item.id !== PARENT_FOLDER_ITEM_ID && item.type !== 'separator'}
          <Bookmark
            bookmark={item}
            checked={markedIds.has(item.id)}
            focused={activeSelectedId === item.id}
            onCheckedChange={(checked) => markItem(item.id, checked)}
            onSelect={() => onSelect(item.id)}
            onOpen={() => openItem(item)}
            onFocus={(target) => onItemFocus(item, target)}
            onKeydown={(event) => onItemKeydown(event, item)}
          />
        {:else}
          <button
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-[10px] border-0 bg-transparent p-[9px] text-left text-inherit focus:outline-none"
            type="button"
            aria-pressed={activeSelectedId === item.id}
            aria-label={item.id === PARENT_FOLDER_ITEM_ID ? 'На уровень выше' : undefined}
            onclick={() => onSelect(item.id)}
            onfocus={(event) => onItemFocus(item, event.currentTarget)}
            ondblclick={() => openItem(item)}
            onkeydown={(event) => onItemKeydown(event, item)}
          >
            {#if item.id === PARENT_FOLDER_ITEM_ID}
              <span class="flex size-[22px] shrink-0 items-center justify-center text-[19px] text-[#34405a]" aria-hidden="true">↑</span>
            {:else}
              <span class="w-[22px] shrink-0 text-center text-[18px] text-[#738098]" aria-hidden="true">—</span>
            {/if}
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-semibold">{itemTitle(item)}</span>
              <span class="text-xs text-[#738098]">{item.id === PARENT_FOLDER_ITEM_ID ? 'Родительская папка' : item.type === 'separator' ? 'Разделитель' : 'Папка'}</span>
            </span>
          </button>
        {/if}
      </div>
    {/each}
  {/if}
  {#if dropMarkerTop !== undefined}
    <div data-drop-marker aria-hidden="true" class="pointer-events-none absolute right-[6px] left-[6px] z-10 h-[3px] rounded bg-[#5f44b4]" style:top={`${dropMarkerTop - 1}px`}></div>
  {/if}
</div>

<style>
  .dragged { opacity: 0.5; }
</style>
