// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { LONG_PRESS_MS } from '@3pino/ui-kit-web/sortable';
import FileExplorer from './FileExplorer.svelte';
import { EXPLORER_DRAG_TYPE } from './ops';
import type { Entry } from './types';
import { downloadFile, dsk, osDrop, entry, explorer, explorerBuffer, explorerSelection, explorerView, fileExplorer, h, listing, resetUi, dirIndex, switchPlace, place, scopeAs, ui } from './test-support/screen.svelte';

// 画面の流れの試験（書き込み・同名の確認・選択・貼り付け・ゴミ箱・置き場所が変わったとき・戻る・拡大表示など）。
// 置き場所・本体は、メモリの中の偽物（test-support/screen.svelte.ts）。どの置き場所でも成り立つことだけを確かめる
// （アプリが実装を渡したときの配線は、アプリの側の試験が確かめる）。

/** 画面の本体（この部品）のソースの場所。見た目の決まり（CSS）を読む試験で使う */
const KIT = 'src/';

let instance: ReturnType<typeof mount> | undefined;
let target: HTMLElement | undefined;

beforeEach(() => {
  resetUi();
  h.upload.mockReset();
  h.upload.mockImplementation(() => ({ promise: new Promise(() => {}), abort: () => {} }));
  fileExplorer.dir = '';
});
afterEach(async () => {
  dsk.desktop = false;
  dsk.linux = false;
  osDrop.handler = null;
  osDrop.readEntries.mockClear();
  osDrop.releaseId.mockClear();
  if (instance) await unmount(instance);
  target?.remove();
  instance = undefined;
  target = undefined;
  dirIndex.clear();
  ui.confirmReq = null;
  explorerBuffer.clear();
  place.key = 'http://a.test';
  h.copy.mockClear();
  // h.list: mockClear ではなく実装ごとリセット（DnD テストで上書きした mockImplementation を消す）
  h.list.mockReset();
  h.list.mockImplementation(async () => h.current ?? listing);
  h.remove.mockClear();
  h.trash.mockClear();
  h.purge.mockClear();
  h.restore.mockClear();
  h.move.mockClear();
  h.clip = { text: null, image: null, writable: true };
  explorerSelection.clear();
  explorerView.reset();
});

async function render(): Promise<HTMLElement> {
  target = document.createElement('div');
  document.body.appendChild(target);
  instance = mount(FileExplorer, { target, props: { explorer } });
  flushSync();
  await vi.waitFor(() => expect(target!.querySelector('.file-explorer-list')).not.toBeNull());
  return target;
}

/** 操作のメニュー（≡）を開いて、文字の項目を押す */
function menuClick(el: HTMLElement, text: string): void {
  el.querySelector<HTMLButtonElement>('button[aria-label="メニュー"]')!.click();
  flushSync();
  const item = [...document.querySelectorAll<HTMLButtonElement>('.file-explorer-menu .menu-item')].find((b) => b.textContent?.includes(text));
  if (!item) throw new Error(`メニューに「${text}」がありません`);
  item.click();
  flushSync();
}

/** 操作のメニュー（≡）の項目の文字（開いて読み、閉じる） */
function menuLabels(el: HTMLElement): string[] {
  el.querySelector<HTMLButtonElement>('button[aria-label="メニュー"]')!.click();
  flushSync();
  const labels = [...document.querySelectorAll('.file-explorer-menu .menu-item')].map((b) => b.textContent?.trim() ?? '');
  document.querySelector<HTMLButtonElement>('.menu-backdrop')?.click();
  flushSync();
  return labels;
}

/** 上端の貼り付けを押す */
function pasteClick(el: HTMLElement): void {
  el.querySelector<HTMLButtonElement>('.file-explorer-selection button[aria-label="貼り付け"]')!.click();
  flushSync();
}

function pick(el: HTMLElement, file: File): void {
  const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('置き場所の書き込み', () => {
  it('同名のファイルは、確認してから上書きする（確認なしには送らない）', async () => {
    const el = await render();
    pick(el, new File(['x'], 'a.txt'));
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    expect(ui.confirmReq!.body).toContain('消えて');
    expect(h.upload).not.toHaveBeenCalled();
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledWith('a.txt', expect.any(File), expect.any(Function)));
  });

  it('確認で取り消せば、送らない', async () => {
    const el = await render();
    pick(el, new File(['x'], 'a.txt'));
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(false);
    await vi.waitFor(() => expect(el.querySelector('.file-explorer-uploads')).toBeNull());
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('同名のない新しいファイルは、確認なしに送る', async () => {
    const el = await render();
    pick(el, new File(['x'], 'new.txt'));
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledWith('new.txt', expect.any(File), expect.any(Function)));
    expect(ui.confirmReq).toBeNull();
  });

  it('使えない名前は送らず、理由を出す', async () => {
    const el = await render();
    pick(el, new File(['x'], 'a:b.txt'));
    await vi.waitFor(() => expect(el.querySelector('.file-explorer-upload-error')).not.toBeNull());
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('新しいフォルダは、名前を確かめてから作る', async () => {
    const el = await render();
    menuClick(el, '新しいフォルダ');
    const input = document.querySelector<HTMLInputElement>('.file-explorer-mkdir input')!;
    input.value = 'x/y';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLFormElement>('.file-explorer-mkdir')!.requestSubmit();
    await vi.waitFor(() => expect(document.querySelector('.file-explorer-mkdir-error')?.textContent).toContain('使えません'));
    expect(h.mkdir).not.toHaveBeenCalled();
  });

  it('上端は共通の見出し（PanelBar = .top-bar）の 1 行。操作は同じ行にある', async () => {
    const el = await render();
    expect(el.querySelectorAll('header')).toHaveLength(1);
    const bar = el.querySelector('.panel-bar');
    expect(bar?.classList.contains('top-bar')).toBe(true);
    expect(bar?.querySelector('button[aria-label="メニュー"]')).not.toBeNull();
    expect(bar?.querySelector('.file-explorer-selection')).not.toBeNull();
    expect(bar?.querySelector('.file-explorer-crumbs')).toBeNull();
    // パンくずは、上端の直後の行（バーの下）
    expect(bar?.nextElementSibling?.classList.contains('file-explorer-crumbs')).toBe(true);
  });
});

describe('上端のバーの件数・操作（選んでいなくても同じバーを出す）', () => {
  it('選んでいないときは、件数（フォルダの項目数）を出し、コピー・切り取り・削除は押せない', async () => {
    const el = await render();
    expect(el.querySelector('.file-explorer-selection-count')?.textContent).toBe('3 件');
    for (const label of ['コピー', '切り取り', '削除']) {
      expect(el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.disabled, label).toBe(true);
    }
  });

  it('選ぶと「N 件選択中」になり、操作が押せる。空きスペースで解除すると件数に戻る', async () => {
    const el = await render();
    explorerSelection.enter();
    flushSync();
    expect(el.querySelector('.file-explorer-selection-count')?.textContent).toBe('0 件選択中');
    expect(el.querySelector<HTMLButtonElement>('button[aria-label="コピー"]')?.disabled).toBe(true);
    const row = [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].find((li) => li.textContent?.includes('a.txt'))!;
    row.querySelector<HTMLButtonElement>('.file-explorer-row')!.click();
    flushSync();
    expect(el.querySelector('.file-explorer-selection-count')?.textContent).toBe('1 件選択中');
    expect(el.querySelector<HTMLButtonElement>('button[aria-label="コピー"]')?.disabled).toBe(false);
  });

  it('「選択をやめる」と「移動」は無い（切り取り＋貼り付けで足りる）', async () => {
    const el = await render();
    explorerSelection.enter();
    flushSync();
    expect(el.textContent).not.toContain('選択をやめる');
    expect(el.querySelector('button[aria-label="移動"]')).toBeNull();
    expect(el.querySelector('button[aria-label="閉じる"]')).toBeNull();
  });

  it('空きスペースを押すと選択を解除する。項目・パンくず・バーは解除しない', async () => {
    const el = await render();
    explorerSelection.enter();
    explorerSelection.toggle('a.txt');
    flushSync();
    el.querySelector<HTMLElement>('.file-explorer-selection-count')!.click();
    el.querySelector<HTMLElement>('.file-explorer-crumbs')!.click();
    el.querySelector<HTMLElement>('.file-explorer-item')!.click();
    flushSync();
    expect(explorerSelection.active).toBe(true);
    el.querySelector<HTMLElement>('.file-explorer-body')!.click();
    flushSync();
    expect(explorerSelection.active).toBe(false);
    expect(explorerSelection.count).toBe(0);
  });

  it('切り取りでは、できたことの通知を出さない（貼り付けが押せるようになる）', async () => {
    const el = await render();
    explorerSelection.enter();
    explorerSelection.toggle('a.txt');
    flushSync();
    el.querySelector<HTMLButtonElement>('button[aria-label="切り取り"]')!.click();
    flushSync();
    expect(explorerBuffer.mode).toBe('move');
    expect(ui.toasts.some((t) => t.text.includes('切り取りました'))).toBe(false);
  });
});

describe('項目の操作と貼り付け（コピー・切り取り・移動）', () => {
  function itemMenuLabels(el: HTMLElement, name: string): string[] {
    el.querySelector<HTMLButtonElement>(`button[aria-label="${name} の操作"]`)!.click();
    flushSync();
    return [...document.querySelectorAll('.explorer-entry-menu-item')].map((b) => b.textContent?.trim() ?? '');
  }

  it('「…」はプロパティだけ（フォルダもファイルも）', async () => {
    const el = await render();
    expect(itemMenuLabels(el, 'docs')).toEqual(['プロパティ']);
    // 開いたメニューを閉じる（外側を押す）
    document.querySelector<HTMLButtonElement>('.menu-backdrop')?.click();
    flushSync();
    expect(itemMenuLabels(el, 'a.txt')).toEqual(['プロパティ']);
  });

  it('貼り付けは選択のバーの中、削除の左。何も無ければ押せない（≡ には出さない）', async () => {
    const el = await render();
    const labels = [...el.querySelectorAll('.file-explorer-selection-actions button')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['コピー', '切り取り', '貼り付け', '削除']);
    const btn = el.querySelector<HTMLButtonElement>('.file-explorer-selection button[aria-label="貼り付け"]')!;
    expect(btn.disabled).toBe(true);
    explorerBuffer.set('copy', [{ path: 'x/b.txt', kind: 'file' }]);
    flushSync();
    expect(btn.disabled).toBe(false);
    expect(menuLabels(el)).not.toContain('貼り付け');
    expect(menuLabels(el)).not.toContain('アップロード');
  });

  it('コピーしたものを貼り付けると、同名は確認してから上書きで送る', async () => {
    const el = await render();
    explorerBuffer.set('copy', [{ path: 'x/a.txt', kind: 'file' }]);
    flushSync();
    pasteClick(el);
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    expect(ui.confirmReq!.body).toContain('消えて');
    expect(h.copy).not.toHaveBeenCalled();
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.copy).toHaveBeenCalledWith('x/a.txt', 'a.txt', true));
    // コピーは残る（何度でも貼り付けられる）
    expect(explorerBuffer.empty).toBe(false);
  });

  it('切り取りの貼り付けで、上書きを取り消したものは、送らずバッファに残す（もう一度貼り付けられる）', async () => {
    const el = await render();
    explorerBuffer.set('move', [{ path: 'x/a.txt', kind: 'file' }]);
    flushSync();
    pasteClick(el);
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(false);
    await vi.waitFor(() => expect(ui.confirmReq).toBeNull());
    expect(h.copy).not.toHaveBeenCalled();
    expect(explorerBuffer.items.map((i) => i.path)).toEqual(['x/a.txt']);
  });

  it('切り取りの途中の項目は薄く出す（貼り付けるまで残る）', async () => {
    const el = await render();
    explorerBuffer.set('move', [{ path: 'a.txt', kind: 'file' }]);
    flushSync();
    expect(el.querySelector('.file-explorer-item-cut')?.textContent).toContain('a.txt');
  });
});

describe('複数選択（選択モード）', () => {
  function rowOf(el: HTMLElement, name: string): HTMLElement {
    return [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].find((li) => li.textContent?.includes(name))!;
  }
  function pressRow(el: HTMLElement, name: string) {
    rowOf(el, name).querySelector<HTMLButtonElement>('.file-explorer-row')!.click();
    flushSync();
  }

  it('≡ に「選択モード」と「一覧」は無い', async () => {
    const el = await render();
    const labels = menuLabels(el);
    expect(labels.some((l) => l.includes('選択モード'))).toBe(false);
    expect(labels.some((l) => l.startsWith('一覧'))).toBe(false);
    expect(labels.some((l) => l.startsWith('詳細'))).toBe(true);
  });

  it('選択モードでは、行を押すと選び直す（開かない）。件数を出す', async () => {
    const el = await render();
    explorerSelection.enter();
    flushSync();
    pressRow(el, 'a.txt');
    pressRow(el, 'docs');
    expect(el.querySelector('.file-explorer-selection-count')?.textContent).toContain('2 件選択中');
    expect(fileExplorer.dir).toBe('');
    expect(rowOf(el, 'docs').querySelector('.file-explorer-row')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('長押しで選択モードに入り、その項目を選ぶ（押したあとのクリックでは開かない）', async () => {
    vi.useFakeTimers();
    try {
      const el = await render();
      const row = rowOf(el, 'docs');
      row.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
      vi.advanceTimersByTime(LONG_PRESS_MS + 20);
      flushSync();
      expect(explorerSelection.active).toBe(true);
      expect(explorerSelection.has('docs')).toBe(true);
      // 離したあとのクリックは、フォルダを開かない
      row.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      rowOf(el, 'docs').querySelector<HTMLButtonElement>('.file-explorer-row')!.click();
      flushSync();
      expect(fileExplorer.dir).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('コピーは、フォルダも含めてバッファに入れ、選択を終える', async () => {
    const el = await render();
    explorerSelection.enter();
    flushSync();
    pressRow(el, 'a.txt');
    pressRow(el, 'docs');
    [...el.querySelectorAll<HTMLButtonElement>('button[aria-label="コピー"]')][0].click();
    flushSync();
    expect(explorerBuffer.mode).toBe('copy');
    expect(explorerBuffer.items).toEqual([
      { path: 'a.txt', kind: 'file' },
      { path: 'docs', kind: 'dir' },
    ]);
    expect(explorerSelection.active).toBe(false);
  });

  it('選択中の「戻る」（Alt+← など）は、選択モードを終える。フォルダは戻らない', async () => {
    fileExplorer.dir = 'docs';
    await render();
    const before = ui.pluginBack.length;
    explorerSelection.start('docs/x');
    flushSync();
    expect(ui.pluginBack).toHaveLength(before + 1);
    expect(ui.back()).toBe(true);
    flushSync();
    expect(explorerSelection.active).toBe(false);
    expect(fileExplorer.dir).toBe('docs');
    // 選択していなければ、戻る操作には何も足さない
    expect(ui.pluginBack).toHaveLength(before);
  });

  it('削除はゴミ箱に移す（まとめて 1 回確認、取り消すトーストが出る）', async () => {
    const el = await render();
    explorerSelection.enter();
    flushSync();
    pressRow(el, 'a.txt');
    pressRow(el, 'docs');
    el.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    expect(ui.confirmReq!.title).toBe('2 件をゴミ箱に移しますか');
    expect(h.trash).not.toHaveBeenCalled();
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.trash).toHaveBeenCalledTimes(2));
    expect(h.trash.mock.calls.map((c) => c[0])).toEqual(['a.txt', 'docs']);
    // 取り消すトーストが出る
    expect(ui.toasts.some((t) => t.text?.includes('ゴミ箱に移しました') && t.action?.label === '取り消す')).toBe(true);
  });

  it('ゴミ箱 undo: 成功した ID のみスナップショット（失敗した項目は含まれない）', async () => {
    // a.txt は成功、docs は失敗
    h.trash
      .mockResolvedValueOnce({ id: 'id-a', original_path: 'a.txt', kind: 'file', size: 1, deleted_at: 0 })
      .mockRejectedValueOnce(new Error('fail'));
    const el = await render();
    explorerSelection.enter();
    flushSync();
    pressRow(el, 'a.txt');
    pressRow(el, 'docs');
    el.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.action?.label === '取り消す')).toBe(true));
    // 成功トースト: id-a のみ
    const undoToast = ui.toasts.find((t) => t.action?.label === '取り消す');
    expect(undoToast).toBeTruthy();
    // undo を実行したら id-a だけ restore を呼ぶ
    h.restore.mockResolvedValueOnce({ name: 'a.txt', path: 'a.txt', kind: 'file', size: 1, modified: 0, mime: null });
    undoToast!.action!.run();
    await vi.waitFor(() => expect(h.restore).toHaveBeenCalledTimes(1));
    // 削除の応答（id-a）の ID で戻す（失敗した docs の ID は含まない）
    expect(h.restore.mock.calls[0][0]).toBe('id-a');
  });

  it('ゴミ箱 undo: 置き場所が変わっていたら restore を送らない', async () => {
    const el = await render();
    explorerSelection.enter();
    flushSync();
    pressRow(el, 'a.txt');
    el.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.trash).toHaveBeenCalledTimes(1));
    const undoToast = ui.toasts.find((t) => t.action?.label === '取り消す');
    expect(undoToast).toBeTruthy();
    // 置き場所を変更したことをシミュレート（置き場所の見分けが別の値を返す）
    const spy = scopeAs('http://other:3000');
    try {
      undoToast!.action!.run();
      await new Promise((r) => setTimeout(r, 50));
      // restore は呼ばれない
      expect(h.restore).not.toHaveBeenCalled();
      // エラートーストが出る
      await vi.waitFor(() => expect(ui.toasts.some((t) => t.kind === 'error')).toBe(true));
    } finally {
      spy.mockRestore();
    }
  });

  it('削除後にカットバッファから成功したパスを除去する（trash→paste でnot_found にならない）', async () => {
    const el = await render();
    // a.txt をカットバッファに入れる
    explorerBuffer.set('move', [{ path: 'a.txt', kind: 'file' }]);
    flushSync();
    expect(explorerBuffer.empty).toBe(false);
    // a.txt を選択してゴミ箱へ
    explorerSelection.enter();
    flushSync();
    pressRow(el, 'a.txt');
    el.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.trash).toHaveBeenCalledTimes(1));
    // バッファから a.txt が除去されている
    expect(explorerBuffer.items.map((i) => i.path)).not.toContain('a.txt');
  });

  it('複数ファイルアップロード: 1 件目成功後も 2 件目の同名確認が機能する', async () => {
    // a.txt と b.txt をピッカーで選ぶ。b.txt は既存（overwrite 確認が出る）
    h.current = [{ name: 'b.txt', path: 'b.txt', kind: 'file' as const, size: 1, modified: 0, mime: null }];
    try {
    let uploadCount = 0;
    h.upload.mockImplementation(() => {
      uploadCount++;
      return {
        promise: Promise.resolve({ name: 'x', path: 'x', kind: 'file' as const, size: 0, modified: 0, mime: null }),
        abort: () => {},
      };
    });
    const el = await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    const a = new File(['a'], 'a.txt', { type: 'text/plain' });
    const b = new File(['b'], 'b.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', { value: [a, b], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // a.txt は新規 → 即 upload
    await vi.waitFor(() => expect(uploadCount).toBeGreaterThanOrEqual(1));
    // b.txt は既存 → confirm が出る
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    expect(ui.confirmReq!.title).toContain('b.txt');
    ui.confirmReq!.resolve(true); // 上書き許可
    await vi.waitFor(() => expect(uploadCount).toBe(2));
    } finally {
      h.current = null; // 次のテストのために元に戻す
    }
  });
});

