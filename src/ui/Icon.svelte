<script lang="ts">
  import type { IconRef } from './icons';
  // アイコン（Svelte のアイコン部品）。見た目はグローバルの .icon（@3pino/design-system の components.css）
  let { icon, size = 24, class: className = '' }: { icon: IconRef; size?: number; class?: string } = $props();
  const C = $derived(icon);
</script>

<C {size} class="icon {className}" />
