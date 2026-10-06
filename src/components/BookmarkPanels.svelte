<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import BookmarkList from './BookmarkList.svelte';
  import CommandBar, { type CommandBarButton } from './CommandBar.svelte';
  import type { MoveRequest } from '../bookmarks/move';

  type BookmarkNode = browser.bookmarks.BookmarkTreeNode;
  type Side = 0 | 1;
  type MoveDirection = 'up' | 'down' | 'left' | 'right';
  type FolderState = { markedIds: Set<string>; focusedId: string };
  type ItemDrag = {
    pointerId: number;
    side: Side;
    folderId: string;
    ids: Set<string>;
    markedIds: Set<string>;
    startX: number;
    startY: number;
  };
  type DropTarget = { side: Side; request: MoveRequest; top: number };
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
    canMoveItems: (request: MoveRequest) => boolean;
    onMoveItems: (request: MoveRequest) => Promise<string[]>;
  };

  let {
    left,
    right,
    loading,
    onSelect,
    onOpenFolder,
    onOpenBookmark,
    canMoveItems,
    onMoveItems
  }: Props = $props();

  let panels: HTMLDivElement;
  let activeSide = $state<Side>(0);
  let moving = $state(false);
  let leftShare = $state(0.5);
  let drag = $state<{ pointerId: number; offset: number } | null>(null);
  let pendingItemDrag: ItemDrag | undefined;
  let itemDrag = $state<ItemDrag>();
  let dropTarget = $state<DropTarget>();
  let dragPoint = $state({ x: 0, y: 0 });
  let scrollFrame: number | undefined;
  let suppressClick = false;
  const folderStates = [new SvelteMap<string, FolderState>(), new SvelteMap<string, FolderState>()];
  const emptyMarkedIds = new Set<string>();
  const lists: ({ focusSelected: (reveal?: boolean) => void; insertionAt: (y: number) => { afterId?: string; top: number } } | undefined)[] = [];
  const commands: CommandBarButton[] = $derived([
    moveButton('up', 'Переместить вверх'),
    moveButton('down', 'Переместить вниз'),
    moveButton('right', 'Переместить вправо'),
    moveButton('left', 'Переместить влево')
  ]);

  function markedIdsFor(pane: PaneView): Set<string> {
    return folderStates[pane.side].get(pane.folder?.id ?? '')?.markedIds ?? emptyMarkedIds;
  }

  function moveRequest(direction: MoveDirection): MoveRequest | undefined {
    const source = direction === 'right' ? left : direction === 'left' ? right : activeSide === 0 ? left : right;
    const destination = direction === 'right' ? right : direction === 'left' ? left : source;
    if (!source.folder || !destination.folder) return;
    const marked = source.items.filter((item) => markedIdsFor(source).has(item.id));
    const focused = source.items.find((item) => item.id === source.selectedId && item.type !== 'separator');
    return {
      sourceId: source.folder.id,
      destinationId: destination.folder.id,
      ids: marked.length ? marked.map((item) => item.id) : focused ? [focused.id] : [],
      direction: direction === 'up' || direction === 'down' ? direction : undefined,
      afterId: destination.selectedId
    };
  }

  function moveButton(direction: MoveDirection, title: string): CommandBarButton {
    const request = moveRequest(direction);
    return {
      title,
      disabled: loading || moving || !request || !canMoveItems(request),
      action: () => moveSelected(direction)
    };
  }

  async function moveSelected(direction: MoveDirection): Promise<void> {
    const request = moveRequest(direction);
    if (moving || loading || !request || !canMoveItems(request)) return;
    const sourceSide = direction === 'right' ? 0 : direction === 'left' ? 1 : activeSide;
    const destinationSide = direction === 'right' ? 1 : direction === 'left' ? 0 : sourceSide;
    await performMove(sourceSide, destinationSide, request);
  }

  async function performMove(sourceSide: Side, destinationSide: Side, request: MoveRequest, marked?: Set<string>): Promise<void> {
    if (moving || loading || !canMoveItems(request)) return;
    const sourcePane = sourceSide === 0 ? left : right;
    const markedToTransfer = marked ?? new Set(request.ids.filter((id) => markedIdsFor(sourcePane).has(id)));
    moving = true;
    try {
      const movedIds = (await onMoveItems(request)).filter((id) => markedToTransfer.has(id));
      // Wait for the final tree to reach the lists before restoring moved marks.
      await tick();
      if (!movedIds.length || sourceSide === destinationSide) return;
      const sourceState = folderStates[sourceSide].get(request.sourceId);
      if (sourceState && request.sourceId !== request.destinationId) {
        const markedIds = new Set(sourceState.markedIds);
        for (const id of movedIds) markedIds.delete(id);
        folderStates[sourceSide].set(request.sourceId, { ...sourceState, markedIds });
      }
      const destinationState = folderStates[destinationSide].get(request.destinationId);
      const markedIds = new Set(destinationState?.markedIds);
      for (const id of movedIds) markedIds.add(id);
      folderStates[destinationSide].set(request.destinationId, {
        markedIds,
        focusedId: destinationState?.focusedId ?? ''
      });
    } finally {
      moving = false;
    }
  }

  function cancelItemDrag(): void {
    const pointerId = itemDrag?.pointerId;
    pendingItemDrag = undefined;
    itemDrag = undefined;
    dropTarget = undefined;
    if (scrollFrame !== undefined) cancelAnimationFrame(scrollFrame);
    scrollFrame = undefined;
    if (pointerId !== undefined && panels.hasPointerCapture(pointerId)) panels.releasePointerCapture(pointerId);
  }

  $effect(() => {
    if (itemDrag && (loading || moving || (itemDrag.side === 0 ? left : right).folder?.id !== itemDrag.folderId)) cancelItemDrag();
  });

  function dragDestination(): { pane: PaneView; list: HTMLElement } | undefined {
    const hit = document.elementFromPoint(dragPoint.x, dragPoint.y);
    const side = paneSideFor(hit);
    const list = hit?.closest<HTMLElement>('[data-bookmark-list]');
    if (side === undefined || !list) return;
    return { pane: side === 0 ? left : right, list };
  }

  function updateDropTarget(): void {
    dropTarget = undefined;
    if (!itemDrag || loading || moving) return;
    const destination = dragDestination();
    if (!destination?.pane.folder) return;
    const position = lists[destination.pane.side]?.insertionAt(dragPoint.y);
    if (!position) return;
    const request: MoveRequest = {
      sourceId: itemDrag.folderId,
      destinationId: destination.pane.folder.id,
      ids: [...itemDrag.ids],
      afterId: position.afterId
    };
    if (canMoveItems(request)) dropTarget = { side: destination.pane.side, request, top: position.top };
  }

  function scrollWhileDragging(): void {
    scrollFrame = undefined;
    if (!itemDrag) return;
    const destination = dragDestination();
    if (destination) {
      const bounds = destination.list.getBoundingClientRect();
      const distance = dragPoint.y < bounds.top + 32 ? dragPoint.y - bounds.top - 32 :
        dragPoint.y > bounds.bottom - 32 ? dragPoint.y - bounds.bottom + 32 : 0;
      if (distance) destination.list.scrollTop += Math.max(-12, Math.min(12, distance / 3));
    }
    updateDropTarget();
    scrollFrame = requestAnimationFrame(scrollWhileDragging);
  }

  function beginItemDrag(event: PointerEvent): void {
    suppressClick = false;
    if (!event.isPrimary || event.button !== 0 || event.pointerType !== 'mouse' || loading || moving || drag) return;
    const side = paneSideFor(event.target);
    if (side === undefined || !(event.target instanceof Element) || event.target.closest('input')) return;
    const row = event.target.closest<HTMLElement>('[data-bookmark-row]');
    const source = side === 0 ? left : right;
    const item = source.items.find((item) => item.id === row?.dataset.bookmarkId);
    if (!source.folder || !item || item.type === 'separator') return;
    const markedIds = new Set(source.items.filter((item) => markedIdsFor(source).has(item.id)).map((item) => item.id));
    const ids = markedIds.size ? new Set(markedIds) : new Set([item.id]);
    if (!canMoveItems({ sourceId: source.folder.id, destinationId: source.folder.id, ids: [...ids] })) return;
    pendingItemDrag = { pointerId: event.pointerId, side, folderId: source.folder.id, ids, markedIds, startX: event.clientX, startY: event.clientY };
  }

  function moveItemDrag(event: PointerEvent): void {
    if (!pendingItemDrag || event.pointerId !== pendingItemDrag.pointerId) return;
    if (!itemDrag) {
      if (Math.hypot(event.clientX - pendingItemDrag.startX, event.clientY - pendingItemDrag.startY) < 6) return;
      itemDrag = pendingItemDrag;
      suppressClick = true;
      panels.setPointerCapture(event.pointerId);
      scrollFrame = requestAnimationFrame(scrollWhileDragging);
    }
    event.preventDefault();
    dragPoint = { x: event.clientX, y: event.clientY };
    updateDropTarget();
  }

  function finishItemDrag(event: PointerEvent): void {
    if (event.pointerId !== pendingItemDrag?.pointerId) return;
    if (itemDrag) {
      dragPoint = { x: event.clientX, y: event.clientY };
      updateDropTarget();
    }
    const source = itemDrag;
    const destination = dropTarget;
    cancelItemDrag();
    if (source && destination) void performMove(source.side, destination.side, destination.request, source.markedIds);
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

  function focusActivePane(reveal = true): void {
    lists[activeSide]?.focusSelected(reveal);
  }

  function startResize(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const divider = event.currentTarget as HTMLDivElement;
    drag = { pointerId: event.pointerId, offset: event.clientX - divider.getBoundingClientRect().left };
    divider.setPointerCapture(event.pointerId);
    focusActivePane(false);
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

    function onDragKeydown(event: KeyboardEvent): void {
      if (!itemDrag) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') cancelItemDrag();
    }

    function onDragClick(event: MouseEvent): void {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }

    function onNativeDrag(event: DragEvent): void {
      if (event.target instanceof Node && panels.contains(event.target)) event.preventDefault();
    }

    function onDragCancel(event: PointerEvent): void {
      if (event.pointerId === pendingItemDrag?.pointerId) cancelItemDrag();
    }

    function onDocumentFocus(event: FocusEvent): void {
      const side = paneSideFor(event.target);
      if (side !== undefined) activeSide = side;
      else focusActivePane();
    }

    async function restoreFocus(): Promise<void> {
      await tick();
      // Browser tabs and native permission dialogs keep their own focus.
      if (mounted && document.hasFocus() && paneSideFor(document.activeElement) === undefined) focusActivePane();
    }

    function onDocumentMousedown(event: MouseEvent): void {
      if (event.button !== 0) return;
      const side = paneSideFor(event.target);
      if (side !== undefined) activeSide = side;
      // Preserve focus without cancelling the subsequent button click.
      event.preventDefault();
      if (side !== undefined && event.target instanceof Element && !event.target.closest('input[type="checkbox"]')) {
        const row = event.target.closest('[data-bookmark-row]');
        const button = row?.querySelector<HTMLButtonElement>('button[aria-pressed]');
        if (button) {
          button.focus({ preventScroll: true });
          return;
        }
      }
      focusActivePane(false);
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
    document.addEventListener('pointerdown', beginItemDrag);
    document.addEventListener('pointermove', moveItemDrag);
    document.addEventListener('pointerup', finishItemDrag);
    document.addEventListener('pointercancel', onDragCancel);
    document.addEventListener('lostpointercapture', onDragCancel);
    document.addEventListener('keydown', onDragKeydown, true);
    document.addEventListener('click', onDragClick, true);
    document.addEventListener('dragstart', onNativeDrag);
    window.addEventListener('blur', cancelItemDrag);
    window.addEventListener('focus', restoreFocus);
    focusActivePane();
    return () => {
      mounted = false;
      document.removeEventListener('focusin', onDocumentFocus);
      document.removeEventListener('focusout', restoreFocus);
      document.removeEventListener('mousedown', onDocumentMousedown);
      document.removeEventListener('keydown', onDocumentKeydown);
      document.removeEventListener('pointerdown', beginItemDrag);
      document.removeEventListener('pointermove', moveItemDrag);
      document.removeEventListener('pointerup', finishItemDrag);
      document.removeEventListener('pointercancel', onDragCancel);
      document.removeEventListener('lostpointercapture', onDragCancel);
      document.removeEventListener('keydown', onDragKeydown, true);
      document.removeEventListener('click', onDragClick, true);
      document.removeEventListener('dragstart', onNativeDrag);
      window.removeEventListener('blur', cancelItemDrag);
      cancelItemDrag();
      window.removeEventListener('focus', restoreFocus);
    };
  });

</script>

<div
  bind:this={panels}
  class="panels-layout grid min-h-0 flex-1"
  class:resizing={drag !== null}
  class:dragging-items={itemDrag !== undefined}
  class:invalid-drop={itemDrag !== undefined && dropTarget === undefined}
  style:--left-width={`${leftShare}fr`}
  style:--right-width={`${1 - leftShare}fr`}
>
  {#each [left, right] as pane (pane.side)}
    <section
      class="flex min-h-[360px] min-w-0 max-h-[calc(100vh-180px)] flex-col overflow-hidden rounded-xl border border-[#dce2ed] bg-white max-[700px]:min-h-[260px] max-[700px]:max-h-[45vh]"
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
        dropMarkerTop={dropTarget?.side === pane.side ? dropTarget.top : undefined}
        draggedIds={itemDrag?.side === pane.side ? itemDrag.ids : undefined}
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

{#if itemDrag}
  <div data-drag-preview aria-hidden="true" class="pointer-events-none fixed z-50 rounded-md border border-[#5f44b4] bg-white px-3 py-2 text-sm text-[#34405a] shadow-md" style:left={`${dragPoint.x + 14}px`} style:top={`${dragPoint.y + 14}px`}>
    Перемещение: {itemDrag.ids.size}
  </div>
{/if}

<CommandBar buttons={commands} />

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

  .dragging-items, .dragging-items :global(*) {
    cursor: grabbing;
    user-select: none;
  }

  .invalid-drop, .invalid-drop :global(*) {
    cursor: not-allowed;
  }

  @media (max-width: 700px) {
    .panels-layout {
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
  }
</style>