describe('内部 DnD（performInternalTransfer）', () => {
  it('drop 先が未読のとき api.list を呼んで一覧取得後に移動（1 回で完結）', async () => {
    // dirIndex に docs の中身がないとき、performInternalTransfer 内で list を呼ぶ
    // jsdom での DragEvent はフル再現が困難なので、動作結果（api.list の呼び出し数と move 呼出）で検証する
    h.list.mockImplementation(async (path?: string) => {
      // docs のキャッシュがないのでリクエストが来る想定
      if (path === 'docs') return []; // 空フォルダ（同名なし）
      return h.current ?? listing;
    });
    h.move.mockResolvedValueOnce({ name: 'a.txt', path: 'docs/a.txt', kind: 'file' as const, size: 1, modified: 0, mime: null });

    await render();
    // list が初期ロードで呼ばれた後のカウントを記録
    const countBefore = h.list.mock.calls.length;

    // dirIndex の docs キャッシュをクリア（未読状態を再現）
    dirIndex.invalidate('docs/x');
    flushSync();

    // 内部 move の実行: explorerBuffer に a.txt を入れ、fileExplorer を docs へ移動して paste
    // paste() は別のコードパス（performInternalTransfer でなく直接 runTransfer）だが、
    // fetchDestEntries 相当の動作（list 呼び出し）を通じて docs の中身を取得する
    explorerBuffer.set('move', [{ path: 'a.txt', kind: 'file' }]);
    fileExplorer.open('docs'); // docs へ移動
    flushSync();
    // docs の一覧が読み込まれるまで待つ
    await vi.waitFor(() => expect(h.list).toHaveBeenCalledWith('docs'));
    // docs 一覧取得後に paste（fetchDestEntries 経由）
    pasteClick(document.body as unknown as HTMLElement); // paste は body がなくても動く

    // 最終的に list('docs') が呼ばれ、同名なし → move が呼ばれる
    await vi.waitFor(() => expect(h.move).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(h.move).toHaveBeenCalledWith('a.txt', 'docs/a.txt', false);
    expect(h.list.mock.calls.length).toBeGreaterThan(countBefore);
  });
});


describe('表示方法と並び順', () => {
  it('アイコン（グリッド）は、画像だけ小さい画像を出す（フォルダ・ほかは絵のアイコン）', async () => {
    explorerView.setView('', 'grid');
    const el = await render();
    expect(el.querySelector('.file-explorer-view-grid')).not.toBeNull();
    const imgs = [...el.querySelectorAll<HTMLImageElement>('.file-explorer-thumb img')];
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toContain('/pic.png');
    expect(el.querySelector('.file-explorer-thumb svg')).not.toBeNull();
  });

  it('アイコン表示では、PDF はサムネイルの部品（1 ページ目）を出す。大きすぎる PDF とほかのファイルは絵のアイコン', async () => {
    h.current = [
      { ...entry('doc.pdf'), mime: 'application/pdf' },
      { ...entry('huge.pdf'), mime: 'application/pdf', size: 200 * 1024 * 1024 },
      entry('a.txt'),
    ];
    explorerView.setView('', 'grid');
    try {
      const el = await render();
      const item = (n: string) => [...el.querySelectorAll('.file-explorer-item')].find((li) => li.textContent?.includes(n))!;
      expect(item('doc.pdf').querySelector('.pdf-thumb')).not.toBeNull();
      expect(item('huge.pdf').querySelector('.pdf-thumb')).toBeNull();
      expect(item('a.txt').querySelector('.pdf-thumb')).toBeNull();
    } finally {
      h.current = null;
    }
  });

  it('PDF も画像も、同じ拡大表示（種類は kind）で開き、前後は両方を並び順で', async () => {
    h.current = [{ ...entry('doc.pdf'), mime: 'application/pdf' }, { ...entry('pic.png'), mime: 'image/png' }];
    try {
      const el = await render();
      const row = (n: string) => [...el.querySelectorAll('.file-explorer-item')].find((li) => li.textContent?.includes(n))!.querySelector<HTMLElement>('.file-explorer-row')!;
      expect(row('doc.pdf').tagName).toBe('BUTTON');
      row('doc.pdf').querySelector<HTMLElement>('.file-explorer-icon')!.click();
      expect(ui.lightbox).toMatchObject({ alt: 'doc.pdf', kind: 'pdf' });
      expect(ui.lightbox!.src).toContain('/doc.pdf');
      expect(ui.lightboxGallery!().map((i) => i.alt)).toEqual(['doc.pdf', 'pic.png']);
      ui.lightbox = null;
      row('pic.png').querySelector<HTMLElement>('.file-explorer-icon')!.click();
      expect(ui.lightbox).toMatchObject({ alt: 'pic.png', kind: 'image' });
    } finally {
      h.current = null;
      ui.lightbox = null;
    }
  });

  it('アイコン表示の枠に地の色は付けない。選んだ項目の「…」に色を付けるのは詳細だけ', async () => {
    const { readFileSync } = await import('node:fs');
    const css = (readFileSync(KIT + 'FileExplorer.svelte', 'utf8').split('<style>')[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const thumb = css.match(/\.file-explorer-thumb \{[^}]*\}/)![0];
    expect(thumb).not.toMatch(/background/);
    const dots = css.match(/[^{}]*explorer-entry-menu-button\)[^{}]*\{[^}]*\}/g) ?? [];
    expect(dots.length).toBeGreaterThan(0);
    for (const rule of dots) expect(rule).toMatch(/file-explorer-view-details/);
  });

  it('サムネイルは欠けないよう、全体を枠に収める（object-fit: contain）', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of [KIT + 'FileExplorer.svelte']) {
      const css = readFileSync(file, 'utf8').split('<style>')[1] ?? '';
      expect(css, file).toMatch(/object-fit:\s*contain/);
      expect(css, file).not.toMatch(/object-fit:\s*cover/);
    }
  });

  it('詳細は列の見出しを出し、種類・サイズ・更新日時を各項目に出す', async () => {
    const el = await render();
    const heads = [...el.querySelectorAll('.file-explorer-columns span:not(.file-explorer-col-actions)')].map((x) => x.textContent);
    expect(heads).toEqual(['名前', '種類', 'サイズ', '更新日時']);
    const pic = [...el.querySelectorAll('.file-explorer-item')].find((li) => li.textContent?.includes('pic.png'))!;
    expect(pic.querySelector('.file-explorer-col-kind')?.textContent).toBe('画像');
    expect(pic.querySelector('.file-explorer-col-size')?.textContent).toBe('9 B');
  });

  it('並び順を変えると、フォルダを先に、名前の降順で並ぶ', async () => {
    explorerView.setSort('', 'name', 'desc');
    const el = await render();
    const names = [...el.querySelectorAll('.file-explorer-item .file-explorer-name')].map((x) => x.textContent);
    expect(names).toEqual(['docs', 'pic.png', 'a.txt']);
  });

  it('操作のメニューの「表示」で選ぶと、開いているフォルダだけその表示になる', async () => {
    fileExplorer.dir = 'docs';
    const el = await render();
    menuClick(el, 'アイコン');
    expect(explorerView.of('docs').view).toBe('grid');
    expect(explorerView.of('').view).toBe('details');
    expect(el.querySelector('.file-explorer-view-grid')).not.toBeNull();
  });

  it('既定は詳細。「…」は詳細でも各行に出す', async () => {
    const el = await render();
    expect(el.querySelector('.file-explorer-view-details')).not.toBeNull();
    expect(el.querySelectorAll('.file-explorer-view-details .explorer-entry-actions')).toHaveLength(3);
  });
});

