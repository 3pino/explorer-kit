import { parentOf } from '../path';
import { inheritedDirView, parseDirViewMap, withDirView, type DirView, type DirViewMap, type ViewMode } from '../dirs';
import type { SortKey, SortOrder } from '../listing';
import type { ViewStore } from '../types';

// 一覧の表示方法と並び順。フォルダごとの設定で、保存先は本体が決める（ViewStore）。
// 決めていないフォルダは、いちばん近い上のフォルダの設定に従う（どこにも無ければ既定: 詳細・名前の昇順）。
// 保存先の値がリアクティブなら、描画の中で読んだ of() も追従する。

export type { ViewMode, DirView };

export class ExplorerView {
  private memoRaw: unknown = undefined;
  private memo: DirViewMap = {};

  constructor(private readonly store: ViewStore) {}

  /** 保存されている表示（読むたびに検証する。同じ値なら作り直さない） */
  private get map(): DirViewMap {
    const raw = this.store.read();
    if (raw !== this.memoRaw) {
      this.memoRaw = raw;
      this.memo = parseDirViewMap(raw);
    }
    return this.memo;
  }

  /** このフォルダの表示（決めていなければ上のフォルダ、無ければ既定） */
  of(dir: string): DirView {
    return inheritedDirView(this.map, dir, parentOf);
  }

  setView(dir: string, view: ViewMode): void {
    this.put(dir, { ...this.of(dir), view });
  }

  setSort(dir: string, sortKey: SortKey, sortOrder: SortOrder): void {
    this.put(dir, { ...this.of(dir), sortKey, sortOrder });
  }

  /** 保存を消す（テスト用） */
  reset(): void {
    this.store.write({});
  }

  private put(dir: string, v: DirView): void {
    // 変えたものを最後に置き、多すぎたら古いものから捨てる（dirs.ts）
    this.store.write(withDirView(this.map, dir, v));
  }
}
