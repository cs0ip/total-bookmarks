<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { CommandBarButton } from './CommandBar.svelte';

  let { id, label, anchor, items, onChoose, onClose }: {
    id: string;
    label: string;
    anchor: HTMLButtonElement | null;
    items: readonly CommandBarButton[];
    onChoose: (item: CommandBarButton) => void;
    onClose: () => void;
  } = $props();
  let menu: HTMLDivElement;
  let left = $state(0);
  let top = $state(0);
  let ready = $state(false);

  function position(): void {
    if (!anchor?.isConnected) { onClose(); return; }
    const bounds = anchor.getBoundingClientRect();
    left = Math.max(8, Math.min(bounds.left, window.innerWidth - menu.offsetWidth - 8));
    const below = bounds.bottom + 4;
    top = Math.max(8, below + menu.offsetHeight <= window.innerHeight - 8 ? below : bounds.top - menu.offsetHeight - 4);
    ready = true;
  }

  onMount(() => {
    position();
    void tick().then(() => {
      if (menu.isConnected) (menu.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? menu).focus({ preventScroll: true });
    });
    window.addEventListener('resize', position);
    document.addEventListener('scroll', position, true);
    return () => {
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    };
  });

  async function onFocusout(event: FocusEvent): Promise<void> {
    if (event.relatedTarget instanceof Node && menu.contains(event.relatedTarget)) return;
    await tick();
    if (menu.isConnected && !menu.contains(document.activeElement)) onClose();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown': next = (index + 1) % buttons.length; break;
      case 'ArrowUp': next = (index - 1 + buttons.length) % buttons.length; break;
      case 'Home': next = 0; break;
      case 'End': next = buttons.length - 1; break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    buttons[next]?.focus({ preventScroll: true });
  }
</script>

<svelte:window onblur={onClose} />

<div
  bind:this={menu}
  {id}
  role="menu"
  aria-label={label}
  tabindex="-1"
  onfocusout={onFocusout}
  onkeydown={onKeydown}
  class="fixed z-50 max-h-[70vh] w-48 max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-[#d5dbea] bg-white p-1 text-[#34405a] shadow-lg"
  style:left={`${left}px`}
  style:top={`${top}px`}
  style:visibility={ready ? 'visible' : 'hidden'}
>
  {#each items as item}
    <button
      type="button"
      role="menuitem"
      tabindex="-1"
      aria-label={item.title}
      disabled={item.disabled}
      onclick={() => onChoose(item)}
      class="block w-full cursor-pointer rounded-md px-3 py-2 text-left hover:bg-[#f5f2fd] focus:bg-[#ebe6fb] focus:outline-none disabled:cursor-not-allowed disabled:opacity-45"
    >{item.title}</button>
  {/each}
</div>