describe('操作メニューは外側の幕より前にある（押せない不具合の再発防止）', () => {
  // jsdom は、コンポーネントの（スコープの）CSS を当てないので、ここでは書き方を見る。
  // 実際の押し方（タッチ）の検査は app/scripts/touch-check.mjs（ブラウザが要る・vitest の外）
  it('メニューの見た目に z-index を書かない（design-system の .menu が幕（-1）より前に出る）', async () => {
    const { readFileSync } = await import('node:fs');
    // テストは app/ で動く（npm test）
    for (const file of [KIT + 'FileExplorer.svelte', KIT + 'EntryActions.svelte']) {
      const css = (readFileSync(file, 'utf8').split('<style>')[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
      const menuRules = css.match(/[^{}]*(file-explorer-popup-menu|explorer-entry-menu)[^{}]*\{[^}]*\}/g) ?? [];
      expect(menuRules.length, file).toBeGreaterThan(0);
      for (const rule of menuRules) expect(rule, file).not.toMatch(/z-index/);
    }
  });
});

describe('特別なフォルダ（special/ そのもの）は動かせない・消せない（グレー、理由つき）', () => {
  it('special を選ぶと、切り取り・削除がグレーで理由を出す。名前を押しても書き換えにならない', async () => {
    h.current = [entry('special', 'dir'), entry('a.txt')];
    try {
      const el = await render();
      explorerSelection.start('special');
      flushSync();
      for (const t of ['切り取り', '削除']) {
        const b = el.querySelector<HTMLButtonElement>(`button[aria-label="${t}"]`)!;
        expect(b.disabled, t).toBe(true);
        expect(b.title, t).toContain('特別なフォルダは動かせません');
      }
      expect(el.querySelector<HTMLButtonElement>('button[aria-label="コピー"]')!.disabled).toBe(false);
      explorerSelection.clear();
      explorerSelection.start('a.txt');
      flushSync();
      expect(el.querySelector<HTMLButtonElement>('button[aria-label="切り取り"]')!.disabled).toBe(false);
      explorerSelection.clear();
      flushSync();
      const name = [...el.querySelectorAll<HTMLElement>('.file-explorer-name-text')].find((n) => n.textContent === 'special')!;
      name.click();
      flushSync();
      expect(el.querySelector('.file-explorer-rename')).toBeNull();
      expect(fileExplorer.dir).toBe('special');
    } finally {
      h.current = null;
    }
  });
});

describe('名前の変更（名前を押すと、その場で入力欄になる）', () => {
  function nameOf(el: HTMLElement, name: string): HTMLElement {
    return [...el.querySelectorAll<HTMLElement>('.file-explorer-name-text')].find((n) => n.textContent === name)!;
  }
  function type(input: HTMLTextAreaElement, value: string): void {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('名前を押すと入力欄に置き換わり（全画面のダイアログは出さない）、Enter で変える', async () => {
    const el = await render();
    nameOf(el, 'docs').click();
    flushSync();
    expect(fileExplorer.dir).toBe('');
    expect(document.querySelector('.modal')).toBeNull();
    const input = el.querySelector<HTMLTextAreaElement>('.file-explorer-item textarea.file-explorer-rename')!;
    expect(input.value).toBe('docs');
    type(input, 'papers');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(h.move).toHaveBeenCalledWith('docs', 'papers'));
    await vi.waitFor(() => expect(el.querySelector('.file-explorer-rename')).toBeNull());
  });

  it('名前の書き換えでは、注意の文を出さない（ふつうのフォルダでも special の中でも）', async () => {
    h.current = [{ ...entry('a.png'), path: 'special/a.png' }, entry('b.txt')];
    try {
      const el = await render();
      nameOf(el, 'a.png').click();
      flushSync();
      expect(el.querySelector('.file-explorer-rename')).not.toBeNull();
      expect(el.querySelector('.file-explorer-rename-note')).toBeNull();
      el.querySelector<HTMLTextAreaElement>('.file-explorer-rename')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      flushSync();
      nameOf(el, 'b.txt').click();
      flushSync();
      expect(el.querySelector('.file-explorer-rename')).not.toBeNull();
      expect(el.textContent).not.toContain('リンクは切れます');
      expect(el.querySelector('.file-explorer-rename-note')).toBeNull();
    } finally {
      h.current = null;
    }
  });

  it('Esc で取り消す（変えない）。使えない名前は理由を出して入力欄のまま', async () => {
    const el = await render();
    nameOf(el, 'a.txt').click();
    flushSync();
    let input = el.querySelector<HTMLTextAreaElement>('.file-explorer-rename')!;
    type(input, 'b:c.txt');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushSync();
    expect(el.querySelector('.file-explorer-rename-error')?.textContent).toContain('使えません');
    expect(h.move).not.toHaveBeenCalled();
    input = el.querySelector<HTMLTextAreaElement>('.file-explorer-rename')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(el.querySelector('.file-explorer-rename')).toBeNull();
    expect(h.move).not.toHaveBeenCalled();
  });

  it('名前の外（行のほか）を押すと、普通に開く。選択モードでは名前を押しても選び直すだけ', async () => {
    const el = await render();
    const row = [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].find((li) => li.textContent?.includes('docs'))!;
    explorerSelection.enter();
    flushSync();
    nameOf(el, 'docs').click();
    flushSync();
    expect(explorerSelection.has('docs')).toBe(true);
    expect(el.querySelector('.file-explorer-rename')).toBeNull();
    explorerSelection.clear();
    flushSync();
    row.querySelector<HTMLElement>('.file-explorer-icon')!.click();
    flushSync();
    expect(fileExplorer.dir).toBe('docs');
  });
});

describe('選択の印', () => {
  it('選んでいない印は灰色（印の色を付けない）、選んだ印だけ水色', async () => {
    const el = await render();
    explorerSelection.start('a.txt');
    flushSync();
    const checks = [...el.querySelectorAll('.file-explorer-check')];
    expect(checks).toHaveLength(3);
    expect(checks.filter((c) => c.classList.contains('file-explorer-check-on'))).toHaveLength(1);
  });
});

describe('空きスペースの長押し・右クリックのメニュー', () => {
  function ctxLabels(): string[] {
    return [...document.querySelectorAll('.file-explorer-context .menu-item')].map((b) => b.textContent?.trim() ?? '');
  }

  it('長押しでアップロードのメニューが出る。何も無ければ貼り付けは出さない', async () => {
    vi.useFakeTimers();
    try {
      const el = await render();
      const body = el.querySelector<HTMLElement>('.file-explorer-body')!;
      body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 600 }));
      vi.advanceTimersByTime(LONG_PRESS_MS + 20);
      flushSync();
      expect(ctxLabels()).toEqual(['アップロード', '新しいフォルダ']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('項目の上の長押しでは出さない（項目の選択になる）', async () => {
    vi.useFakeTimers();
    try {
      const el = await render();
      el.querySelector<HTMLElement>('.file-explorer-item')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
      vi.advanceTimersByTime(LONG_PRESS_MS + 20);
      flushSync();
      expect(document.querySelector('.file-explorer-context')).toBeNull();
      expect(explorerSelection.active).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('右クリックでも出る。クリップボードに文字があれば貼り付けも出し、押すと .txt にして送る', async () => {
    h.clip.text = 'hello';
    const el = await render();
    el.querySelector<HTMLElement>('.file-explorer-body')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 600 }));
    await vi.waitFor(() => expect(ctxLabels()).toEqual(['アップロード', '新しいフォルダ', '貼り付け']));
    [...document.querySelectorAll<HTMLButtonElement>('.file-explorer-context .menu-item')].find((b) => b.textContent?.includes('貼り付け'))!.click();
    flushSync();
    expect(document.querySelector('.file-explorer-context')).toBeNull();
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledWith(expect.stringMatching(/^clipboard-\d{8}-\d{6}\.txt$/), expect.any(File), expect.any(Function)));
  });
});

describe('OS のクリップボードとの同期', () => {
  async function selectAndPress(el: HTMLElement, path: string, label: string): Promise<void> {
    explorerSelection.start(path);
    flushSync();
    el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
    flushSync();
    await vi.waitFor(() => expect(explorerBuffer.clipText).not.toBeNull());
  }

  it('コピーすると、項目のパスを OS のクリップボードにも書く。そのまま貼ればアプリ内のコピー', async () => {
    fileExplorer.dir = '';
    const el = await render();
    await selectAndPress(el, 'a.txt', 'コピー');
    expect(h.clip.text).toBe('a.txt');
    // 別のフォルダへ貼る
    fileExplorer.open('docs');
    await vi.waitFor(() => expect(el.querySelector('.file-explorer-list')).not.toBeNull());
    pasteClick(el);
    // 仮の一覧はどのフォルダも同じ（a.txt がある）ので、上書きの確認が出る
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.copy).toHaveBeenCalledWith('a.txt', 'docs/a.txt', true));
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('コピーのあとに、ほかで文字をコピーし直していれば、その文字を貼る（バッファは貼らない）', async () => {
    const el = await render();
    await selectAndPress(el, 'a.txt', 'コピー');
    h.clip.text = 'other';
    pasteClick(el);
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalled());
    expect(h.copy).not.toHaveBeenCalled();
  });

  it('ほかで画像をコピーし直していれば、画像を送る', async () => {
    const el = await render();
    await selectAndPress(el, 'a.txt', 'コピー');
    h.clip.text = null;
    h.clip.image = new File(['x'], 'clipboard-1.png', { type: 'image/png' });
    pasteClick(el);
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledWith('clipboard-1.png', expect.any(File), expect.any(Function)));
    expect(h.copy).not.toHaveBeenCalled();
  });

  it('クリップボードに書けなかったときは、バッファを貼る（クリップボードの古い中身は貼らない）', async () => {
    h.clip.text = 'old';
    h.clip.writable = false;
    const el = await render();
    explorerSelection.start('a.txt');
    flushSync();
    el.querySelector<HTMLButtonElement>('button[aria-label="コピー"]')!.click();
    flushSync();
    await Promise.resolve();
    fileExplorer.open('docs');
    await vi.waitFor(() => expect(el.querySelector('.file-explorer-list')).not.toBeNull());
    pasteClick(el);
    // 仮の一覧はどのフォルダも同じ（a.txt がある）ので、上書きの確認が出る
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.copy).toHaveBeenCalledWith('a.txt', 'docs/a.txt', true));
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('Ctrl+V（入力欄の外）で、OS のファイルを送る。入力欄の中の貼り付けは邪魔しない', async () => {
    await render();
    const file = new File(['x'], 'from-os.pdf');
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(ev, 'clipboardData', { value: { files: [file], getData: () => '' } });
    document.body.dispatchEvent(ev);
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledWith('from-os.pdf', file, expect.any(Function)));
    expect(ev.defaultPrevented).toBe(true);
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    const ev2 = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(ev2, 'clipboardData', { value: { files: [file], getData: () => '' } });
    input.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(false);
    input.remove();
  });
});

