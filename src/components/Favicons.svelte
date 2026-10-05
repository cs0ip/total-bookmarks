<script lang="ts">
  import { defaultIcons, ICON_REQUEST, ICON_UPDATED, siteOrigin, type IconUpdate } from '../icons/protocol';

  let { url, folder = false }: { url?: string; folder?: boolean } = $props();
  let icon = $state<string | null>(null);
  let failed = $state(false);
  const source = $derived(icon ?? (folder ? defaultIcons.folder : defaultIcons.missing));

  $effect(() => {
    const origin = siteOrigin(url);
    icon = null;
    failed = false;
    if (folder || !origin) return;
    let active = true;
    let receivedUpdate = false;
    function onUpdate(message: IconUpdate) {
      if (message?.type === ICON_UPDATED && message.origin === origin) {
        receivedUpdate = true;
        icon = message.icon;
        failed = false;
      }
    }
    browser.runtime.onMessage.addListener(onUpdate);
    void browser.runtime.sendMessage({ type: ICON_REQUEST, url }).then((cached: string | null) => {
      if (active && !receivedUpdate) { icon = cached; failed = false; }
    }).catch((cause) => console.error('Failed to get the favicon', cause));
    return () => {
      active = false;
      browser.runtime.onMessage.removeListener(onUpdate);
    };
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
