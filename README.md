# @3pino/explorer-kit

ファイルエクスプローラーの共有の部品（Svelte 5）。[disnans](https://github.com/3pino/disnans) の共有フォルダの画面と、disrect（ファイラー）が同じものを使います。

- **画面**: `FileExplorer.svelte`（一覧・アイコン表示・選択・コピー／切り取り／貼り付け・ドラッグ・名前の変更・ゴミ箱・外からの取り込み）、`FileProperties.svelte`、`EntryActions.svelte`
- **決まり**（見た目を持たない）: 名前・同名の扱い（`ops`）、移動とコピーの進め方（`transfer`）、ゴミ箱の仮想フォルダ（`trashFolder`）、並び順（`listing`）、フォルダごとの表示（`dirs`）
- **状態**: 開いているフォルダ（`ExplorerNav`）・一覧の写し（`DirIndex`）・選択・切り取り／コピーの控え・表示方法

見た目は [@3pino/design-system](https://github.com/3pino/design-system) の CSS を前提にしています（取り込む側のアプリが読み込む）。

## 2 つの口

部品は、次の 2 つだけを通して外とやりとりします（`src/types.ts`）。

| 口 | 中身 | disnans | disrect |
| --- | --- | --- | --- |
| 置き場所 `ExplorerApi`（＋`EntryUrls`・`Rules`・`ScopeSource`） | 一覧・書き込み・移動・コピー・ゴミ箱・大きさ。パスは、いちばん上からの相対（区切り `/`） | サーバーの共有フォルダ（REST） | この端末（Rust のコマンド） |
| 本体から借りる機能 `ExplorerHost` | 通知・確認・「戻る」・拡大表示・クリップボード・保存・OS からのドロップ・この端末の種類 | アプリの既存の機能 | 自分の実装 |

`Rules` は置き場所ごとの決まり（添付のフォルダ・名前）。添付のフォルダが無い置き場所は `attachmentsDir: null` にします。

## 使い方

```sh
npm install github:3pino/explorer-kit#v0.1.0
```

配布はソースのまま（`.svelte`・`.svelte.ts`・`.ts`）。取り込む側の Vite（`@sveltejs/vite-plugin-svelte`）が変換します。

```ts
import { createExplorer } from '@3pino/explorer-kit';

export const explorer = createExplorer({ api, urls, rules, host, viewStore });
```

```svelte
<script lang="ts">
  import FileExplorer from '@3pino/explorer-kit/FileExplorer.svelte';
  import { explorer } from './explorer';
</script>

<FileExplorer {explorer} />
```

`explorer` は、その部品の一生のあいだ同じものを渡します（別の置き場所を見せるときは `{#key}` で作り直す）。

## 確かめる

```sh
npm install
npm run check   # 型
npm test        # 決まり・状態・画面の試験
```

画面の細かい流れ（同名の確認・貼り付け・ゴミ箱の項目・OS からのドロップ）は、disnans の `app/src/components/FileExplorer.test.ts` が、
この部品に Disnans の実装を渡して確かめています。部品を変えたら、disnans の試験も通ることを確かめてからタグを打ちます。

## 変更するとき

- 置き場所や本体に依ることは、`types.ts` の口に足す（部品の中で、OS や通信を直接さわらない）。
- 変えたらバージョンを上げて `git tag vX.Y.Z`。各アプリは、タグを指定して取り込む。
