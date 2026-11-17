<script lang="ts">
  // 試験用: 本体の操作（host.fileAction）のアイコンの代わり
  let { size = 16, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg class="fake-icon {className}" width={size} height={size}></svg>