describe('拡大表示（前後は、このフォルダの拡大表示で見られるものを今の並び順で）', () => {
  it('画像を開くと、前後は画像と PDF（並び順どおり）。ほかのファイルは含めない', async () => {
    const img = (name: string): Entry => ({ ...entry(name), mime: 'image/png' });
    h.current = [img('b.png'), entry('note.txt'), img('a.png'), { ...entry('doc.pdf'), mime: 'application/pdf' }, img('c.png')];
    try {
      const el = await render();
      const row = [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].find((li) => li.textContent?.includes('b.png'))!;
      row.querySelector<HTMLButtonElement>('.file-explorer-row')!.click();
      flushSync();
      expect(ui.lightbox?.alt).toBe('b.png');
      const gallery = ui.lightboxGallery!();
      expect(gallery.map((i) => i.alt)).toEqual(['a.png', 'b.png', 'c.png', 'doc.pdf']);
      // いま開いているものが、並びの 2 番目
      expect(gallery.map((i) => i.src).indexOf(ui.lightbox!.src)).toBe(1);
    } finally {
      h.current = null;
      ui.lightbox = null;
      ui.lightboxGallery = null;
    }
  });
});

describe('戻る（前に開いていたフォルダへ）', () => {
  it('「戻る」は、親ではなく前に開いていたフォルダへ。履歴が尽きたらパネルの戻るに任せる', async () => {
    ui.pluginBack = [];
    const el = await render();
    fileExplorer.open('docs');
    flushSync();
    fileExplorer.open('');
    flushSync();
    fileExplorer.open('docs');
    flushSync();
    expect(ui.pluginBack).toHaveLength(1);
    ui.back();
    flushSync();
    expect(fileExplorer.dir).toBe('');
    ui.back();
    flushSync();
    expect(fileExplorer.dir).toBe('docs');
    ui.back();
    flushSync();
    expect(fileExplorer.dir).toBe('');
    expect(ui.pluginBack).toHaveLength(0);
    void el;
  });

  it('選択モードの「戻る」は、フォルダを戻らず選択だけ解除する', async () => {
    ui.pluginBack = [];
    await render();
    fileExplorer.open('docs');
    flushSync();
    explorerSelection.start('docs/a.txt');
    flushSync();
    ui.back();
    flushSync();
    expect(explorerSelection.active).toBe(false);
    expect(fileExplorer.dir).toBe('docs');
  });
});

describe('選択モードの解除', () => {
  it('最後の 1 件を外すと、すぐ選択モードを終える', async () => {
    const el = await render();
    explorerSelection.start('a.txt');
    flushSync();
    const row = [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].find((li) => li.textContent?.includes('a.txt'))!;
    row.querySelector<HTMLButtonElement>('.file-explorer-row')!.click();
    flushSync();
    expect(explorerSelection.active).toBe(false);
    expect(el.querySelector('.file-explorer-check')).toBeNull();
  });
});

describe('タッチの長押し（Android）', () => {
  function touchDown(li: Element): void {
    const ev = new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 });
    Object.defineProperty(ev, 'pointerType', { value: 'touch' });
    li.dispatchEvent(ev);
  }

  it('こちらのタイマーより先に止められても、WebView の長押し（contextmenu）で選択モードに入る', async () => {
    const el = await render();
    const li = el.querySelector<HTMLElement>('.file-explorer-item')!;
    touchDown(li);
    li.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    const ctx = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    li.dispatchEvent(ctx);
    flushSync();
    expect(explorerSelection.active).toBe(true);
    expect(ctx.defaultPrevented).toBe(true);
  });

  it('マウスの右クリックでは、選択モードに入らない', async () => {
    const el = await render();
    const li = el.querySelector<HTMLElement>('.file-explorer-item')!;
    li.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    flushSync();
    expect(explorerSelection.active).toBe(false);
  });
});

describe('クリップボードから貼ったら、すぐ名前の書き換え', () => {
  it('画像を貼ると、送り終えて一覧に出たところで、その項目の名前が入力欄になる', async () => {
    h.clip.image = new File(['x'], 'clipboard-1.png', { type: 'image/png' });
    h.upload.mockImplementation(() => ({ promise: Promise.resolve(), abort: () => {} }));
    const el = await render();
    h.current = [...listing, { ...entry('clipboard-1.png'), mime: 'image/png' }];
    try {
      pasteClick(el);
      await vi.waitFor(() => expect(el.querySelector<HTMLTextAreaElement>('.file-explorer-rename')?.value).toBe('clipboard-1.png'));
    } finally {
      h.current = null;
    }
  });
});

describe('詳細の見出し', () => {
  it('縦にスクロールしても上端に残し、文字は選べない', async () => {
    const { readFileSync } = await import('node:fs');
    const css = (readFileSync(KIT + 'FileExplorer.svelte', 'utf8').split('<style>')[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    const rule = css.match(/\.file-explorer-columns \{[^}]*\}/g)!.join('\n');
    expect(rule).toContain('position: sticky');
    expect(rule).toContain('user-select: none');
  });
});

/** 選択モードで、名前の行を押して選ぶ */
function pressNamed(el: HTMLElement, name: string): void {
  const li = [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].find((x) => x.textContent?.includes(name))!;
  li.querySelector<HTMLButtonElement>('.file-explorer-row')!.click();
  flushSync();
}

/** 送る・移す・消す・戻すの途中で置き場所が変わったときの決まり（新しい置き場所へは何も書かない） */
describe('置き場所が変わったら、新しい置き場所へは書かない', () => {
  afterEach(() => {
    ui.toasts.length = 0;
  });

  /** 答えを後から渡す約束（応答待ちの途中で、置き場所を切り替えるため） */
  function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }

  const done = (name: string) => ({ promise: Promise.resolve({ ...entry(name), path: name }), abort: () => {} });

  it('複数件を送る: 1 件目が終わったあとも、2 件目は同じ一覧で判定して送る（blocked にならない）', async () => {
    h.upload.mockImplementation((path: string) => done(path));
    const el = await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['c'], 'c.txt'), new File(['d'], 'd.txt')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledTimes(2));
    expect(h.upload.mock.calls.map((c) => c[0])).toEqual(['c.txt', 'd.txt']);
    expect(el.querySelectorAll('.file-explorer-upload-error').length).toBe(0);
  });

  it('貼り付けたファイルが複数でも、2 件目以降が止まらない', async () => {
    h.upload.mockImplementation((path: string) => done(path));
    await render();
    const ev = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    const files = [new File(['1'], 'x1.pdf'), new File(['2'], 'x2.pdf')];
    Object.defineProperty(ev, 'clipboardData', { value: { files, getData: () => '' } });
    document.body.dispatchEvent(ev);
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledTimes(2));
    expect(h.upload.mock.calls.map((c) => c[0])).toEqual(['x1.pdf', 'x2.pdf']);
  });

  it('送る: 同名の確認を待つあいだに切り替わったら、確認に答えても送らない', async () => {
    const el = await render();
    pick(el, new File(['x'], 'a.txt'));
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    place.key = 'http://b.test';
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.text.includes('置き場所が変わった'))).toBe(true));
    expect(h.upload).not.toHaveBeenCalled();
  });

  it('送る: 1 件目の応答を待つあいだに切り替わったら、2 件目は送らない', async () => {
    const first = deferred<Entry>();
    h.upload.mockImplementationOnce(() => ({ promise: first.promise, abort: () => {} }));
    const el = await render();
    const input = el.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File(['c'], 'c.txt'), new File(['d'], 'd.txt')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1));
    place.key = 'http://b.test';
    first.resolve({ ...entry('c.txt'), path: 'c.txt' });
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.text.includes('置き場所が変わった'))).toBe(true));
    expect(h.upload).toHaveBeenCalledTimes(1);
  });

  it('切り取りの貼り付け: 上書きの確認を待つあいだに切り替わったら、移さない', async () => {
    h.list.mockImplementation(async (path?: string) => (path === 'docs' ? [entry('a.txt')] : h.current ?? listing));
    await render();
    fileExplorer.open('docs');
    flushSync();
    await vi.waitFor(() => expect(h.list).toHaveBeenCalledWith('docs'));
    explorerBuffer.set('move', [{ path: 'a.txt', kind: 'file' }]);
    flushSync();
    pasteClick(document.body as unknown as HTMLElement);
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    place.key = 'http://b.test';
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.text.includes('置き場所が変わった'))).toBe(true));
    expect(h.move).not.toHaveBeenCalled();
  });

  it('切り取りの貼り付け: 1 件目の応答を待つあいだに切り替わったら、2 件目は移さない', async () => {
    const first = deferred<Entry>();
    h.move.mockImplementationOnce(() => first.promise);
    h.list.mockImplementation(async (path?: string) => (path === 'docs' ? [] : h.current ?? listing));
    await render();
    fileExplorer.open('docs');
    flushSync();
    await vi.waitFor(() => expect(h.list).toHaveBeenCalledWith('docs'));
    explorerBuffer.set('move', [{ path: 'a.txt', kind: 'file' }, { path: 'pic.png', kind: 'file' }]);
    flushSync();
    pasteClick(document.body as unknown as HTMLElement);
    await vi.waitFor(() => expect(h.move).toHaveBeenCalledTimes(1));
    place.key = 'http://b.test';
    first.resolve({ ...entry('a.txt'), path: 'docs/a.txt' });
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.text.includes('置き場所が変わった'))).toBe(true));
    expect(h.move).toHaveBeenCalledTimes(1);
  });

  it('途中で接続先を変えてコピーし直したら、前の移動結果で新しいバッファを消さない', async () => {
    const second = deferred<Entry>();
    h.move.mockResolvedValueOnce({ ...entry('a.txt'), path: 'docs/a.txt' });
    h.move.mockImplementationOnce(() => second.promise);
    h.list.mockImplementation(async (path?: string) => (path === 'docs' ? [] : h.current ?? listing));
    await render();
    fileExplorer.open('docs');
    flushSync();
    await vi.waitFor(() => expect(h.list).toHaveBeenCalledWith('docs'));
    explorerBuffer.set('move', [{ path: 'a.txt', kind: 'file' }, { path: 'pic.png', kind: 'file' }]);
    flushSync();
    pasteClick(document.body as unknown as HTMLElement);
    await vi.waitFor(() => expect(h.move).toHaveBeenCalledTimes(2));
    place.key = 'http://b.test';
    explorerBuffer.set('copy', [{ path: 'a.txt', kind: 'file' }]);
    second.resolve({ ...entry('pic.png'), path: 'docs/pic.png' });
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.text.includes('置き場所が変わった'))).toBe(true));
    expect(explorerBuffer.mode).toBe('copy');
    expect(explorerBuffer.items).toEqual([{ path: 'a.txt', kind: 'file' }]);
  });

  it('削除: 確認を待つあいだに切り替わったら、移さない', async () => {
    const el = await render();
    explorerSelection.enter();
    flushSync();
    pressNamed(el, 'a.txt');
    el.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    place.key = 'http://b.test';
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.text.includes('置き場所が変わった'))).toBe(true));
    expect(h.trash).not.toHaveBeenCalled();
  });

  it('削除: 1 件目の応答を待つあいだに切り替わったら、2 件目は移さない', async () => {
    const first = deferred<{ id: string; original_path: string; kind: 'file'; size: number; deleted_at: number }>();
    h.trash.mockImplementationOnce(() => first.promise);
    const el = await render();
    explorerSelection.enter();
    flushSync();
    pressNamed(el, 'a.txt');
    pressNamed(el, 'pic.png');
    el.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.trash).toHaveBeenCalledTimes(1));
    place.key = 'http://b.test';
    explorerBuffer.set('copy', [{ path: 'a.txt', kind: 'file' }]);
    first.resolve({ id: 'id-a', original_path: 'a.txt', kind: 'file', size: 1, deleted_at: 0 });
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.text.includes('残りは移していません'))).toBe(true));
    expect(h.trash).toHaveBeenCalledTimes(1);
    expect(explorerBuffer.items).toEqual([{ path: 'a.txt', kind: 'file' }]);
  });

  it('取り消し: 1 件目の応答を待つあいだに切り替わったら、2 件目は戻さない', async () => {
    const el = await render();
    explorerSelection.enter();
    flushSync();
    pressNamed(el, 'a.txt');
    pressNamed(el, 'pic.png');
    el.querySelector<HTMLButtonElement>('button[aria-label="削除"]')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.trash).toHaveBeenCalledTimes(2));
    const undo = ui.toasts.find((t) => t.action?.label === '取り消す');
    expect(undo).toBeTruthy();
    const first = deferred<Awaited<ReturnType<typeof h.restore>>>();
    h.restore.mockImplementationOnce(() => first.promise);
    undo!.action!.run();
    await vi.waitFor(() => expect(h.restore).toHaveBeenCalledTimes(1));
    place.key = 'http://b.test';
    first.resolve({ name: 'a.txt', path: 'a.txt', kind: 'file', size: 1, modified: 0, mime: null });
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.kind === 'error' && t.text.includes('置き場所が変わった'))).toBe(true));
    expect(h.restore).toHaveBeenCalledTimes(1);
  });
});

