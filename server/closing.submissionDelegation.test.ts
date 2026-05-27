import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

const state = vi.hoisted(() => ({
  closings: new Map<string, any>(),
  submissions: new Map<string, any>(),
  attendance: [] as any[],
}));

vi.mock("./db", () => ({
  getEmployeeByUserId: vi.fn(async (userId: number) => userId === 1 ? { id: 1, nameKanji: "管理者" } : { id: 100, nameKanji: "作業員A" }),
  getUserById: vi.fn(async (id: number) => ({ id, appRole: id === 1 ? "admin" : "worker" })),
  getEmployeeById: vi.fn(async (id: number) => ({ id, nameKanji: id === 100 ? "作業員A" : "作業員B" })),
  getProjectClosingByProjectMonth: vi.fn(async (projectId:number, closingMonth:string)=>state.closings.get(`${projectId}:${closingMonth}`)||null),
  createProjectClosing: vi.fn(async (data:any)=>{ const c={id:501,...data,status:"open"}; state.closings.set(`${data.projectId}:${data.closingMonth}`,c); return c; }),
  getAttendanceByProject: vi.fn(async (projectId:number,start:Date,end:Date)=>state.attendance.filter(a=>a.projectId===projectId&&a.workDate>=start&&a.workDate<=end)),
  getAttendanceByDateRange: vi.fn(async (start:Date,end:Date)=>state.attendance.filter(a=>a.workDate>=start&&a.workDate<=end)),
  getProjectMembers: vi.fn(async ()=>[]),
  getClosingSubmissionsByClosing: vi.fn(async (closingId:number)=>Array.from(state.submissions.values()).filter((s:any)=>s.closingId===closingId)),
  upsertClosingSubmission: vi.fn(async (data:any)=>{ const key=`${data.closingId}:${data.employeeId}`; const row={id:900,...data,status:data.status||"pending"}; state.submissions.set(key,row); return row; }),
  getClosingSubmissionByClosingEmployee: vi.fn(async (closingId:number,employeeId:number)=>state.submissions.get(`${closingId}:${employeeId}`)||null),
  getProjectById: vi.fn(async (id:number)=>({id,name:"現場A",clientId:null})),
  getAllProjects: vi.fn(async ()=>[{id:10,name:"現場A"},{id:11,name:"現場B"}]),
  getClientById: vi.fn(async ()=>null),
  getAllEmployees: vi.fn(async ()=>[{id:100,nameKanji:"作業員A"},{id:1,nameKanji:"管理者"}]),
  listClosingSubmissionDocuments: vi.fn(async ()=>[]),
  createAuditLog: vi.fn(async()=>({id:1})),
}));
import { appRouter } from "./routers";

function ctx(user: Partial<User>): TrpcContext { return { user: { id: 1, appRole: "admin", role:"admin", openId:"", email:"", name:"", loginMethod:"manus", loginId:"", mustChangePassword:false, employeeId:null, createdAt:new Date(), updatedAt:new Date(), lastSignedIn:new Date(), ...user } as any, req:{} as any,res:{} as any}; }

describe("closing delegation", ()=>{
  beforeEach(()=>{ state.closings.clear(); state.submissions.clear(); state.attendance = []; vi.clearAllMocks(); });

  it("eligible when non-guest attendance exists without pre-initialized closing", async ()=>{
    state.attendance = [{ projectId: 10, employeeId: 100, workDate: new Date("2026-05-10"), workType: "normal" }];
    const caller = appRouter.createCaller(ctx({ id:1, appRole:"admin" } as any));
    const result = await caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05", employeeId:100 });
    expect(result.eligible).toBe(true);
    expect(result.employee?.id).toBe(100);
    expect(result.monthlyOverview?.projectLines?.length).toBeGreaterThan(0);
  });

  it("not eligible when no non-guest attendance in month", async ()=>{
    state.attendance = [{ projectId: 10, employeeId: 100, workDate: new Date("2026-04-10"), workType: "normal" }];
    const caller = appRouter.createCaller(ctx({ id:2, appRole:"worker" } as any));
    const result = await caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05", employeeId:100 });
    expect(result.eligible).toBe(false);
    expect(result.nonTargetReason).toBe("no_attendance");
  });

  it("does not mix 2025 and 2026 attendance", async ()=>{
    state.attendance = [
      { projectId: 10, employeeId: 100, workDate: new Date("2025-05-10"), workType: "normal" },
      { projectId: 10, employeeId: 100, workDate: new Date("2026-05-10"), workType: "normal" },
    ];
    const caller = appRouter.createCaller(ctx({ id:2, appRole:"worker" } as any));
    const result2025 = await caller.closing.mySubmission({ projectId:10, closingMonth:"2025-05" });
    const result2026 = await caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05" });
    expect(result2025.eligible).toBe(true);
    expect(result2026.eligible).toBe(true);
  });

  it("guest-only attendance does not count as eligible", async ()=>{
    state.attendance = [{ projectId: 10, employeeId: null, guestName: "ゲスト", workDate: new Date("2026-05-10"), workType: "normal" }];
    const caller = appRouter.createCaller(ctx({ id:2, appRole:"worker" } as any));
    const result = await caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05" });
    expect(result.eligible).toBe(false);
  });

  it("includes multiple project lines in same month", async ()=>{
    state.attendance = [
      { projectId: 10, employeeId: 100, workDate: new Date("2026-05-10"), workType: "normal" },
      { projectId: 11, employeeId: 100, workDate: new Date("2026-05-11"), workType: "normal" },
    ];
    const caller = appRouter.createCaller(ctx({ id:2, appRole:"worker" } as any));
    const result = await caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05" });
    expect(result.monthlyOverview?.projectLines?.length).toBe(1);
    const overview = await caller.closing.workerMonthlyOverview({ closingMonth:"2026-05" });
    expect(overview.projectLines.length).toBe(2);
  });

  it("admin delegated requires employeeId", async ()=>{
    state.attendance = [{ projectId: 10, employeeId: 100, workDate: new Date("2026-05-10"), workType: "normal" }];
    const caller = appRouter.createCaller(ctx({ id:1, appRole:"admin" } as any));
    await expect(caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05" } as any)).rejects.toThrow(/target employee required/);
  });

  it("admin delegated works for target employee attendance", async ()=>{
    state.attendance = [{ projectId: 10, employeeId: 100, workDate: new Date("2026-05-10"), workType: "normal" }];
    const caller = appRouter.createCaller(ctx({ id:1, appRole:"admin" } as any));
    const result = await caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05", employeeId:100 });
    expect(result.eligible).toBe(true);
    expect(result.employee?.id).toBe(100);
  });

  it("inactive historical worker attendance remains eligible", async ()=>{
    state.attendance = [{ projectId: 10, employeeId: 100, workDate: new Date("2026-05-10"), workType: "normal" }];
    const caller = appRouter.createCaller(ctx({ id:2, appRole:"worker" } as any));
    const result = await caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05" });
    expect(result.eligible).toBe(true);
  });

  it("worker cannot access another employee by employeeId param", async ()=>{
    state.attendance = [{ projectId: 10, employeeId: 100, workDate: new Date("2026-05-10"), workType: "normal" }];
    const caller = appRouter.createCaller(ctx({ id:2, appRole:"worker" } as any));
    await expect(caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05", employeeId:1 })).rejects.toThrow(/他の作業員/);
    const result = await caller.closing.mySubmission({ projectId:10, closingMonth:"2026-05", employeeId:100 });
    expect(result.employee?.id).toBe(100);
  });
});
