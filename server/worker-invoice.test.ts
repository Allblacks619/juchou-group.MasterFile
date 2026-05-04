import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import type { User } from '../drizzle/schema';

const invoices: any[] = [];
const snapshots: any[] = [];

vi.mock('./db', () => ({
  getEmployeeByUserId: vi.fn(async (id:number)=> id===2?{id:10,userId:2}:{id:11,userId:3}),
  getProjectClosingByProjectMonth: vi.fn(async ()=>({id:100,projectId:1,closingMonth:'2026-04',status:'open'})),
  createProjectClosing: vi.fn(async ()=>({id:100})),
  getProjectMembersByProject: vi.fn(async ()=>[{employeeId:10,isActive:true},{employeeId:11,isActive:true}]),
  getProjectMembers: vi.fn(async ()=>[{employeeId:10,isActive:true},{employeeId:11,isActive:true}]),
  getAttendanceByProject: vi.fn(async ()=>[]),
  getClosingSubmissionsByClosing: vi.fn(async ()=>[{id:501,closingId:100,employeeId:10,transportAmount:1000,expenseAmount:500,status:'submitted'},{id:502,closingId:100,employeeId:11,transportAmount:999,expenseAmount:1,status:'submitted'}]),
  getClosingSubmissionByClosingEmployee: vi.fn(async (_:number,eid:number)=> eid===10?{id:501,closingId:100,employeeId:10,transportAmount:1000,expenseAmount:500,status:'submitted'}:{id:502,closingId:100,employeeId:11,transportAmount:999,expenseAmount:1,status:'submitted'}),
  updateClosingSubmission: vi.fn(async ()=>({})),
  getWorkerInvoiceByClosingEmployee: vi.fn(async (cid:number,eid:number)=>invoices.find(v=>v.closingId===cid&&v.employeeId===eid)),
  upsertWorkerInvoice: vi.fn(async (v:any)=>{ const i=invoices.findIndex(x=>x.closingId===v.closingId&&x.employeeId===v.employeeId); const nv={id:i>=0?invoices[i].id:invoices.length+1,...(i>=0?invoices[i]:{}),...v}; if(i>=0)invoices[i]=nv; else invoices.push(nv); return nv;}),
  getWorkerInvoicesByEmployee: vi.fn(async (eid:number)=>invoices.filter(v=>v.employeeId===eid)),
  listWorkerInvoicesForReview: vi.fn(async ()=>invoices),
  getSupportingDocumentsBySubmission: vi.fn(async (sid:number)=>[{id:1,submissionId:sid,fileKey:'k1'}]),
  createWorkerInvoiceSnapshot: vi.fn(async (s:any)=>{ snapshots.push(s); return {id:snapshots.length,...s}; }),
  getWorkerInvoiceById: vi.fn(async (id:number)=>invoices.find(v=>v.id===id)),
  updateWorkerInvoice: vi.fn(async (id:number,data:any)=>{ const i=invoices.findIndex(v=>v.id===id); if(i>=0) invoices[i]={...invoices[i],...data}; return invoices[i]; }),
}));

const ctx=(u:User)=>({user:u,req:{} as any,res:{} as any});
const mkUser=(id:number,appRole:any,employeeId:number):User=>({id,openId:'o'+id,name:'u',email:'e',loginMethod:'manus',role:'user',appRole,loginId:'l'+id,mustChangePassword:false,employeeId,createdAt:new Date(),updatedAt:new Date(),lastSignedIn:new Date()});

describe('worker invoice access/snapshot',()=>{
  beforeEach(()=>{invoices.length=0;snapshots.length=0;});
  it('worker cannot see another worker invoices', async()=>{
    invoices.push({id:1,closingId:100,employeeId:11,status:'submitted'});
    const caller=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    const mine=await caller.workerInvoice.listMyInvoices();
    expect(mine).toHaveLength(0);
  });
  it('admin can review', async()=>{
    invoices.push({id:1,closingId:100,employeeId:11,status:'submitted'});
    const caller=appRouter.createCaller(ctx(mkUser(5,'admin',99)));
    const list=await caller.workerInvoice.listForReview();
    expect(list.length).toBe(1);
  });

  it('worker cannot preview another worker invoice', async()=>{
    invoices.push({id:7,closingId:100,employeeId:11,status:'submitted',closingMonth:'2026-04',subtotalAmount:1,taxAmount:0,totalAmount:1,createdAt:new Date()});
    const caller=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await expect(caller.workerInvoice.previewMyInvoice({invoiceId:7})).rejects.toThrow();
  });
  it('returnInvoice makes editable again and approve locks worker edits', async()=>{
    invoices.push({id:8,closingId:100,submissionId:501,projectId:1,employeeId:10,closingMonth:'2026-04',status:'submitted'});
    const admin=appRouter.createCaller(ctx(mkUser(9,'admin',99)));
    await admin.workerInvoice.returnInvoice({invoiceId:8,reason:'fix'});
    expect(invoices.find(v=>v.id===8)?.status).toBe('returned');
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await worker.workerInvoice.saveMyDraft({projectId:1,closingMonth:'2026-04',subject:'x',notes:'y'});
    await admin.workerInvoice.approveInvoice({invoiceId:8});
    await expect(worker.workerInvoice.saveMyDraft({projectId:1,closingMonth:'2026-04',subject:'x',notes:'y'})).rejects.toThrow();
  });
  it('export package includes supporting document references', async()=>{
    invoices.push({id:9,closingId:100,submissionId:501,projectId:1,employeeId:10,closingMonth:'2026-04',status:'submitted',subtotalAmount:1,taxAmount:0,totalAmount:1,createdAt:new Date()});
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    const out=await worker.workerInvoice.exportMyInvoicePackage({invoiceId:9});
    expect(out.grouped[0].supportingDocuments[0].fileKey).toBe('k1');
  });
  it('submit creates snapshot with attachment refs', async()=>{
    const caller=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await caller.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'});
    expect(snapshots[0].snapshotJson).toContain('fileKey');
  });
});
