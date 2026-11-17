// 書き込みの決まり（名前・確認の文・同名の扱い）。見た目は持たない。
// 置き場所ごとの違い（特別なフォルダ・名前の決まり・文）は Rules で受け取る。

import type { Entry, RuleTexts, Rules } from './types';
import { baseName, childPath, parentOf } from './path';

export { childPath };

/** ドラッグで運ぶ項目の印（DataTransfer の種類）。ほかのアプリのドロップ先が、この部品のドラッグかを見分けるのに使う */
export const EXPLORER_DRAG_TYPE = 'application/x-explorer-kit-items';

/** 特別なフォルダそのものか、その中か（特別なフォルダの決まりが掛かる）。特別なフォルダが無い置き場所では、いつも false */
export function inSpecialDir(rules: Rules, path: string): boolean {
  const dir = rules.specialDir;
  return dir !== null && (path === dir || path.startsWith(dir + '/'));
}

/** どの置き場所でも使えない名前（空・`.`・`..`・区切り・制御文字）。置き場所の決まり（Rules.nameError）の土台に使う */
export function basicNameError(name: string): string | null {
  if (name.trim() === '') return '名前を入力してください';
  if (name === '.' || name === '..') return 'この名前は使えません';
  if (name.includes('/') || /[\u0000-\u001f]/.test(name)) return '名前に / と改行は使えません';
  return null;
}

/** 特別なフォルダそのものの理由（既定の文）。動かせない・消せない */
export const RESERVED_REASON = 'このフォルダは動かせません';

/** 置き場所の文（Rules.texts）に、一般の文を補う */
export function ruleTexts(rules: Rules): Required<Omit<RuleTexts, 'trashNote' | 'overwriteBody'>> & Pick<RuleTexts, 'trashNote' | 'overwriteBody'> {
  const t = rules.texts ?? {};
  return {
    root: t.root ?? 'いちばん上',
    reserved: t.reserved ?? RESERVED_REASON,
    crossMove: t.crossMove ?? 'このフォルダの中と外の間は移動できません（コピーしてください）',
    noSubfolder: t.noSubfolder ?? 'このフォルダの中にはフォルダを作れません',
    cutSkipped: t.cutSkipped ?? (rules.specialDir === null ? 'ゴミ箱のフォルダは動かせないので除きました' : 'このフォルダ・ゴミ箱のフォルダは動かせないので除きました'),
    trashNote: t.trashNote,
    overwriteBody: t.overwriteBody,
  };
}

/** 項目の操作（名前の変更・切り取り・削除）が、今できるか。できないときは理由 */
export type Allowed = { ok: true } | { ok: false; message: string };

/** 項目の名前の変更・削除の可否（特別なフォルダそのものだけ不可） */
export function renameAllowed(rules: Rules, path: string): Allowed {
  return rules.specialDir !== null && path === rules.specialDir ? { ok: false, message: ruleTexts(rules).reserved } : { ok: true };
}

/** 複数の項目をゴミ箱に移す確認の文。restorable が偽（戻す操作が無い置き場所）なら、戻せるとは書かない */
export function trashManyConfirm(
  rules: Rules,
  items: readonly { path: string; kind: 'file' | 'dir' }[],
  restorable = true,
): { title: string; body: string; okLabel: string; danger: true } {
  const n = items.length;
  const notes: string[] = [];
  const note = ruleTexts(rules).trashNote;
  if (note && items.some((i) => inSpecialDir(rules, i.path))) notes.push(note);
  notes.push(restorable ? 'ゴミ箱から元に戻せます' : 'OS のゴミ箱から元に戻せます');
  return { title: `${n} 件をゴミ箱に移しますか`, body: notes.join('。'), okLabel: 'ゴミ箱に移す', danger: true };
}

/** 複数の項目を完全に削除する確認の文（ゴミ箱の無い置き場所。元に戻せない） */
export function permanentDeleteConfirm(items: readonly { path: string; kind: 'file' | 'dir' }[]): { title: string; body: string; okLabel: string; danger: true } {
  return { title: `${items.length} 件を完全に削除しますか`, body: '完全に削除します。元に戻せません', okLabel: '完全に削除', danger: true };
}

/** 同名のファイルを上書きする確認の文（必ず確認する）。特別なフォルダの中は、置き場所の文（Rules.texts.overwriteBody）があればそれ */
export function overwriteConfirm(rules: Rules, path: string): { title: string; body: string; okLabel: string; danger: true } {
  const name = baseName(path);
  return {
    title: `「${name}」を上書きしますか`,
    body: (inSpecialDir(rules, path) && ruleTexts(rules).overwriteBody) || '今のファイルは消えて、新しいものに入れ替わります。元に戻せません',
    okLabel: '上書き',
    danger: true,
  };
}

/** 一覧の中の、同じ名前の項目。特別なフォルダの中は大文字・小文字を区別しない */
export function sameNameEntry(rules: Rules, entries: ReadonlyMap<string, Entry>, dir: string, name: string): Entry | undefined {
  const exact = entries.get(name);
  if (exact || !inSpecialDir(rules, dir)) return exact;
  const lower = name.toLowerCase();
  for (const [k, v] of entries) if (k.toLowerCase() === lower) return v;
  return undefined;
}

/** アップロード（作成・上書き）の決め方 */
export type UploadPlan =
  | { kind: 'create'; path: string }
  | { kind: 'overwrite'; path: string }
  | { kind: 'blocked'; message: string };

/**
 * アップロードの前に、同名の扱いを決める。
 * - 一覧が手元にない（読み終えていない）ときは上書きを防ぐため止める（write は同名を黙って上書きするため）
 * - 同名がフォルダなら止める。ファイルなら上書き（呼ぶ側で確認する）
 */
export function planUpload(rules: Rules, dir: string, name: string, state: { kind: string; entries?: ReadonlyMap<string, Entry> }): UploadPlan {
  const path = childPath(dir, name);
  const bad = rules.nameError(dir, name);
  if (bad) return { kind: 'blocked', message: bad };
  if (state.kind !== 'ok' || !state.entries) return { kind: 'blocked', message: 'フォルダの中身を読み終えてから、もう一度送ってください' };
  const same = sameNameEntry(rules, state.entries, dir, name);
  if (!same) return { kind: 'create', path };
  if (same.kind === 'dir') return { kind: 'blocked', message: '同じ名前のフォルダがあります' };
  return { kind: 'overwrite', path: childPath(dir, same.name) };
}

/** 項目の親のフォルダ（名前の変更の先） */
export function renameTarget(path: string, to: string): string {
  return childPath(parentOf(path), to);
}
