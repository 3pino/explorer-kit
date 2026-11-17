import { describe, expect, it } from 'vitest';
import { EXPLORER_DRAG_TYPE, basicNameError, inSpecialDir, planUpload, overwriteConfirm, renameAllowed, ruleTexts, sameNameEntry, trashManyConfirm } from './ops';
import { RULES } from './test-support/rules';
import { PLAIN_RULES, dir, file } from './test-support/fakes';

describe('置き場所ごとの決まり（Rules）', () => {
  it('特別なフォルダの無い置き場所では、special という名前は特別でない', () => {
    expect(inSpecialDir(RULES, 'special/a.png')).toBe(true);
    expect(inSpecialDir(PLAIN_RULES, 'special/a.png')).toBe(false);
    expect(renameAllowed(RULES, 'special').ok).toBe(false);
    expect(renameAllowed(PLAIN_RULES, 'special').ok).toBe(true);
    const entries = new Map([['a.png', file('special/a.png')]]);
    expect(sameNameEntry(RULES, entries, 'special', 'A.PNG')?.name).toBe('a.png');
    expect(sameNameEntry(PLAIN_RULES, entries, 'special', 'A.PNG')).toBeUndefined();
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
    expect(trashManyConfirm(RULES, [file('special/a')]).body).toContain('リンクが切れます');
  });

  it('特別なフォルダの文を省いた置き場所では、置き場所を問わない一般の文になる（Disnans など特定のアプリの言葉は出ない）', () => {
    const bare = { specialDir: 'special', nameError: PLAIN_RULES.nameError };
    const t = ruleTexts(bare);
    expect(t).toMatchObject({ root: 'いちばん上', reserved: 'このフォルダは動かせません' });
    expect(renameAllowed(bare, 'special')).toEqual({ ok: false, message: 'このフォルダは動かせません' });
    expect(trashManyConfirm(bare, [file('special/a')]).body).toBe('ゴミ箱から元に戻せます');
    expect(overwriteConfirm(bare, 'special/a.png').body).toBe('今のファイルは消えて、新しいものに入れ替わります。元に戻せません');
    expect(overwriteConfirm(RULES, 'special/a.png').body).toContain('同じ特別なフォルダ');
    expect(overwriteConfirm(RULES, 'docs/a.png').body).toContain('今のファイルは消えて');
    for (const text of Object.values(t).filter((x): x is string => !!x)) expect(text, text).not.toMatch(/Disnans|disnans|添付|サーバー|共有フォルダ/);
    expect(ruleTexts(PLAIN_RULES).cutSkipped).toBe('ゴミ箱のフォルダは動かせないので除きました');
  });

  it('ドラッグの印は、特定のアプリの名前を含まない', () => {
    expect(EXPLORER_DRAG_TYPE).toBe('application/x-explorer-kit-items');
  });
});
