import { describe, expect, it } from 'vitest';
import { basicNameError, inAttachments, planUpload, renameAllowed, sameNameEntry, trashManyConfirm } from './ops';
import { RULES } from './test-support/rules';
import { PLAIN_RULES, dir, file } from './test-support/fakes';

describe('置き場所ごとの決まり（Rules）', () => {
  it('添付のフォルダの無い置き場所では、attachments という名前は特別でない', () => {
    expect(inAttachments(RULES, 'attachments/a.png')).toBe(true);
    expect(inAttachments(PLAIN_RULES, 'attachments/a.png')).toBe(false);
    expect(renameAllowed(RULES, 'attachments').ok).toBe(false);
    expect(renameAllowed(PLAIN_RULES, 'attachments').ok).toBe(true);
    const entries = new Map([['a.png', file('attachments/a.png')]]);
    expect(sameNameEntry(RULES, entries, 'attachments', 'A.PNG')?.name).toBe('a.png');
    expect(sameNameEntry(PLAIN_RULES, entries, 'attachments', 'A.PNG')).toBeUndefined();
  });

  it('どの置き場所でも使えない名前', () => {
    for (const bad of ['', '  ', '.', '..', 'a/b', 'a\nb']) expect(basicNameError(bad), bad).not.toBeNull();
    for (const ok of ['a.txt', 'a:b', '.hidden', 'con']) expect(basicNameError(ok), ok).toBeNull();
  });

  it('送る前に同名を確かめる（一覧が無ければ止める・フォルダは置き換えない・ファイルは上書き）', () => {
    const entries = new Map([['a.txt', file('docs/a.txt')], ['sub', dir('docs/sub')]]);
    expect(planUpload(PLAIN_RULES, 'docs', 'new.txt', { kind: 'ok', entries })).toEqual({ kind: 'create', path: 'docs/new.txt' });
    expect(planUpload(PLAIN_RULES, 'docs', 'a.txt', { kind: 'ok', entries })).toEqual({ kind: 'overwrite', path: 'docs/a.txt' });
    expect(planUpload(PLAIN_RULES, 'docs', 'sub', { kind: 'ok', entries }).kind).toBe('blocked');
    expect(planUpload(PLAIN_RULES, 'docs', 'a.txt', { kind: 'loading' }).kind).toBe('blocked');
    expect(planUpload(PLAIN_RULES, 'docs', '..', { kind: 'ok', entries }).kind).toBe('blocked');
  });

  it('ゴミ箱の確認の文は、この部品から戻せない置き場所では「取り消せる」と書かない', () => {
    expect(trashManyConfirm(PLAIN_RULES, [file('a')], true).body).toBe('ゴミ箱から元に戻せます');
    expect(trashManyConfirm(PLAIN_RULES, [file('a')], false).body).toBe('OS のゴミ箱から元に戻せます');
    expect(trashManyConfirm(RULES, [file('attachments/a')]).body).toContain('本文のリンク');
  });
});
