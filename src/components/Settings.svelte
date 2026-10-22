<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../i18n';
  import { settings, setSetting } from '../settings';

  let { onOpenChange }: { onOpenChange: (open: boolean) => void } = $props();
  let root: HTMLDivElement;
  let open = $state(false);

  function close(): void {
    if (!open) return;
    open = false;
    onOpenChange(false);
  }

  async function toggle(): Promise<void> {
    if (open) { close(); return; }
    open = true;
    onOpenChange(true);
    await tick();
    root.querySelector<HTMLInputElement>('[role="switch"]')?.focus();
  }

  async function onFocusout(event: FocusEvent): Promise<void> {
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
    await tick();
    if (root.isConnected && !root.contains(document.activeElement)) close();
  }
</script>

<svelte:window onblur={close} />
<svelte:document onpointerdown={(event) => { if (event.target instanceof Node && !root.contains(event.target)) close(); }} />

<div bind:this={root} data-settings class="relative shrink-0" onfocusout={onFocusout} role="group" aria-label={$t('settings')}>
  <button data-settings-button type="button" aria-label={$t('settings')} aria-haspopup="dialog" aria-controls="settings-popup" aria-expanded={open} onclick={toggle} class="flex size-10 cursor-pointer items-center justify-center rounded-lg border border-[#d5dbea] bg-white text-[#34405a] hover:bg-[#f5f2fd] focus-visible:outline-2 focus-visible:outline-[#5f44b4]">
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="size-6">
      <path d="m9 3-.6 2.3-1.7 1L4.4 6 2 10l1.7 1.7v2L2 15.4l2.4 4 2.3-.6 1.7 1L9 22h5l.6-2.2 1.7-1 2.3.6 2.4-4-1.7-1.7v-2L21 10l-2.4-4-2.3.3-1.7-1L14 3Z" />
      <circle cx="11.5" cy="12.5" r="3.5" />
    </svg>
  </button>
  {#if open}
    <div id="settings-popup" role="dialog" aria-label={$t('settings')} tabindex="-1" onkeydown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } }} class="absolute top-full right-0 z-50 mt-2 flex w-max max-w-[calc(100vw-32px)] flex-col gap-3 rounded-lg border border-[#d5dbea] bg-white p-4 text-[#34405a] shadow-lg">
      <label class="flex cursor-pointer items-center gap-3">
        <input type="checkbox" role="switch" data-escape-addresses checked={$settings.escapeAddresses} onchange={(event) => { void setSetting('escapeAddresses', event.currentTarget.checked); }} class="size-4 cursor-pointer accent-[#5f44b4]" />
        {$t('escapeAddresses')}
      </label>
      <label class="flex cursor-pointer items-center gap-3">
        <input type="checkbox" role="switch" data-hide-folder-drop-targets checked={$settings.hideFolderDropTargets} onchange={(event) => { void setSetting('hideFolderDropTargets', event.currentTarget.checked); }} class="size-4 shrink-0 cursor-pointer accent-[#5f44b4]" />
        {$t('hideFolderDropTargets')}
      </label>
    </div>
  {/if}
</div>
