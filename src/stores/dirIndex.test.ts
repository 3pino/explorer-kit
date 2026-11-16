import { describe, expect, it, vi } from 'vitest';
import { DirIndex, affects } from './dirIndex.svelte';
import { file } from '../test-support/fakes';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('一覧の手元の写し', () => {
  it('必要になったフォルダだけ読み、読んだものは読み直さない', async () => {
    const list = vi.fn(async () => [file('docs/a.txt')]);
    const index = new DirIndex({ list });
    expect(index.state('docs')).toBeUndefined();
    index.ensure('docs');
    expect(index.state('docs')).toEqual({ kind: 'loading' });
    await tick();
    const st = index.state('docs');
    expect(st?.kind === 'ok' && [...st.entries.keys()]).toEqual(['a.txt']);
    index.ensure('docs');
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('変わった項目に関わる写しだけ捨てる（項目そのもの・親・中身）', async () => {
    const index = new DirIndex({ list: async () => [] });
    for (const d of ['', 'docs', 'docs/sub', 'other']) index.ensure(d);
    await tick();
    index.invalidate('docs/sub');
    expect(index.state('docs')).toBeUndefined();
    expect(index.state('docs/sub')).toBeUndefined();
    expect(index.state('')?.kind).toBe('ok');
    expect(index.state('other')?.kind).toBe('ok');
    expect(affects('docs/sub/deep', 'docs/sub')).toBe(true);
    expect(affects('docs2', 'docs')).toBe(false);
  });

  it('読んでいる途中に捨てられたら、その結果は使わない', async () => {
    let release = (_: never[]): void => {};
    const index = new DirIndex({ list: () => new Promise((r) => (release = r)) });
    index.ensure('docs');
    index.invalidate('docs');
    release([]);
    await tick();
    expect(index.state('docs')).toBeUndefined();
  });

  it('失敗は、無い（missing）とそれ以外（error）に分ける。clear ですべて捨てる', async () => {
    const index = new DirIndex({
      list: async (d) => {
        throw new Error(d === 'gone' ? 'not_found' : 'boom');
      },
      isMissing: (e) => e instanceof Error && e.message === 'not_found',
    });
    index.ensure('gone');
    index.ensure('bad');
    await tick();
    expect(index.state('gone')).toEqual({ kind: 'missing' });
    expect(index.state('bad')).toMatchObject({ kind: 'error', message: 'boom' });
    index.clear();
    expect(index.state('bad')).toBeUndefined();
  });
});
