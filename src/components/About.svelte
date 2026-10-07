<script lang="ts">
  import { t } from '../i18n';
  import { onMount, tick } from 'svelte';

  let { onClose }: { onClose: () => void } = $props();
  let popup: HTMLDivElement;

  onMount(() => popup.focus({ preventScroll: true }));

  async function onFocusout(event: FocusEvent): Promise<void> {
    if (event.relatedTarget instanceof Node && popup.contains(event.relatedTarget)) return;
    await tick();
    if (popup.isConnected && !popup.contains(document.activeElement)) onClose();
  }
</script>

<svelte:window onblur={onClose} />

<div
  bind:this={popup}
  id="about-app"
  data-about-app
  role="dialog"
  aria-modal="false"
  aria-labelledby="about-app-title"
  tabindex="-1"
  onfocusout={onFocusout}
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }}
  class="absolute right-0 bottom-full z-40 mb-2 w-[480px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-[#d5dbea] bg-white text-[#34405a] shadow-xl focus:outline-none"
>
  <header class="flex items-center justify-between gap-4 border-b border-[#e6eaf1] px-5 py-3">
    <h2 id="about-app-title" class="text-lg font-semibold">{$t('about')}</h2>
    <button type="button" aria-label={$t('closeAbout')} onclick={onClose} class="size-8 cursor-pointer rounded-md text-xl hover:bg-[#f5f2fd] focus-visible:outline-2 focus-visible:outline-[#5f44b4]">×</button>
  </header>
  <dl class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-3 px-5 py-4">
    <dt class="text-[#69748b]">{$t('author')}</dt>
    <dd>Sergei Galushkin</dd>
    <dt class="text-[#69748b]">GitHub</dt>
    <dd class="min-w-0"><a href="https://github.com/cs0ip/total-bookmarks" target="_blank" rel="noopener noreferrer" class="break-all text-[#5f44b4] underline underline-offset-2 hover:text-[#513a9a] focus-visible:outline-2 focus-visible:outline-[#5f44b4]">https://github.com/cs0ip/total-bookmarks</a></dd>
  </dl>
</div>
