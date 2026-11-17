# @3pino/explorer-kit

ファイルエクスプローラーの共有の部品（Svelte 5）。特定のアプリの言葉は持たず、使うアプリが「置き場所」と「本体から借りる機能」を渡して、自分の画面を作ります（例: [fixplor](https://github.com/3pino/fixplor) は「この端末」を、サーバーのアプリは「サーバーのフォルダ」を渡す）。

- **画面**: `FileExplorer.svelte`（一覧・アイコン表示・選択・コピー／切り取り／貼り付け・ドラッグ・名前の変更・ゴミ箱・外からの取り込み）、`FileProperties.svelte`、`EntryActions.svelte`。ボタン・メニュー・ダイアログなどの小さな部品は [@3pino/ui-kit-web](https://github.com/3pino/ui-kit-web) のもの
- **決まり**（見た目を持たない）: 名前・同名の扱い（`ops`）、移動とコピーの進め方（`transfer`）、ゴミ箱の仮想フォルダ（`trashFolder`）、並び順（`listing`）、フォルダごとの表示（`dirs`）
- **状態**: 開いているフォルダ（`ExplorerNav`）・一覧の写し（`DirIndex`）・選択・切り取り／コピーの控え・表示方法

見た目は [@3pino/design-system](https://github.com/3pino/design-system) の CSS を前提にしています（取り込む側のアプリが読み込む）。
取り込む側は、`@3pino/ui-kit-web` も依存に入れてください（peer です）。

## 2 つの口

部品は、次の 2 つだけを通して外とやりとりします（`src/types.ts`）。

| 口 | 中身 | 例: サーバーのフォルダ | 例: この端末（fixplor） |
| --- | --- | --- | --- |
| 置き場所 `ExplorerApi`（＋`EntryUrls`・`Rules`・`ScopeSource`） | 一覧・書き込み・移動・コピー・ゴミ箱・大きさ。パスは、いちばん上からの相対（区切り `/`） | サーバーの API | Rust のコマンド |
| 本体から借りる機能 `ExplorerHost` | 通知・確認・「戻る」・拡大表示・クリップボード・保存・OS からのドロップ・この端末の種類 | アプリの既存の機能 | 自分の実装 |

`Rules` は置き場所ごとの決まり（特別なフォルダ・名前・文）。
- **特別なフォルダ** `specialDir`: そのフォルダそのものは動かせない・消せない／中にはファイルだけ（フォルダは作れない）／中と外の間は移動できない（コピーはできる）／中では、大文字・小文字だけが違う名前を同じ名前として扱う。無い置き場所は `null`。
- **文** `texts`（省ける）: 特別なフォルダの理由・確認の文などを、アプリの言葉で渡せる（`RuleTexts`）。省くと一般の文になる。
- 画面に出る呼び名は `labels`（`root`・`upload`、置き場所が切り替わるなら `scope`）で渡す。
- ドラッグで運ぶ項目の印は `EXPLORER_DRAG_TYPE`（`application/x-explorer-kit-items`）。ほかのドロップ先が、この部品のドラッグかを見分けるのに使える。
- **ゴミ箱の無い置き場所**（ネットワークドライブなど）は、`createExplorer({ caps: { trash: false } })`。削除は完全な削除になり、部品は `api.trash` の代わりに `api.remove(path)`（その置き場所が実装する）を呼ぶ。確認は「完全に削除します。元に戻せません」で、「取り消す」は出ない。
- 項目（`Entry`）の `message_id`・`file_id` は、置き場所が足す任意の欄（部品は読まない）。

## 使い方

```sh
npm install github:3pino/explorer-kit#v0.4.0
```

配布はソースのまま（`.svelte`・`.svelte.ts`・`.ts`）。取り込む側の Vite（`@sveltejs/vite-plugin-svelte`）が変換します。
開発サーバーの依存の事前バンドルは JS だけを想定しているので、取り込む側の `vite.config.ts` で外してください。

```ts
optimizeDeps: { exclude: ['@3pino/explorer-kit', '@3pino/ui-kit-web'] },
```

```ts
import { createExplorer } from '@3pino/explorer-kit';

export const explorer = createExplorer({ api, urls, rules, host, viewStore, labels: { root: 'この端末', upload: '取り込む' } });
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

画面の細かい流れ（同名の確認・貼り付け・選択・ゴミ箱の項目・OS からのドロップ・置き場所が変わったとき・プロパティ）は、
この部品の中の試験（`src/FileExplorer.screen.test.ts`・`src/FileProperties.screen.test.ts`）が、メモリの中の偽の置き場所と本体（`src/test-support/screen.svelte.ts`）で確かめます。
使うアプリの側の試験は、その置き場所・本体の配線が正しいことだけを確かめれば足ります。

## 変更するとき

- 置き場所や本体に依ることは、`types.ts` の口に足す（部品の中で、OS や通信を直接さわらない）。
- 変えたらバージョンを上げて `git tag vX.Y.Z`。各アプリは、タグを指定して取り込む。
