<script lang="ts">
  // 試験用: PDF のサムネイルの部品の代わり（本物は、アプリが PDF を描く部品を渡す）
  let { url, key }: { url: string; key: string } = $props();
</script>

<span class="pdf-thumb" data-url={url} data-key={key}></span>
