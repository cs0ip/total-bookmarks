<script lang="ts">
  import Favicons from './Favicons.svelte';
  let { bookmark }: { bookmark: browser.bookmarks.BookmarkTreeNode } = $props();
</script>

<span class="flex min-w-0 flex-1 items-center gap-[10px]">
  <Favicons url={bookmark.url} />
  <span class="flex min-w-0 flex-1 flex-col">
    <span class="truncate font-semibold">{bookmark.title || 'Без названия'}</span>
    <span class="truncate text-left text-xs text-[#738098]" dir="ltr" title={bookmark.url}>{bookmark.url}</span>
  </span>
</span>
