<script lang="ts">
  import { defaultIcons, watchSiteIcon } from '@platform/icons';

  let { url, folder = false }: { url?: string; folder?: boolean } = $props();
  let icon = $state<string | null>(null);
  let failed = $state(false);
  const source = $derived(icon ?? (folder ? defaultIcons.folder : defaultIcons.missing));

  $effect(() => {
    icon = null;
    failed = false;
    if (folder || !url) return;
    return watchSiteIcon(url, (value) => { icon = value; failed = false; });
  });
</script>

<span class="flex size-[22px] shrink-0 items-center justify-center text-[#738098]" aria-hidden="true">
  {#if !failed}
    <img class="size-5 object-contain" src={source} alt="" onerror={() => {
      if (icon) icon = null;
      else failed = true;
    }} />
  {/if}
</span>

<style>
  img {
    -moz-context-properties: fill, fill-opacity;
    fill: currentColor;
  }
</style>
