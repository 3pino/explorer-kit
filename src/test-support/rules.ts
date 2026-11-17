import * as kit from '../index';
import type { Entry, Rules } from '../types';

// 試験用: 特別なフォルダ（special）を持つ置き場所の決まりと、
// それを渡して呼ぶ短い書き方。

export const RULES: Rules = {
  specialDir: 'special',
  nameError: (_dir, name) => kit.basicNameError(name),
  texts: {
    root: 'ルート',
    reserved: '特別なフォルダは動かせません',
    crossMove: '特別なフォルダの内外の間は移動できません（コピーしてください）',
    noSubfolder: '特別なフォルダ内にフォルダは作れません',
    cutSkipped: '特別・ゴミ箱のフォルダは動かせないので除きました',
    trashNote: '特別なフォルダのものは、リンクが切れます',
    overwriteBody: '同じ特別なフォルダの中身が入れ替わります。元に戻せません',
  },
};

export const checkTransfer = (op: kit.TransferOp, item: kit.TransferItem, destDir: string): kit.Check => kit.checkTransfer(RULES, op, item, destDir);

export const planTransfer = (
  op: kit.TransferOp,
  items: readonly kit.TransferItem[],
  destDir: string,
  destEntries: ReadonlyMap<string, Entry> | null,
): kit.Planned[] => kit.planTransfer(RULES, op, items, destDir, destEntries);

export const runTransfer = (input: Omit<kit.TransferInput, 'rules' | 'errorText'>): Promise<kit.TransferResult> =>
  kit.runTransfer({ ...input, rules: RULES, errorText: (e) => (e instanceof Error ? e.message : String(e)) });

export const transferFailure = kit.transferFailure;
export type TransferItem = kit.TransferItem;
