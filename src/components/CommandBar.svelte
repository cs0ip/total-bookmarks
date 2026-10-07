<script module lang="ts">
  export type CommandBarButton = {
    title: string;
    action: () => void | Promise<void>;
    disabled?: boolean;
    symbol?: string;
    separatorBefore?: boolean;
    labelBefore?: string;
    icon?: string;
    imageSrc?: string;
    popupId?: string;
    expanded?: boolean;
  };
</script>

<script lang="ts">
  import { t } from '../i18n';
  type Props = {
    buttons: readonly CommandBarButton[];
    label?: string;
  };

  let { buttons, label }: Props = $props();
</script>

<div
  class="flex w-full shrink-0 items-center gap-1 overflow-x-auto rounded-lg border border-[#d5dbea] bg-[#e6eaf1] p-1"
  role="group"
  aria-label={$t('commands')}
>
  {#if label}<span class="shrink-0 px-2 text-[#34405a]">{label}</span>{/if}
  {#each buttons as button}
    {#if button.separatorBefore}<span class="shrink-0 px-2 text-[#758097]" aria-hidden="true">|</span>{/if}
    {#if button.labelBefore}<span class="shrink-0 pr-2 text-[#34405a]">{button.labelBefore}</span>{/if}
    <button
      class={`h-10 min-w-max shrink-0 cursor-pointer rounded-md border border-[#d5dbea] bg-white text-center whitespace-nowrap text-[#34405a] enabled:hover:border-[#b8aadf] enabled:hover:bg-[#f5f2fd] enabled:active:bg-[#ebe6fb] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#5f44b4] ${button.symbol || button.imageSrc ? 'w-10 text-xl' : 'px-4'}`}
      type="button"
      aria-label={button.title}
      aria-haspopup={button.popupId ? 'dialog' : undefined}
      aria-controls={button.popupId}
      aria-expanded={button.expanded}
      disabled={button.disabled ?? false}
      onclick={() => void button.action()}
    >{#if button.imageSrc}<img src={button.imageSrc} alt="" class="mx-auto size-7" />{:else}{#if button.icon}<span class="mr-2 inline-flex size-4 items-center justify-center rounded-full border border-current text-xs font-semibold" aria-hidden="true">{button.icon}</span>{/if}{button.symbol ?? button.title}{/if}</button>
  {/each}
</div>