/** OS のドロップ（Windows の HTML5 の項目）を、本体（body）へ落とす */
function dropOs(el: HTMLElement, roots: { name: string; dir?: boolean }[]): void {
  const ev = new Event('drop', { bubbles: true, cancelable: true });
  const entries = roots.map((r) =>
    r.dir
      ? { isFile: false, isDirectory: true, name: r.name, createReader: () => ({ readEntries: (ok: (v: unknown[]) => void) => ok([]) }) }
      : { isFile: true, isDirectory: false, name: r.name, file: (ok: (f: File) => void) => ok(new File(['x'], r.name)) },
  );
  Object.defineProperty(ev, 'dataTransfer', {
    value: { types: ['Files'], items: entries.map((e) => ({ kind: 'file', webkitGetAsEntry: () => e })), files: [] },
  });
  el.dispatchEvent(ev);
}

describe('OS のドロップで、上書きを取り消したものだけ送らない', () => {
  it('根の同名ファイルを取り消しても、ほかのファイルは送る（全体を中止しない）', async () => {
    const el = await render();
    const body = el.querySelector<HTMLElement>('.file-explorer-body')!;
    dropOs(body, [{ name: 'a.txt' }, { name: 'new.txt' }]);
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    expect(ui.confirmReq!.title).toContain('a.txt');
    ui.confirmReq!.resolve(false);
    await vi.waitFor(() => expect(h.write).toHaveBeenCalledTimes(1));
    expect(h.write.mock.calls[0][0]).toBe('new.txt');
  });
});

/** PC の選択（0 件でも操作が続く）: 行の押し・ダブルクリック・Enter・F2・空きスペース */
describe('PC の選択（0 件でも続く。ダブルクリック・Enter で開く）', () => {
  beforeEach(() => {
    dsk.desktop = true;
  });

  const clickRow = (el: HTMLElement, name: string, detail = 1) => {
    rowOf(el, name).querySelector<HTMLElement>('.file-explorer-row')!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, detail }),
    );
    flushSync();
  };
  const keyRow = (el: HTMLElement, name: string, key: string) => {
    rowOf(el, name).querySelector<HTMLElement>('.file-explorer-row')!.dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
    );
    flushSync();
  };
  const count = (el: HTMLElement) => el.querySelector('.file-explorer-selection-count')!.textContent?.trim();

  it('0→1→0→1: 1 件押すと選び、外しても 0 件のまま操作は続く（印・件数の選択表示は出さない）', async () => {
    const el = await render();
    expect(count(el)).toBe('3 件');
    clickRow(el, 'a.txt');
    expect(count(el)).toBe('1 件選択中');
    expect(el.querySelector('.file-explorer-check')).not.toBeNull();
    clickRow(el, 'a.txt');
    expect(count(el)).toBe('3 件');
    expect(el.querySelector('.file-explorer-check')).toBeNull();
    expect(el.querySelector('button[aria-label="すべて選ぶ"]')).toBeNull();
    // 0 件でも行は押せる（選ぶ操作が続いている）
    expect(rowOf(el, 'a.txt').querySelector('.file-explorer-row')!.getAttribute('aria-pressed')).toBe('false');
    clickRow(el, 'a.txt');
    expect(count(el)).toBe('1 件選択中');
  });

  it('0 件のときは、通常の一覧（チェック・選択の件数なし）。選ぶ操作は押せるまま', async () => {
    const el = await render();
    expect(el.querySelectorAll('.file-explorer-check').length).toBe(0);
    expect(count(el)).toBe('3 件');
    expect(el.querySelector('.file-explorer-row')!.tagName).toBe('BUTTON');
  });

  it('シングルクリックでは開かない・名前の文字を押しても書き換えにならない', async () => {
    const el = await render();
    const name = rowOf(el, 'docs').querySelector<HTMLElement>('.file-explorer-name-text')!;
    name.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    flushSync();
    expect(fileExplorer.dir).toBe('');
    expect(el.querySelector('.file-explorer-rename')).toBeNull();
    expect(count(el)).toBe('1 件選択中');
  });

  it('ダブルクリックでフォルダを開く（2 回目の押しでは選び直さない）', async () => {
    const el = await render();
    clickRow(el, 'docs', 1);
    clickRow(el, 'docs', 2);
    // 2 回目（detail 2）では選び直さない。選びは 1 件のまま
    expect(count(el)).toBe('1 件選択中');
    rowOf(el, 'docs').querySelector<HTMLElement>('.file-explorer-row')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    flushSync();
    expect(fileExplorer.dir).toBe('docs');
  });

  it('Enter で開く（フォルダは中へ）。画像は拡大表示、ほかのファイルはダウンロード', async () => {
    const el = await render();
    keyRow(el, 'docs', 'Enter');
    expect(fileExplorer.dir).toBe('docs');
    fileExplorer.open('');
    flushSync();
    await vi.waitFor(() => expect(rowOf(el, 'pic.png')).toBeTruthy());
    keyRow(el, 'pic.png', 'Enter');
    expect(ui.lightbox).not.toBeNull();
    keyRow(el, 'a.txt', 'Enter');
    expect(downloadFile).toHaveBeenCalledTimes(1);
    // Enter で開いたときは選びは変わらない（0 件のまま）
    expect(count(el)).toBe('3 件');
  });

  it('ダブルクリックで画像を開く（拡大表示）', async () => {
    const el = await render();
    rowOf(el, 'pic.png').querySelector<HTMLElement>('.file-explorer-row')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    expect(ui.lightbox).not.toBeNull();
  });

  it('F2 で名前を書き換える（0 件でも・選んでいても使える）', async () => {
    const el = await render();
    keyRow(el, 'a.txt', 'F2');
    flushSync();
    expect(el.querySelector('.file-explorer-rename')).not.toBeNull();
    renameKeyEsc(el);
    clickRow(el, 'a.txt');
    keyRow(el, 'a.txt', 'F2');
    flushSync();
    expect(el.querySelector('.file-explorer-rename')).not.toBeNull();
  });

  it('空きスペースを押すと選びを外す。0 件でも操作は続く（再び押せる）', async () => {
    const el = await render();
    clickRow(el, 'a.txt');
    el.querySelector<HTMLElement>('.file-explorer-body')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    flushSync();
    expect(count(el)).toBe('3 件');
    expect(explorerSelection.active).toBe(true);
    clickRow(el, 'pic.png');
    expect(count(el)).toBe('1 件選択中');
  });

  it('0 件のあいだは「戻る」（パネルの戻る）を奪わない。選んでいる間は選びを外す', async () => {
    const el = await render();
    flushSync();
    expect(ui.pluginBack).toHaveLength(0);
    clickRow(el, 'a.txt');
    flushSync();
    expect(ui.pluginBack.length).toBeGreaterThan(0);
  });
});

function renameKeyEsc(el: HTMLElement): void {
  const ta = el.querySelector<HTMLTextAreaElement>('.file-explorer-rename');
  ta?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  flushSync();
}

/** タッチ（Android）: 従来どおり。0 件で終わる・タップで開く・長押しで選ぶ */
describe('タッチ（Android）の選択は従来どおり（0 件で終わる）', () => {
  it('選びを外して 0 件になると選択モードを終え、タップは開く動作に戻る', async () => {
    const el = await render();
    explorerSelection.start('a.txt');
    flushSync();
    expect(el.querySelector('.file-explorer-check')).not.toBeNull();
    rowOf(el, 'a.txt').querySelector<HTMLElement>('.file-explorer-row')!.click();
    flushSync();
    expect(explorerSelection.active).toBe(false);
    expect(el.querySelector('.file-explorer-check')).toBeNull();
    expect(count(el)).toBe('3 件');
    // 0 件に戻ったあと、フォルダのタップは開く
    rowOf(el, 'docs').querySelector<HTMLElement>('.file-explorer-row')!.click();
    flushSync();
    expect(fileExplorer.dir).toBe('docs');
  });

  it('選択モードでは F2 で書き換えない（従来どおり）', async () => {
    const el = await render();
    explorerSelection.start('a.txt');
    flushSync();
    rowOf(el, 'a.txt').querySelector<HTMLElement>('.file-explorer-row')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true }));
    flushSync();
    expect(el.querySelector('.file-explorer-rename')).toBeNull();
  });

  function count(el: HTMLElement): string | undefined {
    return el.querySelector('.file-explorer-selection-count')!.textContent?.trim();
  }
});

