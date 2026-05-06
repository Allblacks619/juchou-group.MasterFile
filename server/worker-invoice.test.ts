import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import type { User } from '../drizzle/schema';

const invoices: any[] = [];
const snapshots: any[] = [];

vi.mock('./db', () => ({
  getEmployeeByUserId: vi.fn(async (id:number)=> id===2?{id:10,userId:2,nameKanji:'W1',bankName:'Bank',branchName:'Br',accountType:'ordinary',accountNumber:'123',accountHolder:'W1',createdAt:new Date(),updatedAt:new Date()}:{id:11,userId:3,nameKanji:'W2',bankName:'Bank',branchName:'Br',accountType:'ordinary',accountNumber:'456',accountHolder:'W2',createdAt:new Date(),updatedAt:new Date()}),
  getProjectClosingByProjectMonth: vi.fn(async ()=>({id:100,projectId:1,closingMonth:'2026-04',status:'open',createdAt:new Date(),updatedAt:new Date()})),
  createProjectClosing: vi.fn(async ()=>({id:100,projectId:1,closingMonth:'2026-04',status:'open',createdAt:new Date(),updatedAt:new Date()})),
  getProjectMembersByProject: vi.fn(async ()=>[{id:1,projectId:1,employeeId:10,isActive:true,createdAt:new Date(),updatedAt:new Date()},{id:2,projectId:1,employeeId:11,isActive:true,createdAt:new Date(),updatedAt:new Date()}]),
  getProjectMembers: vi.fn(async ()=>[{id:1,projectId:1,employeeId:10,isActive:true,createdAt:new Date(),updatedAt:new Date()},{id:2,projectId:1,employeeId:11,isActive:true,createdAt:new Date(),updatedAt:new Date()}]),
  ensureClosingInitializedForProjectMonth: vi.fn(async (pid:number,month:string)=>({id:100,projectId:pid,closingMonth:month,status:'open',createdAt:new Date(),updatedAt:new Date()})),
  upsertClosingSubmission: vi.fn(async (v:any)=>({...v,createdAt:new Date(),updatedAt:new Date()})),
  getAttendanceByProject: vi.fn(async ()=>[{id:1,projectId:1,employeeId:10,workDate:'2026-04-01',workHours:8,transportAmount:1000,createdAt:new Date(),updatedAt:new Date()}]),
  getClosingSubmissionsByClosing: vi.fn(async ()=>[{id:501,closingId:100,employeeId:10,transportAmount:1000,expenseAmount:500,status:'submitted',subject:'Work',notes:'',createdAt:new Date(),updatedAt:new Date()},{id:502,closingId:100,employeeId:11,transportAmount:999,expenseAmount:1,status:'submitted',subject:'Work',notes:'',createdAt:new Date(),updatedAt:new Date()}]),
  getClosingSubmissionByClosingEmployee: vi.fn(async (_:number,eid:number)=> eid===10?{id:501,closingId:100,employeeId:10,transportAmount:1000,expenseAmount:500,status:'submitted',subject:'Work',notes:'',createdAt:new Date(),updatedAt:new Date()}:{id:502,closingId:100,employeeId:11,transportAmount:999,expenseAmount:1,status:'submitted',subject:'Work',notes:'',createdAt:new Date(),updatedAt:new Date()}),
  updateClosingSubmission: vi.fn(async (v:any)=>({...v,createdAt:new Date(),updatedAt:new Date()})),
  getWorkerInvoiceByClosingEmployee: vi.fn(async (cid:number,eid:number)=>{const inv=invoices.find(v=>v.closingId===cid&&v.employeeId===eid);return inv?{...inv,createdAt:new Date(),updatedAt:new Date()}:null;}),
  upsertWorkerInvoice: vi.fn(async (v:any)=>{ const i=invoices.findIndex(x=>x.closingId===v.closingId&&x.employeeId===v.employeeId); const nv={id:i>=0?invoices[i].id:invoices.length+1,...(i>=0?invoices[i]:{}),...v,createdAt:new Date(),updatedAt:new Date()}; if(i>=0)invoices[i]=nv; else invoices.push(nv); return nv;}),
  getWorkerInvoicesByEmployee: vi.fn(async (eid:number)=>invoices.filter(v=>v.employeeId===eid).map(v=>({...v,createdAt:new Date(),updatedAt:new Date()}))),
  listWorkerInvoicesForReview: vi.fn(async ()=>invoices.map(v=>({...v,createdAt:new Date(),updatedAt:new Date()}))),
  getSupportingDocumentsBySubmission: vi.fn(async (sid:number)=>[{id:1,submissionId:sid,fileKey:'k1',originalFileName:'doc.pdf',createdAt:new Date(),updatedAt:new Date()}]),
  getAttendanceBySubmission: vi.fn(async (sid:number)=>[{id:1,submissionId:sid,employeeId:10,workDate:'2026-04-01',workHours:8,transportAmount:1000,createdAt:new Date(),updatedAt:new Date()}]),
  getWorkerInvoiceItems: vi.fn(async ()=>[{id:1,workerInvoiceId:1,label:'Labor',quantity:8,unit:'hours',unitPrice:5000,amount:40000,taxRate:10,category:'labor',createdAt:new Date(),updatedAt:new Date()}]),
  calculateInvoiceAmounts: vi.fn(async (items:any[])=>({subtotal:40000,tax:4000,total:44000})),
  replaceWorkerInvoiceItems: vi.fn(async (id:number,items:any[])=>{}),
  updateWorkerInvoice: vi.fn(async (v:any)=>({...v,createdAt:new Date(),updatedAt:new Date()})),
  getClosingById: vi.fn(async (id:number)=>({id,projectId:1,closingMonth:'2026-04',status:'open',createdAt:new Date(),updatedAt:new Date()})),
  getWorkerInvoiceById: vi.fn(async (id:number)=>({id,status:'draft',subtotalAmount:0,taxAmount:0,totalAmount:0,createdAt:new Date(),updatedAt:new Date()})),
  getEmployeeById: vi.fn(async (id:number)=>({id,nameKanji:'Worker',address:'Addr',phone:'090-1234-5678',bankName:'Bank',branchName:'Branch',accountType:'ordinary',accountNumber:'123456',accountHolder:'Worker',userId:id,createdAt:new Date(),updatedAt:new Date()})),
  getProjectById: vi.fn(async (id:number)=>({id,name:'Project',closingMonth:'2026-04',clientId:1,status:'active',createdAt:new Date(),updatedAt:new Date()})),
  getCompanyProfile: vi.fn(async ()=>({id:1,companyName:'充寵グループ',address:'Tokyo',logoSettings:null,sealSettings:null,createdAt:new Date(),updatedAt:new Date()})),
  createWorkerInvoiceSnapshot: vi.fn(async (s:any)=>{ snapshots.push(s); return {id:snapshots.length,...s,createdAt:new Date(),updatedAt:new Date()}; }),
  getClosingSubmissionById: vi.fn(async (id:number)=>({id,closingId:100,employeeId:10,status:'draft',createdAt:new Date(),updatedAt:new Date()})),
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
  it('submit creates snapshot with attachment refs', async()=>{
    const caller=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await caller.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'});
    expect(snapshots[0].snapshotJson).toContain('fileKey');
  });
});
