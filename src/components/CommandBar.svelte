<script module lang="ts">
  export type CommandBarButton = {
    title: string;
    action: () => void | Promise<void>;
    disabled?: boolean;
  };
</script>

<script lang="ts">
  type Props = {
    buttons: readonly CommandBarButton[];
  };

  let { buttons }: Props = $props();
</script>

<div
  class="flex w-full shrink-0 gap-1 overflow-x-auto rounded-lg border border-[#d5dbea] bg-[#e6eaf1] p-1"
  role="group"
  aria-label="Команды"
>
  {#each buttons as button}
    <button
      class="min-w-max flex-1 cursor-pointer rounded-md border border-[#d5dbea] bg-white px-4 py-2 text-center whitespace-nowrap text-[#34405a] enabled:hover:border-[#b8aadf] enabled:hover:bg-[#f5f2fd] enabled:active:bg-[#ebe6fb] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#5f44b4]"
      type="button"
      title={button.title}
      disabled={button.disabled ?? false}
      onclick={() => void button.action()}
    >{button.title}</button>
  {/each}
</div>
