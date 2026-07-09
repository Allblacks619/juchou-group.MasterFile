import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { PRIORITY, STATUS } from "@/lib/genbaMap";
import { colorForKey } from "@/lib/genbaTeamColor";
import { childrenMap, computeTaskProgress, rootTasks, fmtDate, todayStr, type GenbaTaskDto } from "@/lib/genbaTask";
import StatusModal, { type SetStatusPayload } from "./StatusModal";
import TaskDetailModal from "./TaskDetailModal";
import AssignPicker from "./AssignPicker";
import { enqueueStatus, isNetworkError } from "@/lib/genbaOutbox";

/** ゾーン配下の作業ツリー (プロトタイプ TaskTree/TaskRow 移植)。進捗登録・詳細・追加・担当割当。 */
export default function TaskTree({ zoneId, siteId, meUserId, canEdit, onChanged }: { zoneId: string; siteId: string; meUserId: number | null; canEdit: boolean; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const { data: tasks } = trpc.genba.tasks.listByZone.useQuery({ zoneId }, { retry: false });
  const { data: users } = trpc.genba.users.listAssignable.useQuery({ siteId }, { retry: false, enabled: canEdit, staleTime: 5 * 60 * 1000 });
  const { data: teams } = trpc.genba.teams.listBySite.useQuery({ siteId }, { retry: false, staleTime: 60 * 1000 });
  const [statusTask, setStatusTask] = useState<GenbaTaskDto | null>(null);
  const [detailTask, setDetailTask] = useState<GenbaTaskDto | null>(null);

  const refresh = () => { utils.genba.tasks.listByZone.invalidate({ zoneId }); onChanged(); };

  const setStatus = trpc.genba.tasks.setStatus.useMutation();
  const assignUser = trpc.genba.tasks.assignUser.useMutation({ onSuccess: () => utils.genba.tasks.listByZone.invalidate({ zoneId }), onError: (e) => toast.error(e.message) });
  const assignTeam = trpc.genba.tasks.assignTeam.useMutation({ onSuccess: () => utils.genba.tasks.listByZone.invalidate({ zoneId }), onError: (e) => toast.error(e.message) });
  const createTask = trpc.genba.tasks.create.useMutation({
    onSuccess: () => { refresh(); toast.success("作業を追加しました"); },
    onError: (e) => toast.error(e.message),
  });
  const removeTask = trpc.genba.tasks.remove.useMutation({
    onSuccess: () => { refresh(); toast.success("作業を削除しました"); },
    onError: (e) => toast.error(e.message),
  });

  const userList = (users || []) as { id: number; name: string | null; appRole: string }[];
  const teamList = (teams || []) as { id: string; name: string; memberIds: number[] }[];
  const userName = (id: number) => userList.find((u) => u.id === id)?.name || `user#${id}`;
  const myTeamIds = new Set(teamList.filter((g) => meUserId != null && g.memberIds.includes(meUserId)).map((g) => g.id));

  const list = (tasks || []) as GenbaTaskDto[];
  const byParent = childrenMap(list);
  const roots = rootTasks(list);

  async function submitStatus(p: SetStatusPayload) {
    if (!statusTask) return;
    const payload = { id: statusTask.id, ...p };
    // オフラインならアウトボックスへ退避 (復帰時に自動送信)
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      await enqueueStatus(payload);
      toast("📤 オフライン: 送信待ちに保存しました。オンライン復帰時に自動送信します。");
      window.dispatchEvent(new Event("genba-outbox-changed"));
      return;
    }
    try {
      await setStatus.mutateAsync(payload);
      refresh();
    } catch (e) {
      // 送信中に回線が切れた等はキューへ退避してリトライに回す
      if (isNetworkError(e)) {
        await enqueueStatus(payload);
        toast("📤 通信できないため送信待ちに保存しました。復帰時に自動送信します。");
        window.dispatchEvent(new Event("genba-outbox-changed"));
        return;
      }
      throw e;
    }
  }

  const renderRow = (task: GenbaTaskDto, depth: number): React.ReactNode => {
    const kids = byParent.get(task.id) || [];
    const isLeaf = kids.length === 0;
    const prog = computeTaskProgress(task, byParent);
    const st = STATUS[task.status];
    const pr = task.priority ? PRIORITY[task.priority] : null;
    const overdue = task.dueDate && task.status !== "done" && task.dueDate < todayStr();
    const assigneeIds = task.assigneeIds || [];
    const tTeamIds = task.teamIds || [];
    const isMine = meUserId != null && (assigneeIds.includes(meUserId) || tTeamIds.some((id) => myTeamIds.has(id)));
    return (
      <div key={task.id}>
        <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: 4 + depth * 16, borderLeft: pr ? `4px solid ${pr.color}` : "4px solid transparent", background: isMine ? "rgba(0,90,255,0.06)" : undefined }}>
          {isLeaf ? (
            <button
              onClick={() => canEdit || true ? setStatusTask(task) : undefined}
              className="text-xs font-bold rounded px-2 py-1 text-white shrink-0"
              style={{ background: st.color }}
            >
              {st.icon} {task.status === "progress" ? `${task.percent ?? 50}%` : st.label}
            </button>
          ) : (
            <ExpandRow />
          )}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setDetailTask(task)}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-sm ${isLeaf ? "" : "font-bold"}`}>{task.name}</span>
              {!isLeaf && <span className="text-xs text-muted-foreground tabular-nums">{Math.round(prog)}%</span>}
              {task.dueDate && <span className={`text-[11px] px-1.5 py-0.5 rounded ${overdue ? "bg-destructive/10 text-destructive font-bold" : "bg-muted text-muted-foreground"}`}>📅 {fmtDate(task.dueDate)}{overdue ? " 期限超過" : ""}</span>}
              {task.memo && task.memoVisible && <span title="メモあり">📝</span>}
              {task.linkUrl && <span title="図面リンク">📐</span>}
              {tTeamIds.map((id) => {
                const g = teamList.find((t) => t.id === id);
                return g ? <span key={id} className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white" style={{ background: colorForKey(id) }}>{g.name}</span> : null;
              })}
              {assigneeIds.map((id) => (
                <span key={id} className="text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: colorForKey(id) }}>{userName(id)}</span>
              ))}
            </div>
            {!isLeaf && (
              <div className="mt-1 h-1.5 rounded bg-muted overflow-hidden">
                <div className="h-full" style={{ width: `${prog}%`, background: prog >= 100 ? STATUS.done.color : "#005AFF" }} />
              </div>
            )}
            {task.status === "issue" && task.issueText && <div className="text-xs text-[#b91c1c] mt-0.5">⚠ {task.issueText}</div>}
          </div>
          {canEdit && isLeaf && (
            <AssignPicker
              assigneeIds={assigneeIds}
              teamIds={tTeamIds}
              users={userList}
              teams={teamList}
              onToggleUser={(userId, on) => assignUser.mutate({ taskId: task.id, userId, on })}
              onToggleTeam={(teamId, on) => assignTeam.mutate({ taskId: task.id, teamId, on })}
            />
          )}
          {canEdit && (
            <button
              onClick={() => { if (window.confirm(`「${task.name}」を削除しますか？${!isLeaf ? "\n(サブ作業も削除されます)" : ""}`)) removeTask.mutate({ id: task.id }); }}
              className="shrink-0 text-muted-foreground hover:text-destructive p-1"
              title="作業を削除"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        {kids.sort((a, b) => a.sortOrder - b.sortOrder).map((c) => renderRow(c, depth + 1))}
      </div>
    );
  };

  return (
    <div>
      <div className="max-h-72 overflow-y-auto">
        {roots.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">作業がありません。{canEdit ? "下のボタンから追加できます。" : ""}</p>
        ) : roots.map((t) => renderRow(t, 0))}
      </div>

      {canEdit && (
        <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => {
          const n = window.prompt("追加する作業名を入力", "");
          if (n && n.trim()) createTask.mutate({ zoneId, name: n.trim() });
        }}>
          <Plus className="h-4 w-4 mr-1" /> このエリアに作業を追加
        </Button>
      )}

      {statusTask && (
        <StatusModal task={statusTask} open={!!statusTask} onOpenChange={(v) => !v && setStatusTask(null)} onSubmit={submitStatus} />
      )}
      {detailTask && (
        <TaskDetailModal task={detailTask} zoneId={zoneId} canEdit={canEdit} meUserId={meUserId} open={!!detailTask}
          onOpenChange={(v) => !v && setDetailTask(null)} onChanged={refresh} />
      )}
    </div>
  );
}

function ExpandRow() {
  // 親タスクは常に展開表示 (シンプル化)。将来 折りたたみ可能に。
  return <span className="w-6 shrink-0 text-muted-foreground flex justify-center"><ChevronDown className="h-4 w-4" /></span>;
}
