// パスの小さな決まり（親のフォルダ・名前・子）。置き場所のいちばん上からの相対パスで、区切りは `/`。いちばん上は空文字。

/** 親のフォルダのパス（直下なら空文字） */
export function parentOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

/** 最後の区切りの後ろ（名前） */
export function baseName(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

/** 直下の子のパス（dir が空なら名前だけ） */
export function childPath(dir: string, name: string): string {
  return dir === '' ? name : `${dir}/${name}`;
}
