import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { genbaActivityLogs, genbaTaskTemplates } from "../drizzle/schema.genba";
import { addGenbaActivityLog, replaceGenbaTaskTemplates } from "./genba/db";

const dbMock = vi.hoisted(() => ({
  where: vi.fn(async (_condition: unknown) => {}),
  values: vi.fn(async (_rows: unknown) => {}),
  delete: vi.fn(),
  insert: vi.fn(),
}));
vi.mock("./db", () => ({ getDb: async () => dbMock }));

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.delete.mockReturnValue({ where: dbMock.where });
  dbMock.insert.mockReturnValue({ values: dbMock.values });
});

describe("genba テナント書き込みのDB境界（実DBへ接続しない）", () => {
  it("会社2の空テンプレート保存も会社2のDELETE条件を保持する", async () => {
    await replaceGenbaTaskTemplates([], 2);
    expect(dbMock.delete).toHaveBeenCalledWith(genbaTaskTemplates);
    expect(dbMock.where).toHaveBeenCalledTimes(1);
    const condition = dbMock.where.mock.calls[0][0];
    const query = new MySqlDialect().sqlToQuery(condition as any);
    expect(query.sql).toBe("`genba_task_templates`.`companyId` = ?");
    expect(query.params).toEqual([2]);
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("会社指定無しでは従来の全置換APIを維持する", async () => {
    await replaceGenbaTaskTemplates([]);
    expect(dbMock.delete).toHaveBeenCalledWith(genbaTaskTemplates);
    expect(dbMock.where).not.toHaveBeenCalled();
  });

  it("活動ログに会社2を渡すと実際のINSERT値にも保持する", async () => {
    await addGenbaActivityLog("status", null, { taskId: "Genba_Beta_Task_C2" }, 2);
    expect(dbMock.insert).toHaveBeenCalledWith(genbaActivityLogs);
    expect(dbMock.values).toHaveBeenCalledWith(expect.objectContaining({ companyId: 2 }));
  });

  it("会社指定無しの活動ログは既存DB既定値を維持する", async () => {
    await addGenbaActivityLog("status", null, { taskId: "Genba_Beta_Task_C1" });
    expect(dbMock.values.mock.calls[0][0]).not.toHaveProperty("companyId");
  });
});
