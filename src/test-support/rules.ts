import * as kit from '../index';
import type { Entry, Rules } from '../types';

// 試験用: 添付のフォルダ（attachments）を持つ置き場所の決まり（Disnans の共有フォルダと同じ形）と、
// それを渡して呼ぶ短い書き方。

export const RULES: Rules = {
  attachmentsDir: 'attachments',
  nameError: (_dir, name) => kit.basicNameError(name),
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
