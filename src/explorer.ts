import { ExplorerBuffer } from './stores/buffer.svelte';
import { DirIndex } from './stores/dirIndex.svelte';
import { ExplorerNav } from './stores/nav.svelte';
import { ExplorerSelection } from './stores/selection.svelte';
import { ExplorerView } from './stores/view.svelte';
import type { DirIndexLike, EntryUrls, ExplorerApi, ExplorerHost, Rules, ScopeSource, ViewStore } from './types';

/** できること（無い操作は出さない） */
export type ExplorerCaps = {
  /** ゴミ箱へ入れたものを、この部品から元へ戻せる（削除のあとの「取り消す」） */
  restore: boolean;
};

/** 置き場所ごとの言葉（画面に出す文字） */
export type ExplorerLabels = {
  /** いちばん上の名前（道筋の先頭。Disnans は「共有フォルダ」） */
  root: string;
  /** 外のファイルを取り込む操作の名前（Disnans は「アップロード」） */
  upload: string;
};

/** エクスプローラー 1 つ分（置き場所・本体から借りる機能・状態）。画面（FileExplorer.svelte）へ渡す */
export type Explorer = {
  api: ExplorerApi;
  urls: EntryUrls;
  rules: Rules;
  scope: ScopeSource;
  caps: ExplorerCaps;
  labels: ExplorerLabels;
  host: ExplorerHost;
  index: DirIndexLike;
  nav: ExplorerNav;
  buffer: ExplorerBuffer;
  selection: ExplorerSelection;
  view: ExplorerView;
};

export type ExplorerOptions = {
  api: ExplorerApi;
  urls: EntryUrls;
  rules: Rules;
  host: ExplorerHost;
  viewStore: ViewStore;
  caps?: Partial<ExplorerCaps>;
  labels: ExplorerLabels;
  /** 置き場所が変わるもの（接続先を切り替えられるサーバーなど）だけ渡す。省くと、変わらない置き場所 */
  scope?: ScopeSource;
  /** 一覧の写しを本体が持っているとき（ほかの画面と共有する）。省くと、ここで作る */
  index?: DirIndexLike;
  /** 一覧の失敗が「そのフォルダが無い」か（index を省いたときだけ使う） */
  isMissing?(e: unknown): boolean;
};

const FIXED_SCOPE: ScopeSource = { key: () => '', onChange: () => () => {} };

/**
 * エクスプローラーを 1 つ作る。置き場所が変わったら（scope）、前の場所を開いたままにしない
 * （いちばん上へ戻し、選び・切り取りの控えを捨てる。ここで作った一覧の写しも捨てる）。
 */
export function createExplorer(options: ExplorerOptions): Explorer {
  const own = options.index ? null : new DirIndex({ list: (dir) => options.api.list(dir), isMissing: options.isMissing });
  const index = options.index ?? own!;
  const nav = new ExplorerNav(index);
  const buffer = new ExplorerBuffer();
  const selection = new ExplorerSelection();
  const view = new ExplorerView(options.viewStore);
  const scope = options.scope ?? FIXED_SCOPE;
  scope.onChange(() => {
    own?.clear();
    nav.reset();
    buffer.clear();
    selection.clear();
  });
  return {
    api: options.api,
    urls: options.urls,
    rules: options.rules,
    scope,
    caps: { restore: true, ...options.caps },
    labels: options.labels,
    host: options.host,
    index,
    nav,
    buffer,
    selection,
    view,
  };
}
