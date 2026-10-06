<script module lang="ts">
  export type CommandBarButton = {
    title: string;
    action: () => void | Promise<void>;
    disabled?: boolean;
    symbol?: string;
    separatorBefore?: boolean;
    labelBefore?: string;
  };
</script>

<script lang="ts">
  type Props = {
    buttons: readonly CommandBarButton[];
    label?: string;
  };

  let { buttons, label }: Props = $props();
</script>

<div
  class="flex w-full shrink-0 items-center gap-1 overflow-x-auto rounded-lg border border-[#d5dbea] bg-[#e6eaf1] p-1"
  role="group"
  aria-label="Команды"
>
  {#if label}<span class="shrink-0 px-2 text-[#34405a]">{label}</span>{/if}
  {#each buttons as button}
    {#if button.separatorBefore}<span class="shrink-0 px-2 text-[#758097]" aria-hidden="true">|</span>{/if}
    {#if button.labelBefore}<span class="shrink-0 pr-2 text-[#34405a]">{button.labelBefore}</span>{/if}
    <button
      class={`h-10 min-w-max shrink-0 cursor-pointer rounded-md border border-[#d5dbea] bg-white text-center whitespace-nowrap text-[#34405a] enabled:hover:border-[#b8aadf] enabled:hover:bg-[#f5f2fd] enabled:active:bg-[#ebe6fb] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#5f44b4] ${button.symbol ? 'w-10 text-xl' : 'px-4'}`}
      type="button"
      aria-label={button.title}
      disabled={button.disabled ?? false}
      onclick={() => void button.action()}
    >{button.symbol ?? button.title}</button>
  {/each}
</div>
