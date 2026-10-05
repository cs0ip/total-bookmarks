<script lang="ts">
  let { bookmark }: { bookmark: browser.bookmarks.BookmarkTreeNode } = $props();
</script>

<span class="flex min-w-0 flex-1 items-center gap-[10px]">
  <span class="flex size-[22px] shrink-0 items-center justify-center">
    <img
      class="size-5 object-contain"
      src={`page-icon:${bookmark.url}`}
      alt=""
      loading="lazy"
    />
  </span>
  <span class="flex min-w-0 flex-1 flex-col">
    <span class="truncate font-semibold">{bookmark.title || 'Без названия'}</span>
    <span class="truncate text-left text-xs text-[#738098]" dir="ltr" title={bookmark.url}>{bookmark.url}</span>
  </span>
</span>
