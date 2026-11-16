// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import FileExplorer from './FileExplorer.svelte';
import { createExplorer, type Explorer } from './explorer';
import { PLAIN_RULES, dir, fakeApi, fakeHost, fakeUrls, file } from './test-support/fakes';
import type { ExplorerHost } from './types';

// 画面が、渡された置き場所（api）と本体（host）だけで動くこと。細かい流れ（同名の確認・貼り付け・ゴミ箱の項目など）は、
// Disnans の側の試験（app/src/components/FileExplorer.test.ts）が、同じ部品に Disnans の実装を渡して確かめている。

const tick = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0));
    flushSync();
  }
};

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  document.body.innerHTML = '';
});

function open(entries = [dir('docs'), file('a.txt'), file('docs/inner.txt'), dir('attachments')], host: Partial<ExplorerHost> = {}, caps = {}) {
  const api = fakeApi(entries);
  let saved: unknown = {};
  const explorer: Explorer = createExplorer({
    api, urls: fakeUrls, rules: PLAIN_RULES, host: fakeHost(host), caps, labels: { root: 'いちばん上', upload: '取り込む' },
    viewStore: { read: () => saved, write: (m) => (saved = m) },
  });
  explorer.selection.desktop = true;
  const target = document.createElement('div');
  document.body.append(target);
  const app = mount(FileExplorer, { target, props: { explorer } });
  cleanup = () => void unmount(app);
  const names = (): string[] => [...target.querySelectorAll('.file-explorer-name-text')].map((n) => n.textContent ?? '');
  return { api, explorer, target, names };
}

describe('エクスプローラーの画面（置き場所と本体は、渡されたもの）', () => {
  it('いちばん上の一覧を読んで並べる（フォルダが先）。フォルダを開くと、その中身になる', async () => {
    const { api, explorer, names } = open();
    await tick();
    expect(api.list).toHaveBeenCalledWith('');
    expect(names()).toEqual(['attachments', 'docs', 'a.txt']);
    explorer.nav.open('docs');
    await tick();
    expect(names()).toEqual(['inner.txt']);
  });

  it('選んでゴミ箱へ: 確認のあと置き場所の trash を呼ぶ。戻せない置き場所では「取り消す」を出さない', async () => {
    const toasts: unknown[][] = [];
    const { api, explorer, target } = open(undefined, { toast: (...a: unknown[]) => toasts.push(a) }, { restore: false });
    await tick();
    explorer.selection.start('a.txt');
    flushSync();
    target.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!.click();
    await tick();
    expect(api.trash).toHaveBeenCalledWith('a.txt');
    expect(toasts).toContainEqual(['1 件をゴミ箱に移しました', 'info', undefined]);
  });

  it('添付のフォルダの無い置き場所では、attachments という名前のフォルダも選んで消せる', async () => {
    const { api, explorer, target } = open();
    await tick();
    explorer.selection.start('attachments');
    flushSync();
    const del = target.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!;
    expect(del.disabled).toBe(false);
    del.click();
    await tick();
    expect(api.trash).toHaveBeenCalledWith('attachments');
  });
});

describe('置き場所ごとの言葉', () => {
  it('いちばん上の名前は、渡されたものを道筋の先頭に出す', async () => {
    const { target } = open();
    await tick();
    expect(target.querySelector('.file-explorer-crumbs button')!.textContent).toBe('いちばん上');
    expect(target.textContent).not.toContain('共有フォルダ');
  });
});