/** 名前の行（一覧の 1 件）。PC・タッチの選択のテストで使う */
function rowOf(el: HTMLElement, name: string): HTMLElement {
  return [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].find((li) => li.textContent?.includes(name))!;
}

/* ---- ゴミ箱は、ふつうのフォルダとして開く（.trash。直下の項目は元の名前で出す・元へ戻す・完全削除） ---- */

const ID1 = '01HZX0000000000000000000AB';
const ID2 = '01HZX0000000000000000000CD';
const ID3 = '01HZX0000000000000000000EF';
const ID4 = '01HZX0000000000000000000GH';
const ROOT_TRASH: Entry = { ...entry('.trash', 'dir'), path: '.trash', trash: { kind: 'root' } };
/** 直下の項目（ゴミ箱の 1 件）。名前は ID--元の名前、パスも同じ別名。表示は元の名前 */
function trashItem(id: string, original: string, kind: 'file' | 'dir' = 'file'): Entry {
  const leaf = original.split('/').pop()!;
  return {
    ...entry(`${id}--${leaf}`, kind),
    path: `.trash/${id}--${leaf}`,
    size: 1,
    trash: { kind: 'item', entry: { id, original_path: original, kind, size: 1, deleted_at: 0 } },
  };
}
function inner(parentAlias: string, name: string, kind: 'file' | 'dir' = 'file'): Entry {
  return { ...entry(name, kind), path: `${parentAlias}/${name}`, trash: { kind: 'descendant', id: ID4 } };
}
const rootList = (): Entry[] => [ROOT_TRASH, entry('docs', 'dir')];
const trashList = (): Entry[] => [
  trashItem(ID1, 'docs/report.pdf'),
  trashItem(ID2, 'a/x.txt'),
  trashItem(ID3, 'b/x.txt'),
  trashItem(ID4, 'old', 'dir'),
];
const innerList = (): Entry[] => [inner(`.trash/${ID4}--old`, 'sub', 'dir'), inner(`.trash/${ID4}--old`, 'k.txt')];
const ALIAS1 = `.trash/${ID1}--report.pdf`;
const ALIAS4 = `.trash/${ID4}--old`;

/** パスごとの一覧（書いていないパスは空）。'pending' は応答しない、'error' は失敗 */
function serve(map: Record<string, Entry[] | 'pending' | 'error'>): void {
  h.list.mockImplementation(async (path?: string) => {
    const v = map[path ?? ''];
    if (v === undefined) return [];
    if (v === 'error') throw new Error('読めません');
    if (v === 'pending') return new Promise<Entry[]>(() => {});
    return v;
  });
}

/** 名前の表示（一覧に出ている通り） */
function names(el: HTMLElement): string[] {
  return [...el.querySelectorAll('.file-explorer-name-text')].map((t) => t.textContent?.trim() ?? '');
}
function btn(el: HTMLElement, label: string): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}
function toastTexts(): string[] {
  return ui.toasts.map((t) => t.text);
}
/** 既存の名前の項目を、選択モードのまま押す（選ぶ） */
function pickRow(el: HTMLElement, name: string): void {
  rowOf(el, name).querySelector<HTMLElement>('.file-explorer-row')!.click();
  flushSync();
}

describe('ゴミ箱は、ふつうのフォルダとして開く（.trash）', () => {
  beforeEach(() => {
    // 前のテストの拡大表示・戻る操作が残らないように
    ui.lightbox = null;
    ui.pluginBack = [];
  });
  it('≡ に「ゴミ箱」は無い（ゴミ箱は一覧の .trash の行から開く）', async () => {
    serve({ '': rootList() });
    const el = await render();
    expect(menuLabels(el).some((l) => l.includes('ゴミ箱'))).toBe(false);
  });

  it('一覧の「.trash」の行は、ふつうのフォルダの行として開く（戻るで前のフォルダへ）', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    const trashRow = rowOf(el, '.trash');
    expect(trashRow.querySelector('.file-explorer-name-text')!.textContent).toBe('.trash');
    trashRow.querySelector<HTMLElement>('.file-explorer-row')!.click();
    flushSync();
    expect(fileExplorer.dir).toBe('.trash');
    await vi.waitFor(() => expect(names(el)).toEqual(['old', 'report.pdf', 'x.txt', 'x.txt']));
    flushSync();
    expect(ui.back()).toBe(true);
    flushSync();
    expect(fileExplorer.dir).toBe('');
  });

  it('中の項目は元の名前で出す（別名は見せない）。同じ名前は別の行として別々に扱う', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    expect(names(el).join('|')).not.toContain(ID1);
    const xs = [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].filter((li) => li.textContent?.includes('x.txt'));
    expect(xs.length).toBe(2);
    // 選んでも、同じ名前の片方だけが選ばれる（パスは別名のまま）
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'x.txt');
    expect(explorerSelection.count).toBe(1);
    expect(explorerSelection.paths()[0]!.startsWith('.trash/')).toBe(true);
  });

  it('直下の項目を選ぶと、元へ戻す・完全削除が出る（削除はそれに替わる）', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    expect(btn(el, '元へ戻す')).not.toBeNull();
    expect(btn(el, '完全削除')).not.toBeNull();
    expect(btn(el, '削除')).toBeNull();
  });

  it('元へ戻す: 押した時点の ID で戻す。成功したものだけ選びから外す。失敗（同じ名前がある）は選んだまま', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    pickRow(el, 'old');
    h.restore.mockImplementation(async (id: string) => {
      if (id === ID4) throw Object.assign(new Error('同じ名前があります'), { code: 'exists' });
      return { name: 'report.pdf', path: 'docs/report.pdf', kind: 'file' as const, size: 1, modified: 0, mime: null };
    });
    btn(el, '元へ戻す')!.click();
    await vi.waitFor(() => expect(h.restore).toHaveBeenCalledTimes(2));
    expect(h.restore.mock.calls.map((c) => c[0])).toEqual([ID1, ID4]);
    await vi.waitFor(() => expect(toastTexts().some((t) => t.includes('1 件を元の場所に戻しました'))).toBe(true));
    expect(toastTexts().some((t) => t.includes('1 件を扱えませんでした'))).toBe(true);
    expect(explorerSelection.paths()).toEqual([ALIAS4]);
    h.restore.mockReset();
    h.restore.mockImplementation(async () => ({ name: '', path: '', kind: 'file' as const, size: 1, modified: 0, mime: null }));
  });

  it('完全削除: 名前を出して確認。キャンセルでは消さない。確認すると、押した時点の ID で消す', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    btn(el, '完全削除')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    expect(ui.confirmReq!.title).toBe('完全に削除しますか');
    expect(ui.confirmReq!.body).toContain('「report.pdf」');
    expect(ui.confirmReq!.body).toContain('取り消せません');
    ui.confirmReq!.resolve(false);
    await vi.waitFor(() => expect(ui.confirmReq).toBeNull());
    expect(h.purge).not.toHaveBeenCalled();
    await waitEnabled(el, '完全削除');
    btn(el, '完全削除')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.purge).toHaveBeenCalledTimes(1));
    expect(h.purge).toHaveBeenCalledWith(ID1);
    await vi.waitFor(() => expect(toastTexts().some((t) => t.includes('1 件を完全に削除しました'))).toBe(true));
  });

  it('完全削除の途中で失敗したものは、選んだまま残る（成功したものだけ外す）', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    pickRow(el, 'old');
    h.purge.mockImplementationOnce(async () => {
      throw new Error('できません');
    });
    btn(el, '完全削除')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    expect(ui.confirmReq!.body).toContain('2 件');
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.purge).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(toastTexts().some((t) => t.includes('1 件を扱えませんでした'))).toBe(true));
    expect(explorerSelection.paths()).toEqual([ALIAS1]);
  });

  it('確認を待つあいだに置き場所が変わったら、完全削除は送らない', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    btn(el, '完全削除')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    const spy = scopeAs('http://other.test');
    try {
      ui.confirmReq!.resolve(true);
      await vi.waitFor(() => expect(toastTexts().some((t) => t.includes('置き場所が変わった'))).toBe(true));
      expect(h.purge).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('1 件目の応答を待つあいだに置き場所が変わったら、2 件目は新しい置き場所へ送らない', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    pickRow(el, 'old');
    let first: (v: Awaited<ReturnType<typeof h.restore>>) => void = () => {};
    h.restore.mockImplementationOnce(() => new Promise((r) => (first = r)));
    btn(el, '元へ戻す')!.click();
    await vi.waitFor(() => expect(h.restore).toHaveBeenCalledTimes(1));
    const spy = scopeAs('http://other.test');
    try {
      first({ name: 'report.pdf', path: 'docs/report.pdf', kind: 'file', size: 1, modified: 0, mime: null });
      await vi.waitFor(() => expect(toastTexts().some((t) => t.includes('置き場所が変わった'))).toBe(true));
      expect(h.restore).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('ゴミ箱のフォルダ（.trash）は、コピー・切り取り・削除・名前の変更ができない（理由つき）', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    explorerSelection.enter();
    flushSync();
    pickRow(el, '.trash');
    expect(btn(el, 'コピー')!.disabled).toBe(true);
    expect(btn(el, '切り取り')!.disabled).toBe(true);
    expect(btn(el, '削除')!.disabled).toBe(true);
    expect(btn(el, '元へ戻す')).toBeNull();
    // 名前は変えない（押しても入力欄にならない）
    const row = rowOf(el, '.trash');
    row.querySelector<HTMLElement>('.file-explorer-name-text')!.click();
    flushSync();
    expect(el.querySelector('.file-explorer-rename')).toBeNull();
  });

  it('ゴミ箱の中（直下の項目のフォルダ）は、読むとコピーだけ。書き込み・削除・切り取りは出さない', async () => {
    serve({ '': rootList(), '.trash': trashList(), [ALIAS4]: innerList() });
    const el = await render();
    fileExplorer.open(ALIAS4);
    flushSync();
    await vi.waitFor(() => expect(names(el)).toEqual(['sub', 'k.txt']));
    // 新しいフォルダは出さない
    expect(menuLabels(el).some((l) => l.includes('新しいフォルダ'))).toBe(false);
    // アップロードは止める（理由を出す）
    pick(el, new File(['x'], 'new.txt'));
    expect(h.upload).not.toHaveBeenCalled();
    expect(toastTexts().some((t) => t.includes('ゴミ箱の中には書き込めません'))).toBe(true);
    // 中身を選ぶ: コピーはできる、切り取り・削除はできない
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'k.txt');
    expect(btn(el, 'コピー')!.disabled).toBe(false);
    expect(btn(el, '切り取り')!.disabled).toBe(true);
    expect(btn(el, '削除')!.disabled).toBe(true);
    expect(btn(el, '元へ戻す')).toBeNull();
  });

  it('中身をコピーして、ほかのフォルダへ貼り付けられる（元の名前のまま）', async () => {
    serve({ '': rootList(), '.trash': trashList(), [ALIAS4]: innerList() });
    const el = await render();
    fileExplorer.open(ALIAS4);
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('k.txt'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'k.txt');
    btn(el, 'コピー')!.click();
    flushSync();
    fileExplorer.open('');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('docs'));
    pasteClick(el);
    await vi.waitFor(() => expect(h.copy).toHaveBeenCalledWith(`${ALIAS4}/k.txt`, 'k.txt', false));
  });

  it('直下の項目の切り取りは、元の場所へだけ戻せる（ほかの場所は、貼り付けの前に止める）', async () => {
    serve({ '': rootList(), '.trash': trashList(), docs: [] });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    btn(el, '切り取り')!.click();
    flushSync();
    // ほかの場所（直下）へは戻せない
    fileExplorer.open('');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('docs'));
    pasteClick(el);
    await vi.waitFor(() => expect(toastTexts().some((t) => t.includes('元の場所'))).toBe(true));
    expect(h.move).not.toHaveBeenCalled();
    // 元の場所（docs）へは、戻る（移動）になる
    fileExplorer.open('docs');
    flushSync();
    await vi.waitFor(() => expect(h.list).toHaveBeenCalledWith('docs'));
    pasteClick(el);
    await vi.waitFor(() => expect(h.move).toHaveBeenCalledWith(ALIAS1, 'docs/report.pdf', false));
  });

  it('本当の（実在の）.trash は、ふつうのフォルダ。書けて、新しいフォルダも作れる', async () => {
    serve({ '': [entry('.trash', 'dir'), entry('docs', 'dir')], '.trash': [entry('memo.txt')] });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toEqual(['memo.txt']));
    expect(menuLabels(el).some((l) => l.includes('新しいフォルダ'))).toBe(true);
    pick(el, new File(['x'], 'new.txt'));
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledWith('.trash/new.txt', expect.any(File), expect.any(Function)));
  });

  it('直下の一覧が読み終えていない（直接 .trash の中を開いた）あいだは、書き込みを止める（確かめるまで）', async () => {
    serve({ '': 'pending', [ALIAS4]: innerList() });
    target = document.createElement('div');
    document.body.appendChild(target);
    instance = mount(FileExplorer, { target, props: { explorer } });
    flushSync();
    fileExplorer.open(ALIAS4);
    flushSync();
    await vi.waitFor(() => expect(names(target!)).toEqual(['sub', 'k.txt']));
    expect(menuLabels(target!).some((l) => l.includes('新しいフォルダ'))).toBe(false);
    pick(target!, new File(['x'], 'new.txt'));
    expect(h.upload).not.toHaveBeenCalled();
    expect(toastTexts().some((t) => t.includes('確かめて'))).toBe(true);
  });

  it('直接開いた空のゴミ箱の中も、書き込みは止める（直下の印で判定する）', async () => {
    serve({ '': rootList(), [ALIAS4]: [] });
    const el = await render();
    fileExplorer.open(ALIAS4);
    flushSync();
    await vi.waitFor(() => expect(el.querySelector('.file-explorer-empty, .file-explorer-list-empty') ?? el).toBeTruthy());
    expect(menuLabels(el).some((l) => l.includes('新しいフォルダ'))).toBe(false);
    pick(el, new File(['x'], 'new.txt'));
    expect(h.upload).not.toHaveBeenCalled();
    expect(toastTexts().some((t) => t.includes('ゴミ箱の中には書き込めません'))).toBe(true);
  });

  it('.trash 以外のフォルダでは、余分な読み（直下・.trash の一覧）をしない', async () => {
    serve({ '': rootList(), docs: [entry('a.txt')] });
    await render();
    fileExplorer.open('docs');
    flushSync();
    await vi.waitFor(() => expect(h.list).toHaveBeenCalledWith('docs'));
    expect(h.list.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['', 'docs']);
  });

  it('中の項目を開く: デスクトップは Enter・ダブルクリックで、タッチは押すと、元の名前のフォルダへ入る', async () => {
    serve({ '': rootList(), '.trash': trashList(), [ALIAS4]: innerList() });
    // タッチ（既定）: 押すと開く
    let el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('old'));
    rowOf(el, 'old').querySelector<HTMLElement>('.file-explorer-row')!.click();
    flushSync();
    expect(fileExplorer.dir).toBe(ALIAS4);
    expect(explorerSelection.active).toBe(false);
    // 戻る
    fileExplorer.back();
    flushSync();
    unmount(instance!);
    instance = undefined;
    target?.remove();
    target = undefined;
    // デスクトップ: Enter で開く（選びは変わらない）
    dsk.desktop = true;
    el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('old'));
    rowOf(el, 'old').querySelector<HTMLElement>('.file-explorer-row')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    flushSync();
    expect(fileExplorer.dir).toBe(ALIAS4);
  });
});

