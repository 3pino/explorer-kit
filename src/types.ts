import type { Component } from 'svelte';

// 共有の部品が外とやりとりする 2 つの口（置き場所 ExplorerApi・本体から借りる機能 ExplorerHost）と、その上を流れる値。
// 項目の形（Entry）は Disnans のサーバーの共有フォルダ（SharedEntry）と同じ。ほかの置き場所は、無い欄を null にする。

export type EntryKind = 'file' | 'dir';

/** ゴミ箱の 1 件（置き場所が、ゴミ箱の中を仮想のフォルダとして見せるとき） */
export type TrashEntry = {
  id: string;
  /** 消したときのパス */
  original_path: string;
  kind: EntryKind;
  size: number;
  deleted_at: number;
  trash_path?: string;
};

/** ゴミ箱の仮想のフォルダの中での位置（root: フォルダそのもの / item: 直下の 1 件 / descendant: その中身） */
export type TrashNode = { kind: 'root' } | { kind: 'item'; entry: TrashEntry } | { kind: 'descendant'; id: string };

/** 一覧の 1 行。`path` は置き場所のいちばん上からの相対パス（区切りは `/`。いちばん上は空文字） */
export type Entry = {
  name: string;
  path: string;
  kind: EntryKind;
  /** バイト数。フォルダは 0 */
  size: number;
  /** 更新時刻（UNIX 時刻のミリ秒）。分からなければ 0 */
  modified: number;
  /** 種類（分かるときだけ） */
  mime: string | null;
  /** Disnans の添付だけ */
  message_id: string | null;
  /** Disnans の添付だけ */
  file_id: string | null;
  /** ゴミ箱の仮想のフォルダの中の項目だけ */
  trash?: TrashNode;
};

export type Size = { size: number; files: number; dirs: number };

/** 送信（アップロード）の 1 件。abort で止められる */
export type UploadHandle = { promise: Promise<unknown>; abort: () => void };

/**
 * 置き場所（Disnans サーバーの共有フォルダ・この端末など）。パスは、いちばん上からの相対（`docs/a.txt`）。
 * 同名の決まり: write は黙って上書きする（呼ぶ側が先に確かめる）。move・copy は overwrite が真のときだけ、ファイルを置き換える。
 */
export interface ExplorerApi {
  list(path: string): Promise<Entry[]>;
  /** 作成・上書き */
  write(path: string, body: Blob | ArrayBuffer | string): Promise<Entry>;
  mkdir(path: string): Promise<Entry>;
  /** ゴミ箱へ入れる。入った項目を返す（id は restore・purge に渡す） */
  trash(path: string): Promise<TrashEntry>;
  /** ゴミ箱から元の場所へ戻す（caps.restore が真のときだけ呼ぶ） */
  restore(id: string): Promise<Entry>;
  /** ゴミ箱の項目を完全に消す（caps.restore が真のときだけ呼ぶ） */
  purge(id: string): Promise<void>;
  size(path: string): Promise<Size>;
  move(from: string, to: string, overwrite?: boolean): Promise<Entry>;
  copy(from: string, to: string, overwrite?: boolean): Promise<Entry>;
  /** 進み具合つきで送る（ファイルの選択・貼り付け） */
  upload(path: string, file: Blob, onProgress?: (ratio: number) => void): UploadHandle;
}

/** 置き場所ごとの決まり（名前・特別なフォルダ） */
export type Rules = {
  /** 添付のフォルダ（Disnans の `attachments`。中はファイルだけ・外との間は移動できない）。無ければ null */
  attachmentsDir: string | null;
  /** 名前の決まり。使えるなら null、使えないなら理由 */
  nameError(dir: string, name: string): string | null;
};

/** 置き場所が変わったか（Disnans では接続先のサーバー）を見分ける口。操作の途中で変わったら、新しい方へは書かない */
export type ScopeSource = {
  /** いまの置き場所の見分け（同じ文字列なら同じ置き場所） */
  key(): string;
  /** 変わったときに呼ぶ。戻り値で外す */
  onChange(cb: () => void): () => void;
};

/** 項目の URL（一覧・サムネイル・拡大表示） */
export type EntryUrls = {
  /** 開く・保存するときの URL */
  href(e: Entry): string;
  /** 読む元の URL（thumb は縮小版があればそれ） */
  readUrl(e: Entry, thumb?: boolean): string;
  /** 並べ目（グリッド）の小さい画像。画像でなければ null */
  thumbUrl(e: Entry): string | null;
  /** PDF のサムネイルの元。PDF でない・大きすぎるなら null */
  pdfSource(e: Entry): { url: string; key: string } | null;
};

