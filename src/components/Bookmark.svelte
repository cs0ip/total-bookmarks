<script lang="ts">
  let { bookmark }: { bookmark: browser.bookmarks.BookmarkTreeNode } = $props();
</script>

<span class="bookmark-details">
  <span class="bookmark-title">{bookmark.title || 'Без названия'}</span>
  <span class="bookmark-url" dir="ltr" title={bookmark.url}>{bookmark.url}</span>
</span>

<style>
  .bookmark-details {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .bookmark-title,
  .bookmark-url {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bookmark-title {
    font-weight: 600;
  }

  .bookmark-url {
    color: #738098;
    font-size: 12px;
    text-align: left;
  }
</style>
