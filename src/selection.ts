// 複数選択から決まる値（操作に渡す形・できない理由）。純粋な関数だけ。見た目は持たない。
import { entryLabel, trashItemOf, trashPlace } from './trashFolder';
import { parentOf } from './path';
import { checkTransfer, type TransferItem } from './transfer';
import { renameAllowed } from './ops';
import type { Entry, Rules } from './types';

/** 操作に渡す形（移動・コピー・ゴミ箱の位置・元の名前） */
export function transferItemOf(e: Entry): TransferItem {
  const kind = e.kind === 'dir' ? 'dir' : 'file';
  const place = trashPlace(e);
  if (place === 'item') return { path: e.path, kind, name: entryLabel(e), trash: { where: 'item', restoreTo: trashItemOf(e)!.original_path } };
  if (place === 'root') return { path: e.path, kind, trash: { where: 'root' } };
  if (place === 'inside') return { path: e.path, kind, trash: { where: 'inside' } };
  return { path: e.path, kind };
}

/** 選んだ項目が全部ゴミ箱の直下の項目か（元へ戻す・完全削除の対象） */
export function allWholeTrash(entries: readonly Entry[]): boolean {
  return entries.length > 0 && entries.every((e) => trashPlace(e) === 'item');
}

/** 選んだ項目に、コピーできないもの（ゴミ箱のフォルダ）があれば、その理由 */
export function copyBlockedReason(items: readonly TransferItem[]): string | null {
  return items.some((i) => i.trash?.where === 'root') ? 'ゴミ箱のフォルダはコピーできません' : null;
}

/** 選んだ項目に、切り取りできないもの（添付のフォルダ・ゴミ箱のフォルダや中身など）があれば、その理由。ゴミ箱の直下の項目は切り取れる（貼り付けで元の場所だけ） */
export function cutBlockedReason(rules: Rules, items: readonly TransferItem[]): string | null {
  return (
    items
      .map((i) => (i.trash?.where === 'item' ? ({ ok: true } as const) : checkTransfer(rules, 'move', i, parentOf(i.path))))
      .find((c) => !c.ok)?.message ?? null
  );
}

/** 選んだ項目を削除できない理由。ゴミ箱のフォルダ・中身は消せない。ゴミ箱の項目は完全削除（ふつうの項目と混ぜない） */
export function deleteBlockedReason(rules: Rules, entries: readonly Entry[], items: readonly TransferItem[]): string | null {
  const places = entries.map(trashPlace);
  if (places.includes('root')) return 'ゴミ箱のフォルダは消せません';
  if (places.includes('inside')) return 'ゴミ箱の中身は消せません（項目を選んで、元へ戻すか完全に削除してください）';
  if (places.includes('item') && places.includes('normal')) return 'ゴミ箱の項目と、ふつうの項目は一緒に消せません';
  return items.map((i) => renameAllowed(rules, i.path)).find((c) => !c.ok)?.message ?? null;
}
