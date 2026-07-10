import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import type { User } from '../drizzle/schema';

const invoices: any[] = [];
const snapshots: any[] = [];
const storageState = vi.hoisted(() => ({ stored: new Set<string>(), putCalls: [] as string[], getCalls: [] as string[] }));

function addInvoiceWithSnapshot(id: number, employeeId = 10, docs: any[] = [{ id: 1, fileKey: 'k1', originalFileName: 'receipt.pdf' }]) {
  const invoice = { id, closingId: 100, submissionId: employeeId === 10 ? 501 : 502, projectId: 1, employeeId, closingMonth: '2026-04', status: 'submitted', invoiceNumber: `WI-${id}`, subject: 'snapshot subject', subtotalAmount: 1500, taxAmount: 0, totalAmount: 1500, createdAt: new Date('2026-04-30') };
  invoices.push(invoice);
  snapshots.push({
    id,
    workerInvoiceId: id,
    createdAt: new Date('2026-05-01'),
    snapshotJson: JSON.stringify({
      invoice,
      submission: { transportAmount: 1000, expenseAmount: 500 },
      items: [],
      project: { id: 1, name: 'P1' },
      company: { companyName: 'Juchou', address: 'Tokyo', phone: '03', email: 'billing@example.com' },
      worker: { id: employeeId, nameKanji: `W${employeeId}`, invoiceIssuerNumber: 'T1234567890123', bankName: 'Bank', branchName: 'Main', accountType: 'ordinary', accountNumber: '123', accountHolder: 'W' },
      supportingDocuments: docs,
    }),
  });
  return invoice;
}

vi.mock('./db', () => ({
  getEmployeeByUserId: vi.fn(async (id:number)=> id===2?{id:10,userId:2}:id===3?{id:11,userId:3}:{id:12,userId:4}),
  getProjectClosingByProjectMonth: vi.fn(async ()=>({id:100,projectId:1,closingMonth:'2026-04',status:'open'})),
  createProjectClosing: vi.fn(async ()=>({id:100})),
  getProjectMembersByProject: vi.fn(async ()=>[{employeeId:10,isActive:true},{employeeId:11,isActive:true}]),
  getProjectMembers: vi.fn(async ()=>[{employeeId:10,isActive:true},{employeeId:11,isActive:true}]),
  getAttendanceByProject: vi.fn(async ()=>[]),
  getClosingSubmissionsByClosing: vi.fn(async ()=>[{id:501,closingId:100,employeeId:10,transportAmount:1000,expenseAmount:500,status:'submitted'},{id:502,closingId:100,employeeId:11,transportAmount:999,expenseAmount:1,status:'submitted'}]),
  getClosingSubmissionByClosingEmployee: vi.fn(async (_:number,eid:number)=> eid===10?{id:501,closingId:100,employeeId:10,transportAmount:1000,expenseAmount:500,status:'submitted'}:{id:502,closingId:100,employeeId:11,transportAmount:999,expenseAmount:1,status:'submitted'}),
  updateClosingSubmission: vi.fn(async ()=>({})),
  getWorkerInvoiceByClosingEmployee: vi.fn(async (cid:number,eid:number)=>invoices.find(v=>v.closingId===cid&&v.employeeId===eid)),
  upsertWorkerInvoice: vi.fn(async (v:any)=>{ const dup=invoices.find(x=>x.invoiceNumber&&v.invoiceNumber&&x.invoiceNumber===v.invoiceNumber && !(x.closingId===v.closingId&&x.employeeId===v.employeeId)); if(dup){ const e:any=new Error('Duplicate entry'); e.code='ER_DUP_ENTRY'; throw e;} const i=invoices.findIndex(x=>x.closingId===v.closingId&&x.employeeId===v.employeeId); const nv={id:i>=0?invoices[i].id:invoices.length+1,...(i>=0?invoices[i]:{}),...v}; if(i>=0)invoices[i]=nv; else invoices.push(nv); return nv;}),
  getWorkerInvoicesByEmployee: vi.fn(async (eid:number)=>invoices.filter(v=>v.employeeId===eid)),
  listWorkerInvoicesForReview: vi.fn(async ()=>invoices),
  getSupportingDocumentsBySubmission: vi.fn(async (sid:number)=>[{id:1,submissionId:sid,fileKey:'k1',originalFileName:'receipt.pdf'}]),
  getWorkerInvoiceItems: vi.fn(async ()=>[]),
  createWorkerInvoiceSnapshot: vi.fn(async (s:any)=>{ snapshots.push(s); return {id:snapshots.length,...s}; }),
  getWorkerInvoiceById: vi.fn(async (id:number)=>invoices.find(v=>v.id===id)),
  getWorkerInvoiceSnapshots: vi.fn(async (id:number)=>snapshots.filter((s:any)=>s.workerInvoiceId===id)),
  getProjectById: vi.fn(async ()=>({id:1,name:'P1',clientId:77})),
  getCompanyProfile: vi.fn(async ()=>({companyName:'Juchou',address:'Tokyo',phone:'03',email:'billing@example.com'})),
  getEmployeeById: vi.fn(async (id:number)=>({id,nameKanji:`W${id}`,invoiceIssuerNumber:'T1234567890123',bankName:'Bank',branchName:'Main',accountType:'ordinary',accountNumber:'123',accountHolder:'W',stampUrl:null})),
  updateWorkerInvoice: vi.fn(async (id:number,data:any)=>{ const i=invoices.findIndex(v=>v.id===id); if(i>=0) invoices[i]={...invoices[i],...data}; return invoices[i]; }),
  replaceWorkerInvoiceItems: vi.fn(async ()=>({})),
  createAuditLog: vi.fn(async ()=>({id:1})),
}));
vi.mock('./storage', () => ({
  storagePut: vi.fn(async (k:string)=>{ storageState.putCalls.push(k); storageState.stored.add(k); return {key:k,url:`https://example.com/${k}`}; }),
  storageGet: vi.fn(async (k:string)=>{ storageState.getCalls.push(k); if (!storageState.stored.has(k)) throw new Error('missing'); return {key:k,url:`https://example.com/${k}`}; }),
}));

