/**
 * 現場ビジョン: 配置ボードの集計 (サーバー側・純粋関数)。
 * プロトタイプ BoardTab のロジックを移植。現在の割当から「人別」「エリア別」を自動生成する。
 * 対象は「アクティブな葉タスク」= 子を持たず status !== "done" のタスク。
 */

export type BoardFloor = { id: string; name: string };
export type BoardZone = { id: string; floorId: string; name: string; priority: number | null; workStatus: string | null };
export type BoardTask = { id: string; zoneId: string; parentTaskId: string | null; name: string; romaji: string | null; status: string };
export type BoardAssignee = { taskId: string; userId: number };
export type BoardTaskTeam = { taskId: string; teamId: string };
export type BoardTeamMember = { teamId: string; userId: number };
export type BoardUser = { id: number; name: string | null; appRole: string };

export type BoardPersonTask = { id: string; name: string; romaji: string | null; status: string; zoneId: string; zoneName: string };
export type BoardPerson = { userId: number; name: string | null; appRole: string; teamIds: string[]; tasks: BoardPersonTask[] };
export type BoardZoneRow = { id: string; name: string; floorName: string; priority: number | null; workStatus: string | null; taskCount: number; assignedUserIds: number[] };
export type Board = { people: BoardPerson[]; zones: BoardZoneRow[] };

export function computeBoard(input: {
  floors: BoardFloor[];
  zones: BoardZone[];
  tasks: BoardTask[];
  assignees: BoardAssignee[];
  taskTeams: BoardTaskTeam[];
  members: BoardTeamMember[];
  users: BoardUser[];
}): Board {
  const { floors, zones, tasks, assignees, taskTeams, members, users } = input;

  const floorName = new Map(floors.map((f) => [f.id, f.name]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const parentIds = new Set(tasks.map((t) => t.parentTaskId).filter((p): p is string => !!p));
  const activeLeaf = tasks.filter((t) => !parentIds.has(t.id) && t.status !== "done");

  const assigneesByTask = new Map<string, number[]>();
  for (const a of assignees) { const arr = assigneesByTask.get(a.taskId) || []; arr.push(a.userId); assigneesByTask.set(a.taskId, arr); }
  const teamsByTask = new Map<string, string[]>();
  for (const t of taskTeams) { const arr = teamsByTask.get(t.taskId) || []; arr.push(t.teamId); teamsByTask.set(t.taskId, arr); }

  const membersByTeam = new Map<string, number[]>();
  const teamsByMember = new Map<number, string[]>();
  for (const m of members) {
    const a = membersByTeam.get(m.teamId) || []; a.push(m.userId); membersByTeam.set(m.teamId, a);
    const b = teamsByMember.get(m.userId) || []; b.push(m.teamId); teamsByMember.set(m.userId, b);
  }

  const zoneName = (id: string) => zoneById.get(id)?.name || "?";

  // 人別
  const people: BoardPerson[] = [...users]
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ja"))
    .map((u) => {
      const myTeams = new Set(teamsByMember.get(u.id) || []);
      const myTasks = activeLeaf.filter((t) => {
        const direct = (assigneesByTask.get(t.id) || []).includes(u.id);
        const viaTeam = (teamsByTask.get(t.id) || []).some((gid) => myTeams.has(gid));
        return direct || viaTeam;
      });
      return {
        userId: u.id, name: u.name, appRole: u.appRole,
        teamIds: teamsByMember.get(u.id) || [],
        tasks: myTasks.map((t) => ({ id: t.id, name: t.name, romaji: t.romaji, status: t.status, zoneId: t.zoneId, zoneName: zoneName(t.zoneId) })),
      };
    });

  // エリア別 (アクティブ葉タスクを持つゾーンのみ)
  const zoneRows: BoardZoneRow[] = [];
  for (const z of zones) {
    const ts = activeLeaf.filter((t) => t.zoneId === z.id);
    if (ts.length === 0) continue;
    const set = new Set<number>();
    for (const t of ts) {
      for (const uid of assigneesByTask.get(t.id) || []) set.add(uid);
      for (const gid of teamsByTask.get(t.id) || []) for (const uid of membersByTeam.get(gid) || []) set.add(uid);
    }
    zoneRows.push({
      id: z.id, name: z.name, floorName: floorName.get(z.floorId) || "",
      priority: z.priority, workStatus: z.workStatus, taskCount: ts.length,
      assignedUserIds: Array.from(set),
    });
  }

  return { people, zones: zoneRows };
}