export type ConfirmOptions = { title: string; body?: string; okLabel: string; ngLabel?: string; danger?: boolean };
export type ToastKind = 'info' | 'error';
export type ToastAction = { label: string; run: () => void };

/** 拡大表示の 1 件 */
export type ViewerItem = { src: string; alt: string; downloadUrl: string; kind?: string };

export type ClipboardPeek = { text: boolean; image: boolean } | 'unknown';

/** OS からドロップされた 1 件（フォルダか、中身を読めるファイル）。rel はドロップした根からの相対パス */
export type OsDropEntry = { rel: string; dir: true } | { rel: string; dir: false; size: number; read: () => Promise<Blob> };
export type NativeDropEvent = { type: 'enter' | 'over' | 'drop' | 'leave'; paths: string[]; position: { x: number; y: number } | null };
export type OsDropEvent = { id: number | null; error?: string | null; position: { x: number; y: number } | null };

/**
 * 本体（disnans・disrect）から借りる機能。部品は、通知や確認の出し方・クリップボードの読み方・この端末の種類を自分では決めない。
 */
export interface ExplorerHost {
  toast(text: string, kind?: ToastKind, action?: ToastAction): unknown;
  confirm(opts: ConfirmOptions): Promise<boolean>;
  /** 「戻る」（Android の戻る・Alt+←）で先に呼ぶ処理を積む。戻り値で外す */
  addBack(run: () => void): () => void;
  /** 拡大表示で開く。gallery は前後に送るときの並び */
  openViewer(item: ViewerItem, gallery: () => ViewerItem[]): void;
  /** 拡大表示で見られる種類（'image'・'pdf' など）。見られなければ null */
  viewerKind(name: string, mime?: string | null): string | null;
  isImage(name: string, mime?: string | null): boolean;
  /** 失敗を、利用者向けの文にする */
  errorText(e: unknown): string;
  /** 診断の記録 */
  log(level: 'info' | 'warn' | 'error', text: string): void;
  platform: {
    isTauri(): boolean;
    /** 'windows'・'linux'・'android' など（分からなければ空文字） */
    osName(): string;
    isLinuxDesktop(): boolean;
  };
  clipboard: {
    copyText(text: string): Promise<boolean>;
    peek(): Promise<ClipboardPeek>;
    readText(): Promise<string | null>;
    readImage(): Promise<File | null>;
    /** Linux の WebView で、paste の画像が取れないときの読み方 */
    readNativeImage(): Promise<File | null>;
    /** 文字を貼り付けて作るファイルの名前 */
    textName(): string;
  };
  download: {
    file(req: { url: string; name: string }): Promise<void>;
    /** リンクの押しを、保存の処理に差し替える（差し替えたら true） */
    intercept(ev: MouseEvent, req: { url: string; name: string }): boolean;
  };
  /** OS からのドロップ（フォルダごと取り込む） */
  osDrop: {
    listenNative(handler: (ev: NativeDropEvent) => void): Promise<() => void>;
    listen(handler: (ev: OsDropEvent) => void): Promise<() => void>;
    entries(id: number): Promise<{ entries: OsDropEntry[]; skipped: string[] }>;
    release(id: number): Promise<void>;
    rootsOf(dt: DataTransfer | null | undefined): FileSystemEntry[];
    entriesFromRoots(roots: FileSystemEntry[]): Promise<OsDropEntry[]>;
  };
  /** PDF のサムネイルを描く部品（無ければ、アイコンを出す） */
  PdfThumb?: Component<{ url: string; key: string }>;
  /** ファイルのプロパティに出す、本体の操作（Disnans の「メッセージを検索」など）。無ければ出さない */
  fileAction?: { label: string; icon: Component<{ size?: number; class?: string }>; run(entry: Entry, label: string): void };
}

/** フォルダの一覧の状態 */
export type DirState =
  | { kind: 'loading' }
  | { kind: 'ok'; entries: Map<string, Entry> }
  | { kind: 'missing' }
  | { kind: 'error'; message: string; at: number };

/** フォルダの一覧の手元の写し（必要になったフォルダだけ読み、変わったら捨てる） */
export interface DirIndexLike {
  state(dir: string): DirState | undefined;
  ensure(dir: string): void;
  invalidate(changed: string): void;
}

/** フォルダごとの表示方法を保存する先（本体の設定） */
export type ViewStore = {
  /** 保存されている値（形は部品が確かめる） */
  read(): unknown;
  write(map: Record<string, unknown>): void;
};
