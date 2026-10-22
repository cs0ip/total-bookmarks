<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { t } from '../i18n';
  import { settings, setSetting } from '../settings';
  import type { SortOptions } from '../bookmarks/requests';

  let { folderTitle, onSubmit, onClose }: {
    folderTitle: string;
    onSubmit: (options: SortOptions) => Promise<boolean>;
    onClose: () => void;
  } = $props();
  let dialog: HTMLDialogElement;
  let by = $state<SortOptions['by']>('name');
  let onlySelected = $state(false);
  let groupSelected = $state(false);
  let submitting = $state(false);
  let failed = $state(false);

  onMount(() => {
    dialog.showModal();
    dialog.querySelector<HTMLInputElement>('input[name="sort-by"]:checked')?.focus();
    return () => dialog.close();
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    submitting = true;
    failed = false;
    try {
      if (await onSubmit({ by, ignoreCase: $settings.sortIgnoreCase, reverse: $settings.sortReverse, separateFolders: $settings.sortSeparateFolders, foldersFirst: $settings.sortFoldersFirst, onlySelected, groupSelected })) dialog.close();
      else failed = true;
    } finally {
      submitting = false;
      await tick();
      if (dialog.open) dialog.querySelector<HTMLButtonElement>('button[type="submit"]')?.focus();
    }
  }
</script>

<dialog
  bind:this={dialog}
  data-sort-dialog
  aria-labelledby="sort-dialog-title"
  aria-describedby="sort-folder-title"
  onclose={onClose}
  oncancel={(event) => { if (submitting) event.preventDefault(); }}
  class="m-auto w-[440px] max-w-[calc(100vw-32px)] rounded-xl border border-[#d5dbea] bg-white p-6 text-[#34405a] shadow-xl"
>
  <form onsubmit={submit} class="flex flex-col gap-4">
    <div>
      <h2 id="sort-dialog-title" class="text-lg font-semibold">{$t('sort')}</h2>
      <p id="sort-folder-title" class="mt-1 truncate text-sm text-[#738098]" title={folderTitle}>{folderTitle}</p>
    </div>
    <fieldset disabled={submitting} class="flex flex-col gap-2 text-sm">
      <legend class="mb-2 font-semibold">{$t('sortBy')}</legend>
      <label class="flex cursor-pointer items-center gap-2">
        <input type="radio" name="sort-by" value="name" bind:group={by} class="accent-[#5f44b4]" />{$t('sortByName')}
      </label>
      {#if by === 'name'}
        <label class="ml-6 flex cursor-pointer items-center gap-2">
          <input type="checkbox" name="ignore-case" checked={$settings.sortIgnoreCase} onchange={(event) => { void setSetting('sortIgnoreCase', event.currentTarget.checked); }} class="accent-[#5f44b4]" />{$t('sortIgnoreCase')}
        </label>
      {/if}
      <label class="flex cursor-pointer items-center gap-2">
        <input type="radio" name="sort-by" value="date" bind:group={by} class="accent-[#5f44b4]" />{$t('sortByDate')}
      </label>
      <label class="flex cursor-pointer items-center gap-2">
        <input type="radio" name="sort-by" value="url" bind:group={by} class="accent-[#5f44b4]" />{$t('sortByUrl')}
      </label>
      <label class="flex cursor-pointer items-center gap-2">
        <input type="radio" name="sort-by" value="domain" bind:group={by} class="accent-[#5f44b4]" />{$t('sortByDomain')}
      </label>
    </fieldset>
    <fieldset disabled={submitting} class="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      <legend class="mb-2 font-semibold">{$t('sortOrder')}</legend>
      <label class="flex cursor-pointer items-center gap-2">
        <input type="radio" name="sort-order" value="forward" checked={!$settings.sortReverse} onchange={() => { void setSetting('sortReverse', false); }} class="accent-[#5f44b4]" />{$t('sortForward')}
      </label>
      <label class="flex cursor-pointer items-center gap-2">
        <input type="radio" name="sort-order" value="reverse" checked={$settings.sortReverse} onchange={() => { void setSetting('sortReverse', true); }} class="accent-[#5f44b4]" />{$t('sortReverse')}
      </label>
    </fieldset>
    <div class="flex flex-col gap-2 text-sm">
      <label class="flex cursor-pointer items-center gap-2">
        <input type="checkbox" name="only-selected" bind:checked={onlySelected} disabled={submitting} class="accent-[#5f44b4]" />{$t('sortOnlySelected')}
      </label>
      {#if onlySelected}
        <label class="ml-6 flex cursor-pointer items-center gap-2">
          <input type="checkbox" name="group-selected" bind:checked={groupSelected} disabled={submitting} class="accent-[#5f44b4]" />{$t('sortGroupSelected')}
        </label>
      {/if}
    </div>
    <fieldset disabled={submitting} class="flex flex-col gap-2 border-t border-[#e6eaf1] pt-4 text-sm">
      <label class="flex cursor-pointer items-center gap-2">
        <input type="checkbox" name="separate-folders" checked={$settings.sortSeparateFolders} onchange={(event) => { void setSetting('sortSeparateFolders', event.currentTarget.checked); }} class="accent-[#5f44b4]" />{$t('sortSeparateFolders')}
      </label>
      {#if $settings.sortSeparateFolders}
        <div class="ml-6 flex gap-4">
          <label class="flex cursor-pointer items-center gap-2">
            <input type="radio" name="folder-position" value="first" checked={$settings.sortFoldersFirst} onchange={() => { void setSetting('sortFoldersFirst', true); }} class="accent-[#5f44b4]" />{$t('sortFoldersTop')}
          </label>
          <label class="flex cursor-pointer items-center gap-2">
            <input type="radio" name="folder-position" value="last" checked={!$settings.sortFoldersFirst} onchange={() => { void setSetting('sortFoldersFirst', false); }} class="accent-[#5f44b4]" />{$t('sortFoldersBottom')}
          </label>
        </div>
      {/if}
    </fieldset>
    {#if failed}<p role="alert" class="text-sm text-[#a02c2c]">{$t('sortRetry')}</p>{/if}
    <div class="mt-1 flex justify-end gap-2">
      <button type="button" disabled={submitting} onclick={() => dialog.close()} class="cursor-pointer rounded-md border border-[#d5dbea] px-4 py-2 hover:bg-[#f5f6fb] disabled:cursor-not-allowed disabled:opacity-45">{$t('cancel')}</button>
      <button type="submit" disabled={submitting} class="cursor-pointer rounded-md bg-[#5f44b4] px-4 py-2 text-white hover:bg-[#513a9a] disabled:cursor-not-allowed disabled:opacity-45">{submitting ? $t('sorting') : $t('sortApply')}</button>
    </div>
  </form>
</dialog>

<style>
  dialog::backdrop { background: rgb(30 41 59 / 35%); }
</style>
