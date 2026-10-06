<script lang="ts">
  import { onMount, tick } from 'svelte';

  type Shortcut = { keys: string; description: string };
  let { commands, onClose }: { commands: Shortcut[]; onClose: () => void } = $props();
  let popup: HTMLDivElement;
  let content: HTMLDivElement;
  const navigation: Shortcut[] = [
    { keys: '↑ / ↓', description: 'Перейти к предыдущему / следующему элементу.' },
    { keys: '← / →', description: 'Передать фокус в левую / правую панель.' },
    { keys: 'Tab / Shift+Tab', description: 'Передать фокус в соседнюю панель.' },
    { keys: 'Home / End', description: 'Перейти к первому / последнему элементу.' },
    { keys: 'Enter', description: 'Открыть закладку в новой вкладке или перейти в папку.' },
    { keys: 'Backspace', description: 'Перейти в родительскую папку.' }
  ];
  const selection: Shortcut[] = [
    { keys: 'Пробел', description: 'Переключить выделение текущего элемента, сохранив фокус.' },
    { keys: 'Insert / Shift+↓', description: 'Переключить выделение текущего элемента и перейти к следующему.' },
    { keys: 'Shift+↑', description: 'Переключить выделение текущего элемента и перейти к предыдущему.' },
    { keys: 'Shift+Home', description: 'Переключить выделение всех элементов от текущего до первого включительно и перейти в начало.' },
    { keys: 'Shift+End', description: 'Переключить выделение всех элементов от текущего до последнего включительно и перейти в конец.' }
  ];

  onMount(() => content.focus({ preventScroll: true }));

  async function onFocusout(): Promise<void> {
    await tick();
    if (popup.isConnected && !popup.contains(document.activeElement)) onClose();
  }
</script>

<svelte:window onblur={onClose} />

<div
  bind:this={popup}
  id="keyboard-help"
  data-keyboard-help
  role="dialog"
  aria-modal="false"
  aria-labelledby="keyboard-help-title"
  tabindex="-1"
  onfocusout={onFocusout}
  onkeydown={(event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }}
  class="absolute right-0 bottom-full z-40 mb-2 flex max-h-[min(70vh,640px)] w-[560px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-[#d5dbea] bg-white text-[#34405a] shadow-xl"
>
  <header class="flex shrink-0 items-center justify-between gap-4 border-b border-[#e6eaf1] px-5 py-3">
    <h2 id="keyboard-help-title" class="text-lg font-semibold">Управление</h2>
    <button type="button" aria-label="Закрыть справку" onclick={onClose} class="size-8 cursor-pointer rounded-md text-xl hover:bg-[#f5f2fd] focus-visible:outline-2 focus-visible:outline-[#5f44b4]">×</button>
  </header>
  <div bind:this={content} data-keyboard-help-content role="region" aria-label="Горячие клавиши" tabindex="-1" class="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 text-sm focus:outline-none">
    <p class="mb-4 text-[#69748b]">Горячие клавиши работают при фокусе в панелях. Повторное выделение снимает отметку.</p>
    <div class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3">
      {#each [{ title: 'Навигация', items: navigation }, { title: 'Выделение', items: selection }, { title: 'Команды', items: commands }, { title: 'Окна и перетаскивание', items: [{ keys: 'Esc', description: 'Закрыть справку, отменить диалог создания или перетаскивание.' }] }] as group}
        <h3 class="col-span-2 mt-4 mb-2 font-semibold first:mt-0">{group.title}</h3>
        <ul class="col-span-2 grid grid-cols-subgrid gap-y-3">
          {#each group.items as shortcut}
            <li class="col-span-2 grid grid-cols-subgrid items-baseline">
              <kbd class="justify-self-start rounded border border-[#dce2ed] bg-[#f5f6fb] px-2 py-0.5 font-sans text-xs font-semibold">{shortcut.keys}</kbd>
              <span class="min-w-0">{shortcut.description}</span>
            </li>
          {/each}
        </ul>
      {/each}
    </div>
  </div>
</div>
