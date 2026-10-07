<script lang="ts">
  import { t } from '../i18n';
  import { onMount, tick } from 'svelte';

  type Props = {
    kind: 'bookmark' | 'folder';
    onCreate: (fields: { title: string; url?: string }) => Promise<boolean>;
    onClose: () => void;
  };
  let { kind, onCreate, onClose }: Props = $props();
  let dialog: HTMLDialogElement;
  let titleInput: HTMLInputElement;
  let title = $state('');
  let url = $state('');
  let submitting = $state(false);
  let failed = $state(false);

  onMount(() => {
    dialog.showModal();
    titleInput.focus();
    return () => dialog.close();
  });

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
      if (await onCreate({ title: title.trim(), ...(kind === 'bookmark' ? { url: url.trim() } : {}) })) dialog.close();
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
  data-bookmark-create-dialog
  aria-labelledby="create-bookmark-title"
  onclose={onClose}
  oncancel={(event) => { if (submitting) event.preventDefault(); }}
  class="m-auto w-[440px] max-w-[calc(100vw-32px)] rounded-xl border border-[#d5dbea] bg-white p-6 text-[#34405a] shadow-xl"
>
  <form onsubmit={submit} class="flex flex-col gap-4">
    <h2 id="create-bookmark-title" class="text-lg font-semibold">{kind === 'bookmark' ? $t('createBookmark') : $t('createFolder')}</h2>
    <label class="flex flex-col gap-1 text-sm">
      {$t('name')}
      <input bind:this={titleInput} bind:value={title} oninput={() => titleInput.setCustomValidity('')} name="title" required disabled={submitting} class="rounded-md border border-[#b8c1d1] px-3 py-2 text-base focus:outline-2 focus:outline-[#5f44b4]" />
    </label>
    {#if kind === 'bookmark'}
      <label class="flex flex-col gap-1 text-sm">
        {$t('address')}
        <input bind:value={url} name="url" type="url" required disabled={submitting} placeholder="https://example.com" class="rounded-md border border-[#b8c1d1] px-3 py-2 text-base focus:outline-2 focus:outline-[#5f44b4]" />
      </label>
    {/if}
    {#if failed}<p role="alert" class="text-sm text-[#a02c2c]">{$t('createRetry')}</p>{/if}
    <div class="mt-1 flex justify-end gap-2">
      <button type="button" disabled={submitting} onclick={() => dialog.close()} class="cursor-pointer rounded-md border border-[#d5dbea] px-4 py-2 hover:bg-[#f5f6fb] disabled:cursor-not-allowed disabled:opacity-45">{$t('cancel')}</button>
      <button type="submit" disabled={submitting} class="cursor-pointer rounded-md bg-[#5f44b4] px-4 py-2 text-white hover:bg-[#513a9a] disabled:cursor-not-allowed disabled:opacity-45">{submitting ? $t('creating') : $t('create')}</button>
    </div>
  </form>
</dialog>

<style>
  dialog::backdrop { background: rgb(30 41 59 / 35%); }
</style>
