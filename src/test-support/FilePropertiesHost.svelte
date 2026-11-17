<script lang="ts">
  import FileProperties from '../FileProperties.svelte';
  import type { Entry, Explorer } from '../index';

  // 試験用: 開いたままの 1 つのプロパティで、見る項目だけを差し替える（別の項目へ切り替えたときの動きを見る）
  let { explorer, entry: first }: { explorer: Explorer; entry: Entry } = $props();
  // svelte-ignore state_referenced_locally
  let entry = $state.raw(first);
  export function show(next: Entry): void {
    entry = next;
  }
</script>

<FileProperties {explorer} {entry} onclose={() => {}} />
