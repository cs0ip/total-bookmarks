<script lang="ts">
  import type { BookmarkNode } from '../platform/bookmarks';
  import { t } from '../i18n';
  import Favicons from './Favicons.svelte';
  type Props = {
    bookmark: BookmarkNode;
    checked: boolean;
    focused: boolean;
    onCheckedChange: (checked: boolean) => void;
    onSelect: () => void;
    onOpen: () => void;
    onFocus: (target: HTMLButtonElement) => void;
    onKeydown: (event: KeyboardEvent) => void;
  };
  let { bookmark, checked, focused, onCheckedChange, onSelect, onOpen, onFocus, onKeydown }: Props = $props();
  const folder = $derived(bookmark.type === 'folder' || !bookmark.url);
</script>

<input
  class="ml-[9px] size-4 shrink-0 cursor-pointer accent-[#5f44b4]"
  type="checkbox"
  tabindex="-1"
  {checked}
  aria-label={`${folder ? $t('selectFolder') : $t('selectBookmark')}: ${bookmark.title || $t('untitled')}`}
  onchange={(event) => onCheckedChange(event.currentTarget.checked)}
/>
<button
  class="flex min-w-0 flex-1 cursor-pointer items-center gap-[10px] border-0 bg-transparent p-[9px] text-left text-inherit focus:outline-none"
  type="button"
  aria-pressed={focused}
  onclick={onSelect}
  ondblclick={onOpen}
  onfocus={(event) => onFocus(event.currentTarget)}
  onkeydown={onKeydown}
>
  <span class="flex min-w-0 flex-1 items-center gap-[10px]">
    <Favicons url={bookmark.url} {folder} />
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate font-semibold">{bookmark.title || $t('untitled')}</span>
      {#if folder}
        <span class="text-xs text-[#738098]">{$t('folder')}</span>
      {:else}
        <span class="truncate text-left text-xs text-[#738098]" dir="ltr" title={bookmark.url}>{bookmark.url}</span>
      {/if}
    </span>
  </span>
</button>