describe('ゴミ箱の中のパンくずも、元の名前で出す', () => {
  beforeEach(() => {
    ui.lightbox = null;
    ui.pluginBack = [];
  });

  it('.trash/<別名> の段は元の名前、.trash の段はそのまま。押すとその段のフォルダへ（別名のパス）', async () => {
    serve({ '': rootList(), '.trash': trashList(), [ALIAS4]: innerList() });
    const el = await render();
    fileExplorer.open(ALIAS4);
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('k.txt'));
    const crumbs = [...el.querySelectorAll<HTMLButtonElement>('.file-explorer-crumb')].map((b) => b.textContent?.trim());
    expect(crumbs).toEqual(['ルート', '.trash', 'old']);
    // 「.trash」の段へ戻る
    const trashCrumb = [...el.querySelectorAll<HTMLButtonElement>('.file-explorer-crumb')].find((b) => b.textContent?.trim() === '.trash')!;
    trashCrumb.click();
    flushSync();
    expect(fileExplorer.dir).toBe('.trash');
  });
});

describe('ゴミ箱の中へは、貼り付けでも書かない', () => {
  beforeEach(() => {
    ui.lightbox = null;
    ui.pluginBack = [];
  });

  it('コピーしたものを、ゴミ箱のフォルダ（.trash）へ貼り付けても送らない（理由を出す）', async () => {
    serve({ '': rootList(), '.trash': trashList(), [ALIAS4]: innerList() });
    const el = await render();
    fileExplorer.open(ALIAS4);
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('k.txt'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'k.txt');
    btn(el, 'コピー')!.click();
    flushSync();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('old'));
    pasteClick(el);
    await vi.waitFor(() => expect(toastTexts().some((t) => t.includes('ゴミ箱の中には書き込めません'))).toBe(true));
    expect(h.copy).not.toHaveBeenCalled();
  });

  it('完全削除の途中で 2 件目が失敗しても、成功した 1 件は一覧から外れる（失敗だけ選んだまま）', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    pickRow(el, 'old');
    h.purge.mockImplementationOnce(async () => {});
    h.purge.mockImplementationOnce(async () => {
      throw Object.assign(new Error('x'), { code: 'forbidden' });
    });
    btn(el, '完全削除')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.purge).toHaveBeenCalledTimes(2));
    expect(h.purge.mock.calls.map((c) => c[0])).toEqual([ID1, ID4]);
    await vi.waitFor(() => expect(explorerSelection.paths()).toEqual([ALIAS4]));
  });
});

describe('ゴミ箱の直下の項目を、外へコピーすると元の名前になる', () => {
  beforeEach(() => {
    ui.lightbox = null;
    ui.pluginBack = [];
  });

  it('コピーは元の名前で貼る（別名のまま貼らない）。元の場所の外へは移せないが、コピーはできる', async () => {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    btn(el, 'コピー')!.click();
    flushSync();
    fileExplorer.open('');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('docs'));
    pasteClick(el);
    await vi.waitFor(() => expect(h.copy).toHaveBeenCalledWith(ALIAS1, 'report.pdf', false));
    expect(h.move).not.toHaveBeenCalled();
  });
});

/** 操作の終わりを待つ（ボタンが押せるまで。操作の後で選びが空になり、ボタンが消えているなら、それも終わり） */
async function waitEnabled(el: HTMLElement, label: string): Promise<void> {
  await vi.waitFor(() => {
    flushSync();
    const b = btn(el, label);
    expect(b === null || !b.disabled).toBe(true);
  });
}

/* ---- 読み直しの状態を追う（無効化されたあと、判定と名前の表示を直す） ---- */

function crumbTexts(el: HTMLElement): string[] {
  return [...el.querySelectorAll<HTMLButtonElement>('.file-explorer-crumb')].map((b) => b.textContent?.trim() ?? '');
}

describe('ゴミ箱の中にいるあいだに .trash が変わったら、直下の判定と元の名前を読み直す', () => {
  beforeEach(() => {
    ui.lightbox = null;
    ui.pluginBack = [];
  });

  it('.trash の中の項目の段（パンくず）は、無効化のあとも元の名前に戻る（読み直しが走る）', async () => {
    serve({ '': rootList(), '.trash': trashList(), [ALIAS4]: innerList() });
    const el = await render();
    fileExplorer.open(ALIAS4);
    flushSync();
    await vi.waitFor(() => expect(crumbTexts(el)).toEqual(['ルート', '.trash', 'old']));
    h.list.mockClear();
    dirIndex.invalidate('.trash');
    await vi.waitFor(() => {
      flushSync();
      expect(crumbTexts(el)).toEqual(['ルート', '.trash', 'old']);
    });
    // 直下（root）と .trash を読み直した（以前は読み直さず、段が別名のまま戻らなかった）
    expect(h.list.mock.calls.map((c) => (c as unknown[])[0])).toEqual(expect.arrayContaining(['', '.trash']));
  });

  it('中にいるあいだに無効化されても、判定は仮想のまま（書き込みは止める。確かめ中のまま止まらない）', async () => {
    serve({ '': rootList(), [ALIAS4]: innerList() });
    const el = await render();
    fileExplorer.open(ALIAS4);
    flushSync();
    await vi.waitFor(() => expect(names(el)).toEqual(['sub', 'k.txt']));
    dirIndex.invalidate('.trash');
    await vi.waitFor(() => {
      flushSync();
      expect(dirIndex.state('')?.kind).toBe('ok');
    });
    pick(el, new File(['x'], 'new.txt'));
    expect(h.upload).not.toHaveBeenCalled();
    expect(toastTexts().some((t) => t.includes('ゴミ箱の中には書き込めません'))).toBe(true);
    expect(toastTexts().some((t) => t.includes('確かめて'))).toBe(false);
  });

  it('実在の .trash（印なし）は、無効化のあとも書き込める（仮想に間違えない）', async () => {
    serve({ '': [entry('.trash', 'dir'), entry('docs', 'dir')], '.trash': [entry('memo.txt')] });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toEqual(['memo.txt']));
    h.list.mockClear();
    dirIndex.invalidate('.trash');
    await vi.waitFor(() => {
      flushSync();
      expect(names(el)).toEqual(['memo.txt']);
    });
    flushSync();
    expect(menuLabels(el).some((l) => l.includes('新しいフォルダ'))).toBe(true);
    pick(el, new File(['x'], 'new.txt'));
    await vi.waitFor(() => expect(h.upload).toHaveBeenCalledWith('.trash/new.txt', expect.any(File), expect.any(Function)));
  });

  it('仮想の .trash のあいだに、直下の一覧を読み直しても、ふつうのフォルダの余分な読みは増えない', async () => {
    serve({ '': rootList(), docs: [entry('a.txt')] });
    await render();
    fileExplorer.open('docs');
    flushSync();
    await vi.waitFor(() => expect(h.list).toHaveBeenCalledWith('docs'));
    h.list.mockClear();
    dirIndex.invalidate('docs');
    fileExplorer.reload();
    flushSync();
    await vi.waitFor(() => expect(h.list).toHaveBeenCalledWith('docs'));
    expect(h.list.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['docs']);
  });
});

/* ---- B: 選んだ項目への操作（削除・元へ戻す・完全削除）は、同時に 1 つだけ ---- */

