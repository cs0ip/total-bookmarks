<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import BookmarkList from './BookmarkList.svelte';

  type BookmarkNode = browser.bookmarks.BookmarkTreeNode;
  type Side = 0 | 1;
  type FolderState = { markedIds: Set<string>; focusedId: string };
  type PaneView = {
    side: Side;
    folder: BookmarkNode | null;
    items: BookmarkNode[];
    selectedId: string;
    folderPath: string;
  };
  type Props = {
    left: PaneView;
    right: PaneView;
    loading: boolean;
    onSelect: (side: Side, id: string) => void;
    onOpenFolder: (side: Side, id: string) => void;
    onOpenBookmark: (url: string) => void | Promise<void>;
  };

  let {
    left,
    right,
    loading,
    onSelect,
    onOpenFolder,
    onOpenBookmark
  }: Props = $props();

  let panels: HTMLDivElement;
  let activeSide = $state<Side>(0);
  let leftShare = $state(0.5);
  let drag = $state<{ pointerId: number; offset: number } | null>(null);
  const folderStates = [new SvelteMap<string, FolderState>(), new SvelteMap<string, FolderState>()];
  const emptyMarkedIds = new Set<string>();
  const lists: ({ focusSelected: () => void } | undefined)[] = [];

  function markedIdsFor(pane: PaneView): Set<string> {
    return folderStates[pane.side].get(pane.folder?.id ?? '')?.markedIds ?? emptyMarkedIds;
  }

  function selectItem(pane: PaneView, id: string): void {
    untrack(() => {
      if (pane.folder) {
        const states = folderStates[pane.side];
        const state = states.get(pane.folder.id);
        if (state?.focusedId !== id) {
          states.set(pane.folder.id, { markedIds: state?.markedIds ?? new Set(), focusedId: id });
        }
      }
      onSelect(pane.side, id);
    });
  }

  function markItems(pane: PaneView, markedIds: Set<string>): void {
    untrack(() => {
      if (!pane.folder) return;
      const states = folderStates[pane.side];
      const state = states.get(pane.folder.id);
      states.set(pane.folder.id, { markedIds, focusedId: state?.focusedId ?? pane.selectedId });
    });
  }

  function openFolder(pane: PaneView, id: string): void {
    if (id === pane.folder?.id) return;
    // Save before changing folders; only an upward transition restores focus.
    selectItem(pane, pane.selectedId);
    const focusedId = pane.folder?.parentId === id ? folderStates[pane.side].get(id)?.focusedId ?? '' : '';
    onOpenFolder(pane.side, id);
    onSelect(pane.side, focusedId);
  }

  function paneSideFor(target: EventTarget | null): Side | undefined {
    if (!(target instanceof Element)) return;
    const pane = target.closest<HTMLElement>('[data-bookmark-pane]');
    if (!pane || !panels.contains(pane)) return;
    return pane.dataset.bookmarkPane === '0' ? 0 : 1;
  }

  function focusActivePane(): void {
    lists[activeSide]?.focusSelected();
  }

  function startResize(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const divider = event.currentTarget as HTMLDivElement;
    drag = { pointerId: event.pointerId, offset: event.clientX - divider.getBoundingClientRect().left };
    divider.setPointerCapture(event.pointerId);
    focusActivePane();
  }

  function resizePanels(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const divider = event.currentTarget as HTMLDivElement;
    const bounds = panels.getBoundingClientRect();
    const availableWidth = bounds.width - divider.getBoundingClientRect().width;
    if (availableWidth <= 0) return;
    const leftWidth = event.clientX - bounds.left - drag.offset;
    leftShare = Math.max(0.2, Math.min(0.8, leftWidth / availableWidth));
  }

  function stopResize(event: PointerEvent): void {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    const divider = event.currentTarget as HTMLDivElement;
    if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  }

  onMount(() => {
    let mounted = true;

    function onDocumentFocus(event: FocusEvent): void {
      const side = paneSideFor(event.target);
      if (side !== undefined) activeSide = side;
      else focusActivePane();
    }

    async function restoreFocus(): Promise<void> {
      await tick();
      // Browser tabs and native permission dialogs keep their own focus.
      if (mounted && document.hasFocus()) focusActivePane();
    }

    function onDocumentMousedown(event: MouseEvent): void {
      if (event.button !== 0) return;
      const side = paneSideFor(event.target);
      if (side !== undefined) activeSide = side;
      if (side !== undefined && event.target instanceof Element && event.target.closest('button[aria-pressed]')) return;
      // Preserve focus without cancelling the subsequent button click.
      event.preventDefault();
      focusActivePane();
    }

    function onDocumentKeydown(event: KeyboardEvent): void {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      let side: Side;
      switch (event.key) {
        case 'Tab': side = activeSide === 0 ? 1 : 0; break;
        case 'ArrowLeft': side = 0; break;
        case 'ArrowRight': side = 1; break;
        default: return;
      }
      event.preventDefault();
      if (side === activeSide) return;
      activeSide = side;
      focusActivePane();
    }

    document.addEventListener('focusin', onDocumentFocus);
    document.addEventListener('focusout', restoreFocus);
    document.addEventListener('mousedown', onDocumentMousedown);
    document.addEventListener('keydown', onDocumentKeydown);
    window.addEventListener('focus', restoreFocus);
    focusActivePane();
    return () => {
      mounted = false;
      document.removeEventListener('focusin', onDocumentFocus);
      document.removeEventListener('focusout', restoreFocus);
      document.removeEventListener('mousedown', onDocumentMousedown);
      document.removeEventListener('keydown', onDocumentKeydown);
      window.removeEventListener('focus', restoreFocus);
    };
  });

