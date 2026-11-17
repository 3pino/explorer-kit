import { vi } from 'vitest';
import { basicNameError } from '../ops';
import { basicViewerKind, isImageName } from '../kinds';
import type { Entry, EntryUrls, ExplorerApi, ExplorerHost, Rules, TrashEntry } from '../types';

// 試験用の置き場所と本体。置き場所は、メモリの中の木（パス → 項目）。

export const file = (path: string, size = 1): Entry => ({
  name: path.split('/').pop()!, path, kind: 'file', size, modified: 0, mime: null, message_id: null, file_id: null,
});
export const dir = (path: string): Entry => ({ ...file(path, 0), kind: 'dir' });

/** 特別なフォルダの無い、ふつうの置き場所の決まり */
export const PLAIN_RULES: Rules = { specialDir: null, nameError: (_dir, name) => basicNameError(name) };

export function fakeApi(initial: Entry[]): ExplorerApi & { tree: Map<string, Entry> } {
  const tree = new Map(initial.map((e) => [e.path, e]));
  const parent = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  return {
    tree,
    list: vi.fn(async (path: string) => [...tree.values()].filter((e) => parent(e.path) === path)),
    write: vi.fn(async (path: string) => {
      const e = file(path);
      tree.set(path, e);
      return e;
    }),
    mkdir: vi.fn(async (path: string) => {
      const e = dir(path);
      tree.set(path, e);
      return e;
    }),
    trash: vi.fn(async (path: string): Promise<TrashEntry> => {
      tree.delete(path);
      return { id: `id-${path}`, original_path: path, kind: 'file', size: 1, deleted_at: 0 };
    }),
    restore: vi.fn(async (id: string) => file(id.replace(/^id-/, ''))),
    purge: vi.fn(async () => {}),
    size: vi.fn(async () => ({ size: 0, files: 0, dirs: 0 })),
    move: vi.fn(async (from: string, to: string) => {
      const e = { ...tree.get(from)!, path: to, name: to.split('/').pop()! };
      tree.delete(from);
      tree.set(to, e);
      return e;
    }),
    copy: vi.fn(async (from: string, to: string) => {
      const e = { ...tree.get(from)!, path: to, name: to.split('/').pop()! };
      tree.set(to, e);
      return e;
    }),
    upload: vi.fn((path: string) => ({ promise: Promise.resolve(file(path)), abort: () => {} })),
  };
}

export const fakeUrls: EntryUrls = {
  href: (e) => `fake://${e.path}`,
  readUrl: (e) => `fake://${e.path}`,
  thumbUrl: () => null,
  pdfSource: () => null,
};

export function fakeHost(over: Partial<ExplorerHost> = {}): ExplorerHost {
  return {
    toast: vi.fn(),
    confirm: vi.fn(async () => true),
    addBack: vi.fn(() => () => {}),
    openViewer: vi.fn(),
    viewerKind: basicViewerKind,
    isImage: isImageName,
    errorText: (e) => (e instanceof Error ? e.message : String(e)),
    log: vi.fn(),
    platform: { isTauri: () => true, osName: () => 'linux', isLinuxDesktop: () => false },
    clipboard: {
      copyText: vi.fn(async () => true),
      peek: vi.fn(async () => ({ text: false, image: false })),
      readText: vi.fn(async () => null),
      readImage: vi.fn(async () => null),
      readNativeImage: vi.fn(async () => null),
      textName: () => 'clip.txt',
    },
    download: { file: vi.fn(async () => {}), intercept: vi.fn(() => false) },
    osDrop: {
      listenNative: async () => () => {},
      listen: async () => () => {},
      entries: async () => ({ entries: [], skipped: [] }),
      release: async () => {},
      rootsOf: () => [],
      entriesFromRoots: async () => [],
    },
    ...over,
  };
}
