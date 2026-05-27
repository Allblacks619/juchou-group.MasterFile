import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';
import type { User } from '../drizzle/schema';

const docs: any[] = [];
let submission: any;

vi.mock('./storage', () => ({ storagePut: vi.fn(async (k: string) => ({ url: `https://x/${k}` })) }));
vi.mock('./db', () => ({
  getEmployeeByUserId: vi.fn(async (id:number)=> ({ id: id===99?99:10, userId:id })),
  getProjectClosingByProjectMonth: vi.fn(async ()=> ({ id:1, projectId:1, closingMonth:'2026-04', status:'open' })),
  createProjectClosing: vi.fn(async ()=> ({ id:1, projectId:1, closingMonth:'2026-04', status:'open' })),
  getProjectById: vi.fn(async ()=> ({ id:1, clientId:1 })), getClientById: vi.fn(async ()=> ({ id:1 })), getAllEmployees: vi.fn(async ()=> [{id:10}]), getProjectMembers: vi.fn(async ()=> [{employeeId:10,isActive:true}]), getAttendanceByProject: vi.fn(async ()=> [{employeeId:10}]), getAttendanceByDateRange: vi.fn(async ()=> [{projectId:1, employeeId:10}]), getAllProjects: vi.fn(async ()=> [{id:1,name:'案件A'}]),
  getClosingSubmissionsByClosing: vi.fn(async ()=> [submission]),
  getClosingSubmissionByClosingEmployee: vi.fn(async (_c:number,e:number)=> e===10?submission:null),
  upsertClosingSubmission: vi.fn(async ()=> submission), updateClosingSubmission: vi.fn(async (_id:number,patch:any)=> ({...submission,...patch})),
  createAuditLog: vi.fn(async ()=> ({})),
  listClosingSubmissionDocuments: vi.fn(async ()=> docs),
  createClosingSubmissionDocument: vi.fn(async (d:any)=> { const x={id:docs.length+1,...d}; docs.push(x); return x;}),
  getClosingSubmissionDocumentById: vi.fn(async (id:number)=> docs.find(d=>d.id===id)),
  deleteClosingSubmissionDocument: vi.fn(async (id:number)=> { const i=docs.findIndex(d=>d.id===id); if(i>=0) docs.splice(i,1);}),
}));

const createCtx=(user:User):TrpcContext=>({ user, req:{protocol:'https',headers:{}} as any, res:{clearCookie:vi.fn()} as any });
const user=(id=2,eid=10):User=>({id,openId:'o',email:'e',name:'n',loginMethod:'manus',role:'user',appRole:'worker',loginId:'l',mustChangePassword:false,employeeId:eid,createdAt:new Date(),updatedAt:new Date(),lastSignedIn:new Date()});

describe('closing documents',()=>{
  beforeEach(()=>{ docs.splice(0,docs.length); submission={id:7,closingId:1,employeeId:10,status:'pending',transportAmount:0,expenseAmount:0,receiptRequired:false,receiptUploaded:false}; vi.clearAllMocks();});
  it('uploads multiple docs even when amounts are zero', async ()=>{
    const c=appRouter.createCaller(createCtx(user()));
    await c.closing.uploadMyReceiptDocument({projectId:1,closingMonth:'2026-04',base64:Buffer.from('a').toString('base64'),mimeType:'application/pdf',fileName:'a.pdf'});
    await c.closing.uploadMyReceiptDocument({projectId:1,closingMonth:'2026-04',base64:Buffer.from('b').toString('base64'),mimeType:'image/png',fileName:'b.png'});
    expect(docs).toHaveLength(2);
  });
  it('rejects unsupported file types', async ()=>{
    const c=appRouter.createCaller(createCtx(user()));
    await expect(c.closing.uploadMyReceiptDocument({projectId:1,closingMonth:'2026-04',base64:Buffer.from('a').toString('base64'),mimeType:'text/plain',fileName:'a.txt'})).rejects.toThrow();
  });
  it('deletes single doc only', async ()=>{
    const c=appRouter.createCaller(createCtx(user()));
    await c.closing.uploadMyReceiptDocument({projectId:1,closingMonth:'2026-04',base64:Buffer.from('a').toString('base64'),mimeType:'application/pdf',fileName:'a.pdf'});
    await c.closing.uploadMyReceiptDocument({projectId:1,closingMonth:'2026-04',base64:Buffer.from('b').toString('base64'),mimeType:'image/png',fileName:'b.png'});
    await c.closing.deleteMyReceiptDocument({projectId:1,closingMonth:'2026-04',documentId:1});
    expect(docs).toHaveLength(1);
  });
});