describe('選んだ項目への操作は、同時に 1 つだけ（確認の途中も含む）', () => {
  beforeEach(() => {
    ui.lightbox = null;
    ui.pluginBack = [];
  });

  function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
  }
  const restored = { name: 'report.pdf', path: 'docs/report.pdf', kind: 'file' as const, size: 1, modified: 0, mime: null };

  /** .trash を開いて、report.pdf を選んだ状態にする */
  async function openWithOneSelected(): Promise<HTMLElement> {
    serve({ '': rootList(), '.trash': trashList() });
    const el = await render();
    fileExplorer.open('.trash');
    flushSync();
    await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
    explorerSelection.enter();
    flushSync();
    pickRow(el, 'report.pdf');
    return el;
  }

  it('元へ戻すを二回押しても、送るのは一回。終わるまで押せない（終わったら押せる）', async () => {
    const el = await openWithOneSelected();
    const d = deferred<typeof restored>();
    h.restore.mockImplementationOnce(() => d.promise);
    btn(el, '元へ戻す')!.click();
    flushSync();
    expect(btn(el, '元へ戻す')!.disabled).toBe(true);
    btn(el, '元へ戻す')!.click();
    expect(h.restore).toHaveBeenCalledTimes(1);
    d.resolve(restored);
    await waitEnabled(el, '元へ戻す');
    expect(h.restore).toHaveBeenCalledTimes(1);
  });

  it('元へ戻すの途中は、完全削除を始めない（確認も出ない）', async () => {
    const el = await openWithOneSelected();
    const d = deferred<typeof restored>();
    h.restore.mockImplementationOnce(() => d.promise);
    btn(el, '元へ戻す')!.click();
    flushSync();
    expect(btn(el, '完全削除')!.disabled).toBe(true);
    // 押せないボタンでも、押しの処理（ハンドラ）は止める
    btn(el, '完全削除')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(ui.confirmReq).toBeNull();
    expect(h.purge).not.toHaveBeenCalled();
    d.resolve(restored);
    await waitEnabled(el, '完全削除');
    expect(h.purge).not.toHaveBeenCalled();
  });

  it('完全削除を重ねて押しても、確認は一つだけ。確認に答えるまで、次の操作は始まらない', async () => {
    const el = await openWithOneSelected();
    try {
      btn(el, '完全削除')!.click();
      await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
      flushSync();
      btn(el, '完全削除')!.click();
      btn(el, '完全削除')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      btn(el, '元へ戻す')!.click();
      expect(ui.confirmCount).toBe(1);
      expect(h.restore).not.toHaveBeenCalled();
      ui.confirmReq!.resolve(true);
      await vi.waitFor(() => expect(h.purge).toHaveBeenCalledTimes(1));
      await waitEnabled(el, '完全削除');
      expect(h.purge).toHaveBeenCalledTimes(1);
    } finally {
      // （確認の回数は resetUi が戻す）
    }
  });

  it('完全削除の確認を取り消すと、押せるようになり、もう一度始められる', async () => {
    const el = await openWithOneSelected();
    btn(el, '完全削除')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(false);
    await waitEnabled(el, '完全削除');
    btn(el, '完全削除')!.click();
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(h.purge).toHaveBeenCalledTimes(1));
  });

  it('置き場所を変えると、前の操作の途中でも、新しい置き場所での操作は始められる。前の操作の終わりは新しい操作に触らない', async () => {
    try {
      const el = await openWithOneSelected();
      // 前の置き場所で、元へ戻すを送ったまま応答を待つ
      const old = deferred<typeof restored>();
      h.restore.mockImplementationOnce(() => old.promise);
      btn(el, '元へ戻す')!.click();
      await vi.waitFor(() => expect(h.restore).toHaveBeenCalledTimes(1));
      // 置き場所を変える（接続先の変更の通知。選びも外す）
      switchPlace('http://b.test');
      explorerSelection.clear();
      flushSync();
      // 新しい置き場所で、選んで完全削除の確認を出す（前の操作の途中でも許す）
      fileExplorer.open('.trash');
      flushSync();
      await vi.waitFor(() => expect(names(el)).toContain('report.pdf'));
      explorerSelection.enter();
      flushSync();
      pickRow(el, 'report.pdf');
      btn(el, '完全削除')!.click();
      await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
      flushSync();
      expect(btn(el, '完全削除')!.disabled).toBe(true);
      // 前の置き場所の応答が、いま届く。新しい操作の印は外さない・新しい選びに触らない
      old.resolve(restored);
      await vi.waitFor(() => expect(toastTexts().some((t) => t.includes('置き場所が変わった'))).toBe(true));
      flushSync();
      expect(btn(el, '完全削除')!.disabled).toBe(true);
      expect(explorerSelection.paths()).toEqual([ALIAS1]);
      btn(el, '完全削除')!.click();
      expect(ui.confirmReq).not.toBeNull();
      ui.confirmReq!.resolve(true);
      await vi.waitFor(() => expect(h.purge).toHaveBeenCalledWith(ID1));
      expect(h.restore).toHaveBeenCalledTimes(1);
    } finally {
      place.key = 'http://a.test';
    }
  });
});

/* ---- 特別なフォルダの中・OS のドロップの途中で置き場所が変わったとき・ドラッグの印 ---- */

describe('特別なフォルダの中では、新しいフォルダを作れない', () => {
  it('いちばん上の ≡ には「新しいフォルダ」があり、special の中の ≡・空きスペースのメニューには無い', async () => {
    const el = await render();
    expect(menuLabels(el)).toContain('新しいフォルダ');
    fileExplorer.open('special');
    flushSync();
    await vi.waitFor(() => expect(fileExplorer.dir).toBe('special'));
    expect(menuLabels(el)).not.toContain('新しいフォルダ');
  });

  it('special の中へ、フォルダを OS からドロップしても作らず、置き場所の文で断る（ファイルは別）', async () => {
    const el = await render();
    fileExplorer.open('special');
    flushSync();
    await vi.waitFor(() => expect(fileExplorer.dir).toBe('special'));
    dropOs(el.querySelector<HTMLElement>('.file-explorer-body')!, [{ name: 'newdir', dir: true }]);
    await vi.waitFor(() => expect(ui.toasts.some((t) => t.text === '特別なフォルダ内にフォルダは作れません')).toBe(true));
    expect(h.mkdir).not.toHaveBeenCalled();
  });
});

describe('OS からのドロップの途中で置き場所が変わったら、新しい置き場所へは書かない', () => {
  const lazyFile = (name: string, gate: Promise<void>) => ({
    isFile: true,
    isDirectory: false,
    name,
    file: (ok: (f: File) => void) => void gate.then(() => ok(new File(['x'], name))),
  });
  const dropRaw = (el: HTMLElement, entries: unknown[]): void => {
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', { value: { types: ['Files'], items: entries.map((e) => ({ kind: 'file', webkitGetAsEntry: () => e })), files: [] } });
    el.dispatchEvent(ev);
  };
  const scopeToast = () => ui.toasts.some((t) => t.kind === 'error' && t.text.includes('置き場所が変わった'));

  it('同名の上書きの確認を待つあいだに変わったら、答えても送らない', async () => {
    const el = await render();
    dropOs(el.querySelector<HTMLElement>('.file-explorer-body')!, [{ name: 'a.txt' }]);
    await vi.waitFor(() => expect(ui.confirmReq).not.toBeNull());
    switchPlace('http://b.test');
    ui.confirmReq!.resolve(true);
    await vi.waitFor(() => expect(scopeToast()).toBe(true));
    expect(h.write).not.toHaveBeenCalled();
  });

  it('送り先の一覧を読んでいるあいだに変わったら、送らない', async () => {
    let finish!: (v: Entry[]) => void;
    h.list.mockImplementation((path?: string) => (path === 'docs' ? new Promise<Entry[]>((r) => (finish = r)) : Promise.resolve(h.current ?? listing)));
    const el = await render();
    fileExplorer.open('docs');
    flushSync();
    await vi.waitFor(() => expect(h.list).toHaveBeenCalledWith('docs'));
    dropOs(el.querySelector<HTMLElement>('.file-explorer-body')!, [{ name: 'n.txt' }]);
    await new Promise((r) => setTimeout(r, 30));
    place.key = 'http://b.test';
    finish([]);
    await vi.waitFor(() => expect(scopeToast()).toBe(true));
    expect(h.write).not.toHaveBeenCalled();
  });

  it('1 件目を送っているあいだに変わったら、2 件目は送らない', async () => {
    const el = await render();
    let finish!: () => void;
    h.write.mockImplementationOnce(() => new Promise((r) => (finish = () => r(entry('n1.txt')))));
    dropOs(el.querySelector<HTMLElement>('.file-explorer-body')!, [{ name: 'n1.txt' }, { name: 'n2.txt' }]);
    await vi.waitFor(() => expect(h.write).toHaveBeenCalledTimes(1));
    switchPlace('http://b.test');
    finish();
    await vi.waitFor(() => expect(scopeToast()).toBe(true));
    expect(h.write).toHaveBeenCalledTimes(1);
  });

  it('中身を読んでいるあいだに変わったら、読み終わっても送らない', async () => {
    const el = await render();
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    dropRaw(el.querySelector<HTMLElement>('.file-explorer-body')!, [lazyFile('slow.txt', gate)]);
    await vi.waitFor(() => expect(fileExplorer.dir).toBe(''));
    await new Promise((r) => setTimeout(r, 30));
    switchPlace('http://b.test');
    open();
    await vi.waitFor(() => expect(scopeToast()).toBe(true));
    expect(h.write).not.toHaveBeenCalled();
  });

  it('Linux のデスクトップのネイティブのドロップ: 中身を読んでいるあいだに変わったら送らず、読んだ id は必ず解放する', async () => {
    dsk.linux = true;
    const el = await render();
    await vi.waitFor(() => expect(osDrop.handler).not.toBeNull());
    const body = el.querySelector<HTMLElement>('.file-explorer-body')!;
    // jsdom には elementFromPoint が無い
    const orig = document.elementFromPoint;
    document.elementFromPoint = () => body;
    try {
      let release!: (v: { entries: never[]; skipped: string[] }) => void;
      osDrop.readEntries.mockImplementationOnce(() => new Promise((r) => (release = r)));
      void osDrop.handler!({ id: 7, position: { x: 5, y: 5 } });
      await vi.waitFor(() => expect(osDrop.readEntries).toHaveBeenCalledWith(7));
      switchPlace('http://b.test');
      release({ entries: [], skipped: [] });
      await vi.waitFor(() => expect(scopeToast()).toBe(true));
      await vi.waitFor(() => expect(osDrop.releaseId).toHaveBeenCalledWith(7));
      expect(h.write).not.toHaveBeenCalled();
    } finally {
      document.elementFromPoint = orig;
    }
  });
});

describe('ドラッグの印（EXPLORER_DRAG_TYPE）', () => {
  const dragEvent = (type: string, types: string[]) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    const data: Record<string, string> = {};
    Object.defineProperty(ev, 'dataTransfer', { value: { types, effectAllowed: '', setData: (k: string, v: string) => (data[k] = v), getData: (k: string) => data[k] ?? '', files: [], items: [] } });
    return { ev, data };
  };

  it('項目を運び始めると、運ぶ項目のパスを、この部品の印で持つ', async () => {
    const el = await render();
    const { ev, data } = dragEvent('dragstart', []);
    [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].find((li) => li.textContent?.includes('a.txt'))!.dispatchEvent(ev);
    expect(data[EXPLORER_DRAG_TYPE]).toBe('a.txt');
  });

  it('フォルダの上: この部品の印があるものだけ受ける（ほかの種類の運びは受けない）', async () => {
    const el = await render();
    const li = (n: string) => [...el.querySelectorAll<HTMLElement>('.file-explorer-item')].find((x) => x.textContent?.includes(n))!;
    li('a.txt').dispatchEvent(dragEvent('dragstart', []).ev);
    const mine = dragEvent('dragover', [EXPLORER_DRAG_TYPE]).ev;
    li('docs').dispatchEvent(mine);
    expect(mine.defaultPrevented).toBe(true);
    const other = dragEvent('dragover', ['text/plain']).ev;
    li('docs').dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });
});