</script>

<div
  bind:this={panels}
  class="panels-layout grid min-h-0 flex-1"
  class:resizing={drag !== null}
  style:--left-width={`${leftShare}fr`}
  style:--right-width={`${1 - leftShare}fr`}
>
  {#each [left, right] as pane (pane.side)}
    <section
      class="flex min-h-[360px] min-w-0 max-h-[calc(100vh-116px)] flex-col overflow-hidden rounded-xl border border-[#dce2ed] bg-white max-[700px]:min-h-[260px] max-[700px]:max-h-[45vh]"
      aria-label={pane.side === 0 ? 'Левая панель' : 'Правая панель'}
      data-bookmark-pane={pane.side}
    >
      <header class="border-b border-[#e6eaf1] px-4 pt-[14px] pb-3">
        <h2 class="mb-1 truncate text-[17px]">{pane.folder?.title || 'Все закладки'}</h2>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#758097]">
          <span>Элементов: {pane.items.length}</span>
          {#if markedIdsFor(pane).size > 0}
            <span>Выбрано: {markedIdsFor(pane).size}</span>
          {/if}
        </div>
      </header>

      <BookmarkList
        bind:this={lists[pane.side]}
        items={pane.items}
        selectedId={pane.selectedId}
        markedIds={markedIdsFor(pane)}
        parentFolderId={pane.folder?.parentId}
        {loading}
        active={activeSide === pane.side}
        onActivate={() => (activeSide = pane.side)}
        onSelect={(id) => selectItem(pane, id)}
        onMarkedIdsChange={(ids) => markItems(pane, ids)}
        onOpenFolder={(id) => openFolder(pane, id)}
        {onOpenBookmark}
      />

      <footer class="border-t border-[#e6eaf1] px-4 py-[10px] text-[#69748b]">
        <div class="folder-path" title={pane.folderPath} aria-label={`Путь к текущей папке: ${pane.folderPath}`}>
          <span dir="ltr">{pane.folderPath || '\u00a0'}</span>
        </div>
      </footer>
    </section>

    {#if pane.side === 0}
      <div
        class="group flex cursor-col-resize touch-none justify-center max-[700px]:hidden"
        role="separator"
        aria-label="Изменить ширину панелей"
        aria-orientation="vertical"
        aria-valuemin={20}
        aria-valuemax={80}
        aria-valuenow={Math.round(leftShare * 100)}
        tabindex="-1"
        title="Перетащите, чтобы изменить ширину панелей; двойной клик — 50/50"
        ondblclick={() => (leftShare = 0.5)}
        onpointerdown={startResize}
        onpointermove={resizePanels}
        onpointerup={stopResize}
        onpointercancel={stopResize}
        onlostpointercapture={stopResize}
      >
        <span class={`my-3 w-[2px] rounded-full group-hover:bg-[#5f44b4] ${drag ? 'bg-[#5f44b4]' : 'bg-[#d5dbea]'}`} aria-hidden="true"></span>
      </div>
    {/if}
  {/each}
</div>

<style>
  .folder-path {
    overflow: hidden;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
    text-overflow: "...";
  }

  .panels-layout {
    grid-template-columns: minmax(0, var(--left-width)) 12px minmax(0, var(--right-width));
  }

  .resizing {
    cursor: col-resize;
    user-select: none;
  }

  @media (max-width: 700px) {
    .panels-layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
  }
</style>