const ctx=(u:User)=>({user:u,req:{} as any,res:{} as any});
const mkUser=(id:number,appRole:any,employeeId:number):User=>({id,openId:'o'+id,name:'u',email:'e',loginMethod:'manus',role:'user',appRole,loginId:'l'+id,mustChangePassword:false,employeeId,createdAt:new Date(),updatedAt:new Date(),lastSignedIn:new Date()});

describe('worker invoice access/snapshot',()=>{
  beforeEach(()=>{invoices.length=0;snapshots.length=0; storageState.stored.clear(); storageState.putCalls.length=0; storageState.getCalls.length=0; storageState.stored.add('k1'); storageState.stored.add('k2');});
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
    addInvoiceWithSnapshot(7, 11, []);
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
    await admin.workerInvoice.approve({invoiceId:8});
    await expect(worker.workerInvoice.saveMyDraft({projectId:1,closingMonth:'2026-04',subject:'x',notes:'y'})).rejects.toThrow();
  });
  it('downloadMyInvoicePdf returns real PDF metadata and generates when missing', async()=>{
    addInvoiceWithSnapshot(9);
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    const out=await worker.workerInvoice.downloadMyInvoicePdf({invoiceId:9});
    expect(out.mimeType).toBe('application/pdf');
    expect(out.url).toContain('worker-invoices/9/invoice.pdf');
    expect(out.generated).toBe(true);
    expect(storageState.putCalls).toContain('worker-invoices/9/invoice.pdf');
  });
  it('exportMyInvoicePackage returns existing PDF without regenerating', async()=>{
    addInvoiceWithSnapshot(10);
    storageState.stored.add('worker-invoices/10/invoice.pdf');
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    const out=await worker.workerInvoice.exportMyInvoicePackage({invoiceId:10});
    expect(out.invoicePdf.generated).toBe(false);
    expect(storageState.putCalls).not.toContain('worker-invoices/10/invoice.pdf');
  });
  it('exportMyInvoicePackage generates PDF if missing and includes direct document URLs', async()=>{
    addInvoiceWithSnapshot(12, 10, [{id:1,fileKey:'k1',originalFileName:'one.pdf'},{id:2,fileKey:'k2',originalFileName:'two.pdf'}]);
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    const out=await worker.workerInvoice.exportMyInvoicePackage({invoiceId:12});
    expect(out.invoicePdf.generated).toBe(true);
    expect(out.documents).toHaveLength(2);
    expect(out.documents[0].url).toContain('k1');
    expect(out.zipPackage).toBeNull();
  });
  it('no snapshot returns BAD_REQUEST for official PDF output', async()=>{
    invoices.push({id:13,closingId:100,submissionId:501,projectId:1,employeeId:10,closingMonth:'2026-04',status:'draft'});
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await expect(worker.workerInvoice.downloadMyInvoicePdf({invoiceId:13})).rejects.toThrow('提出済みスナップショットがありません');
  });
  it('worker cannot download another worker pdf', async()=>{
    addInvoiceWithSnapshot(11, 11, []);
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await expect(worker.workerInvoice.downloadMyInvoicePdf({invoiceId:11})).rejects.toThrow();
  });
  it('worker cannot download another worker supporting document', async()=>{
    addInvoiceWithSnapshot(14, 11, [{id:1,fileKey:'k1'}]);
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await expect(worker.workerInvoice.downloadSupportingDocument({invoiceId:14,documentId:1})).rejects.toThrow();
  });
  it('supporting document ID must exist in latest snapshot', async()=>{
    addInvoiceWithSnapshot(15, 10, [{id:1,fileKey:'k1'}]);
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await expect(worker.workerInvoice.downloadSupportingDocument({invoiceId:15,documentId:999})).rejects.toThrow('指定された添付資料');
  });

  it('submit generates client-scoped invoice number and keeps existing number', async()=>{
    const caller=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await caller.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'});
    const first=invoices.find(v=>v.employeeId===10)!;
    expect(first.invoiceNumber).toMatch(/^WI-202604-C00077-\d{4}$/);
    const keep=first.invoiceNumber;
    await caller.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'});
    expect(invoices.find(v=>v.employeeId===10)!.invoiceNumber).toBe(keep);
  });

  it('invoice number sequence is client scoped unique', async()=>{
    invoices.push({id:30,closingId:100,submissionId:501,projectId:1,employeeId:99,closingMonth:'2026-04',status:'submitted',invoiceNumber:'WI-202604-C00077-0001'});
    const caller=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await caller.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'});
    expect(invoices.find(v=>v.employeeId===10)!.invoiceNumber).toBe('WI-202604-C00077-0002');
  });

  it('approved invoice blocks worker resubmit and returned invoice can resubmit with new snapshot version', async()=>{
    invoices.push({id:40,closingId:100,submissionId:501,projectId:1,employeeId:10,closingMonth:'2026-04',status:'approved',invoiceNumber:'WI-202604-C00077-0009'});
    const worker=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await expect(worker.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'})).rejects.toThrow();
    const admin=appRouter.createCaller(ctx(mkUser(9,'admin',99)));
    await admin.workerInvoice.returnInvoice({invoiceId:40,reason:'correction'});
    await worker.workerInvoice.saveMyDraft({projectId:1,closingMonth:'2026-04',subject:'re'});
    await worker.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'});
    const mine=snapshots.filter((s:any)=>s.workerInvoiceId===40);
    expect(mine.at(-1).snapshotVersion).toBeGreaterThanOrEqual(1);
  });


  it('concurrent submit retries on duplicate invoice number and stays unique', async()=>{
    const workerA=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    const workerB=appRouter.createCaller(ctx(mkUser(3,'worker',11)));
    await Promise.all([
      workerA.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'}),
      workerB.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'})
    ]);
    const nums=invoices.filter(v=>v.closingMonth==='2026-04').map(v=>v.invoiceNumber).filter(Boolean);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it('submit creates snapshot with attachment refs and profile fields', async()=>{
    const caller=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await caller.workerInvoice.submitMyInvoice({projectId:1,closingMonth:'2026-04'});
    expect(snapshots[0].snapshotJson).toContain('fileKey');
    expect(snapshots[0].snapshotJson).toContain('invoiceIssuerNumber');
  });
});

describe('worker invoice 管理者代行（employeeId 指定）',()=>{
  beforeEach(()=>{ invoices.length=0; snapshots.length=0; });

  it('管理者は employeeId 指定で対象作業員の請求書一覧を取得できる（自分の分と混ざらない）',async()=>{
    addInvoiceWithSnapshot(1,10); // 管理者自身(employee 10)の請求書
    addInvoiceWithSnapshot(2,11); // 対象作業員(employee 11)の請求書
    const caller=appRouter.createCaller(ctx(mkUser(2,'admin',10)));
    const delegated=await caller.workerInvoice.listMyInvoices({employeeId:11});
    expect(delegated.map((v:any)=>v.employeeId)).toEqual([11]);
    const own=await caller.workerInvoice.listMyInvoices();
    expect(own.map((v:any)=>v.employeeId)).toEqual([10]);
  });

  it('管理者の saveMyDraft(employeeId指定) は対象作業員のレコードに保存される',async()=>{
    const caller=appRouter.createCaller(ctx(mkUser(2,'admin',10)));
    await caller.workerInvoice.saveMyDraft({projectId:1,closingMonth:'2026-04',employeeId:11,items:[{label:'作業費',quantity:2,unitPrice:10000}]});
    expect(invoices).toHaveLength(1);
    expect(invoices[0].employeeId).toBe(11);
  });

  it('作業員が他人の employeeId を指定すると FORBIDDEN',async()=>{
    const caller=appRouter.createCaller(ctx(mkUser(2,'worker',10)));
    await expect(caller.workerInvoice.listMyInvoices({employeeId:11})).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(caller.workerInvoice.getMyDraft({projectId:1,closingMonth:'2026-04',employeeId:11})).rejects.toMatchObject({code:'FORBIDDEN'});
  });
});
