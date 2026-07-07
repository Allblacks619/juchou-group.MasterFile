import { describe, it, expect } from "vitest";
import { buildTemplateTree, DEFAULT_TEMPLATE_DATA, type TemplateRow } from "../../shared/genba/template";

describe("buildTemplateTree", () => {
  it("フラット行を parentId で親子ツリーに組み立て、sortOrderで並べる", () => {
    const rows: TemplateRow[] = [
      { id: "b", parentId: "a", name: "子1", romaji: null, sortOrder: 1 },
      { id: "a", parentId: null, name: "親", romaji: null, sortOrder: 0 },
      { id: "c", parentId: "a", name: "子0", romaji: null, sortOrder: 0 },
    ];
    const tree = buildTemplateTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe("親");
    expect(tree[0].children.map((n) => n.name)).toEqual(["子0", "子1"]);
  });

  it("既定テンプレートは電気工事の標準作業を含む", () => {
    expect(DEFAULT_TEMPLATE_DATA.some((n) => n.name === "配線")).toBe(true);
    const haisen = DEFAULT_TEMPLATE_DATA.find((n) => n.name === "配線");
    expect(haisen?.children?.some((c) => c.name === "強電配線")).toBe(true);
  });
});
