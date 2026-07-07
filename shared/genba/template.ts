/**
 * 現場ビジョン: 作業テンプレート。
 * プロトタイプ GenbaAppV18.jsx の DEFAULT_TEMPLATE_DATA を移植 (電気工事の標準作業ツリー)。
 * DBの genba_task_templates が空のときの初期値/フォールバックとして使う。
 */

export type TemplateNode = { name: string; romaji?: string; children?: TemplateNode[] };

export const DEFAULT_TEMPLATE_DATA: TemplateNode[] = [
  { name: "壁の墨出し" },
  { name: "天井の墨出し" },
  { name: "建て込み", children: [{ name: "ボックス取り付け" }, { name: "配管取り付け" }] },
  { name: "貫通配管" },
  { name: "配管", children: [{ name: "ダクター取り付け" }, { name: "ボックス取り付け" }, { name: "ボンドアース" }] },
  { name: "区画処理" },
  { name: "レースウェイ取り付け", children: [{ name: "全ネジ取り付け" }, { name: "ダクター取り付け" }, { name: "アース取り付け" }] },
  { name: "ラック取り付け", children: [{ name: "全ネジ取り付け" }, { name: "ダクター取り付け" }, { name: "ラック敷設" }] },
  {
    name: "配線",
    children: [
      { name: "配線ルート取り付け" },
      { name: "強電配線", children: [{ name: "電灯配線" }, { name: "非常照明配線" }, { name: "コンセント配線" }, { name: "動力配線" }, { name: "幹線引き" }] },
      { name: "弱電配線", children: [{ name: "自火報配線" }, { name: "SP配線" }, { name: "弱電配線" }] },
    ],
  },
];

/** DBのフラット行 (parentId で親子) からツリーを組み立てる */
export type TemplateRow = { id: string; parentId: string | null; name: string; romaji: string | null; sortOrder: number };
export type TemplateTreeNode = { id: string; name: string; romaji: string | null; children: TemplateTreeNode[] };

export function buildTemplateTree(rows: TemplateRow[]): TemplateTreeNode[] {
  const byParent = new Map<string | null, TemplateRow[]>();
  for (const r of rows) {
    const arr = byParent.get(r.parentId ?? null) || [];
    arr.push(r);
    byParent.set(r.parentId ?? null, arr);
  }
  const build = (parentId: string | null): TemplateTreeNode[] =>
    (byParent.get(parentId) || [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({ id: r.id, name: r.name, romaji: r.romaji, children: build(r.id) }));
  return build(null);
}
