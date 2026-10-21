<script lang="ts">
  import { t } from '../i18n';
  import { onMount, tick, untrack } from 'svelte';
  import { editUrl, escapedUrl, readableUrl, encodedUrlSelection } from '../bookmarks/url';
  import { settings, setSetting } from '../settings';

  type Props = {
    mode: 'create' | 'edit';
    kind: 'bookmark' | 'folder';
    initialTitle?: string;
    initialUrl?: string;
    onSubmit: (fields: { title: string; url?: string }) => Promise<boolean>;
    onClose: () => void;
  };
  let { mode, kind, initialTitle = '', initialUrl = '', onSubmit, onClose }: Props = $props();
  let dialog: HTMLDialogElement;
  let titleInput: HTMLInputElement;
  let title = $state(untrack(() => initialTitle));
  let urlInput = $state<HTMLTextAreaElement>();
  let encodedUrl = $state(untrack(() => escapedUrl(initialUrl)));
  let url = $derived($settings.escapeAddressInDialog ? encodedUrl : readableUrl(encodedUrl, true));
  let submitting = $state(false);
  let failed = $state(false);

  onMount(() => {
    dialog.showModal();
    titleInput.focus();
    return () => dialog.close();
  });

  function validateUrl(): void {
    if (!urlInput) return;
    let valid = true;
    try { new URL(encodedUrl); } catch { valid = !encodedUrl; }
    urlInput.setCustomValidity(valid ? '' : $t('invalidAddress'));
  }

  function updateUrl(event: Event): void {
    encodedUrl = editUrl(encodedUrl, (event.currentTarget as HTMLTextAreaElement).value, $settings.escapeAddressInDialog, true);
    validateUrl();
  }

  function copyUrl(event: ClipboardEvent): void {
    if (!event.clipboardData || !urlInput || urlInput.selectionStart === urlInput.selectionEnd) return;
    event.clipboardData.setData('text/plain', encodedUrlSelection(encodedUrl, urlInput.selectionStart, urlInput.selectionEnd, $settings.escapeAddressInDialog, true));
    event.preventDefault();
  }

  async function pasteUrl(event: ClipboardEvent): Promise<void> {
    if (!event.clipboardData || !urlInput) return;
    event.preventDefault();
    const start = urlInput.selectionStart;
    const end = urlInput.selectionEnd;
    const pasted = escapedUrl(event.clipboardData.getData('text/plain'));
    encodedUrl = encodedUrlSelection(encodedUrl, 0, start, $settings.escapeAddressInDialog, true) + pasted
      + encodedUrlSelection(encodedUrl, end, url.length, $settings.escapeAddressInDialog, true);
    validateUrl();
    await tick();
    const position = start + ($settings.escapeAddressInDialog ? pasted : readableUrl(pasted, true)).length;
    urlInput.setSelectionRange(position, position);
  }

  async function cutUrl(event: ClipboardEvent): Promise<void> {
    copyUrl(event);
    if (!event.defaultPrevented || !urlInput) return;
    const start = urlInput.selectionStart;
    encodedUrl = encodedUrlSelection(encodedUrl, 0, start, $settings.escapeAddressInDialog, true)
      + encodedUrlSelection(encodedUrl, urlInput.selectionEnd, url.length, $settings.escapeAddressInDialog, true);
    validateUrl();
    await tick();
    urlInput.setSelectionRange(start, start);
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    if (!title.trim()) {
      titleInput.setCustomValidity($t('enterTitle'));
      titleInput.reportValidity();
      return;
    }
    submitting = true;
    failed = false;
    try {
      if (await onSubmit({ title: title.trim(), ...(kind === 'bookmark' ? { url: encodedUrl } : {}) })) dialog.close();
      else failed = true;
    } finally {
      submitting = false;
      await tick();
      if (dialog.open) titleInput.focus();
    }
  }
</script>

<dialog
  bind:this={dialog}
  data-bookmark-create-dialog={mode === 'create' ? '' : undefined}
  data-bookmark-edit-dialog={mode === 'edit' ? '' : undefined}
  aria-labelledby="bookmark-properties-title"
  onclose={onClose}
  oncancel={(event) => { if (submitting) event.preventDefault(); }}
  class="m-auto w-[440px] max-w-[calc(100vw-32px)] rounded-xl border border-[#d5dbea] bg-white p-6 text-[#34405a] shadow-xl"
>
  <form onsubmit={submit} class="flex flex-col gap-4">
    <h2 id="bookmark-properties-title" class="text-lg font-semibold">{mode === 'edit' ? (kind === 'bookmark' ? $t('editBookmark') : $t('editFolder')) : (kind === 'bookmark' ? $t('createBookmark') : $t('createFolder'))}</h2>
    <label class="flex flex-col gap-1 text-sm">
      {$t('name')}
      <input bind:this={titleInput} bind:value={title} oninput={() => titleInput.setCustomValidity('')} name="title" required disabled={submitting} class="rounded-md border border-[#b8c1d1] px-3 py-2 text-base focus:outline-2 focus:outline-[#5f44b4]" />
    </label>
    {#if kind === 'bookmark'}
      <div class="flex flex-col gap-1 text-sm">
        <div class="flex items-center justify-between gap-3">
          <label for="bookmark-url">{$t('address')}</label>
          <label class="flex cursor-pointer items-center gap-2">
            <input type="checkbox" role="switch" data-escape-address checked={$settings.escapeAddressInDialog} disabled={submitting} onchange={(event) => { void setSetting('escapeAddressInDialog', event.currentTarget.checked); }} class="size-4 cursor-pointer accent-[#5f44b4]" />
            {$t('escapeAddress')}
          </label>
        </div>
        <textarea bind:this={urlInput} value={url} oninput={updateUrl} oncopy={copyUrl} oncut={cutUrl} onpaste={pasteUrl} onkeydown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); if (!event.repeat) event.currentTarget.form?.requestSubmit(); } }} id="bookmark-url" name="url" rows="1" wrap="off" required disabled={submitting} placeholder="https://example.com" spellcheck="false" dir="ltr" class="resize-none overflow-x-auto rounded-md border border-[#b8c1d1] px-3 py-2 text-base focus:outline-2 focus:outline-[#5f44b4]"></textarea>
      </div>
    {/if}
    {#if failed}<p role="alert" class="text-sm text-[#a02c2c]">{mode === 'edit' ? $t('editRetry') : $t('createRetry')}</p>{/if}
    <div class="mt-1 flex justify-end gap-2">
      <button type="button" disabled={submitting} onclick={() => dialog.close()} class="cursor-pointer rounded-md border border-[#d5dbea] px-4 py-2 hover:bg-[#f5f6fb] disabled:cursor-not-allowed disabled:opacity-45">{$t('cancel')}</button>
      <button type="submit" disabled={submitting} class="cursor-pointer rounded-md bg-[#5f44b4] px-4 py-2 text-white hover:bg-[#513a9a] disabled:cursor-not-allowed disabled:opacity-45">{mode === 'edit' ? (submitting ? $t('saving') : $t('save')) : (submitting ? $t('creating') : $t('create'))}</button>
    </div>
  </form>
</dialog>

<style>
  dialog::backdrop { background: rgb(30 41 59 / 35%); }
</style>
