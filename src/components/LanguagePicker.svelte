<script lang="ts">
  import { tick } from 'svelte';
  import { languages, locale, setLocale, t, type Locale } from '../i18n';

  let { onOpenChange }: { onOpenChange: (open: boolean) => void } = $props();
  let root: HTMLDivElement;
  let open = $state(false);

  async function toggle(): Promise<void> {
    if (open) { close(); return; }
    open = true;
    onOpenChange(true);
    await tick();
    root.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
  }

  function close(): void {
    if (!open) return;
    open = false;
    onOpenChange(false);
  }

  function choose(language: Locale): void {
    void setLocale(language);
    close();
  }

  async function onFocusout(event: FocusEvent): Promise<void> {
    // Native mouse focus can yield before document.activeElement points to the next option.
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return;
    await tick();
    if (root.isConnected && !root.contains(document.activeElement)) close();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
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
    buttons[next]?.focus();
  }
</script>

<svelte:window onblur={close} />
<svelte:document onpointerdown={(event) => { if (event.target instanceof Node && !root.contains(event.target)) close(); }} />

<div bind:this={root} data-language-picker class="relative shrink-0" onfocusout={onFocusout} role="group" aria-label={$t('language')}>
  <button
    data-language-button
    type="button"
    aria-label={$t('chooseLanguage')}
    aria-haspopup="menu"
    aria-controls="language-menu"
    aria-expanded={open}
    onclick={toggle}
    class="flex size-10 cursor-pointer items-center justify-center rounded-lg border border-[#d5dbea] bg-white text-[#34405a] hover:bg-[#f5f2fd] focus-visible:outline-2 focus-visible:outline-[#5f44b4]"
  >
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" class="size-6">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M5 6.5h14M5 17.5h14" />
    </svg>
  </button>
  {#if open}
    <div id="language-menu" role="menu" tabindex="-1" onkeydown={onKeydown} aria-label={$t('language')} class="absolute top-full right-0 z-50 mt-2 max-h-[70vh] w-44 overflow-y-auto rounded-lg border border-[#d5dbea] bg-white p-1 text-[#34405a] shadow-lg">
      {#each languages as language}
        <button
          type="button"
          role="menuitemradio"
          aria-checked={$locale === language.locale}
          lang={language.locale === 'zh' ? 'zh-Hans' : language.locale}
          data-locale={language.locale}
          tabindex="-1"
          onclick={() => choose(language.locale)}
          class="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left hover:bg-[#f5f2fd] focus:bg-[#ebe6fb] focus:outline-none"
        >{language.name}<span aria-hidden="true">{$locale === language.locale ? '✓' : ''}</span></button>
      {/each}
    </div>
  {/if}
</div>
