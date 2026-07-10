/**
 * 現場ビジョン: 配置ボードの集計 (サーバー側・純粋関数)。
 * プロトタイプ BoardTab のロジックを移植。現在の割当から「人別」「エリア別」を自動生成する。
 * 対象は「アクティブな葉タスク」= 子を持たず status !== "done" のタスク。
 * G1: users.id を持たないゲスト(現場名簿)の割当は guestPeople / assignedGuestNames として加算的に返す。
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
/** ゲスト(現場名簿)の人別行 (G1)。users.id を持たないため別系列で返す */
export type BoardGuestPerson = { guestId: string; name: string; tasks: BoardPersonTask[] };
export type BoardZoneRow = { id: string; name: string; floorName: string; priority: number | null; workStatus: string | null; taskCount: number; assignedUserIds: number[]; assignedGuestNames: string[] };
export type Board = { people: BoardPerson[]; guestPeople: BoardGuestPerson[]; zones: BoardZoneRow[] };

export function computeBoard(input: {
  floors: BoardFloor[];
  zones: BoardZone[];
  tasks: BoardTask[];
  assignees: BoardAssignee[];
  taskTeams: BoardTaskTeam[];
  members: BoardTeamMember[];
  users: BoardUser[];
  /** ゲスト割当 (G1, 省略可) */
  guests?: { id: string; name: string }[];
  guestAssignees?: { taskId: string; guestId: string }[];
}): Board {
  const { floors, zones, tasks, assignees, taskTeams, members, users } = input;
  const guests = input.guests ?? [];
  const guestAssignees = input.guestAssignees ?? [];

  const floorName = new Map(floors.map((f) => [f.id, f.name]));
  const zoneById = new Map(zones.map((z) => [z.id, z]));

  const parentIds = new Set(tasks.map((t) => t.parentTaskId).filter((p): p is string => !!p));
  const activeLeaf = tasks.filter((t) => !parentIds.has(t.id) && t.status !== "done");
  const activeLeafIds = new Set(activeLeaf.map((t) => t.id));

  const assigneesByTask = new Map<string, number[]>();
  for (const a of assignees) { const arr = assigneesByTask.get(a.taskId) || []; arr.push(a.userId); assigneesByTask.set(a.taskId, arr); }
  const teamsByTask = new Map<string, string[]>();
  for (const t of taskTeams) { const arr = teamsByTask.get(t.taskId) || []; arr.push(t.teamId); teamsByTask.set(t.taskId, arr); }
  const guestsByTask = new Map<string, string[]>();
  for (const g of guestAssignees) { const arr = guestsByTask.get(g.taskId) || []; arr.push(g.guestId); guestsByTask.set(g.taskId, arr); }
  const guestNameById = new Map(guests.map((g) => [g.id, g.name]));

  const membersByTeam = new Map<string, number[]>();
  const teamsByMember = new Map<number, string[]>();
  for (const m of members) {
    const a = membersByTeam.get(m.teamId) || []; a.push(m.userId); membersByTeam.set(m.teamId, a);
    const b = teamsByMember.get(m.userId) || []; b.push(m.teamId); teamsByMember.set(m.userId, b);
  }

  const zoneName = (id: string) => zoneById.get(id)?.name || "?";
  const toPersonTask = (t: BoardTask): BoardPersonTask => ({ id: t.id, name: t.name, romaji: t.romaji, status: t.status, zoneId: t.zoneId, zoneName: zoneName(t.zoneId) });

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
        tasks: myTasks.map(toPersonTask),
      };
    });

  // 人別 (ゲスト): 割当のあるゲストのみ表示 (名簿全員は出さない)
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const tasksByGuest = new Map<string, BoardPersonTask[]>();
  for (const ga of guestAssignees) {
    if (!activeLeafIds.has(ga.taskId)) continue;
    const t = taskById.get(ga.taskId);
    if (!t) continue;
    const arr = tasksByGuest.get(ga.guestId) || [];
    arr.push(toPersonTask(t));
    tasksByGuest.set(ga.guestId, arr);
  }
  const guestPeople: BoardGuestPerson[] = Array.from(tasksByGuest.entries())
    .map(([guestId, ts]) => ({ guestId, name: guestNameById.get(guestId) || "ゲスト", tasks: ts }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));

  // エリア別 (アクティブ葉タスクを持つゾーンのみ)
  const zoneRows: BoardZoneRow[] = [];
  for (const z of zones) {
    const ts = activeLeaf.filter((t) => t.zoneId === z.id);
    if (ts.length === 0) continue;
    const set = new Set<number>();
    const guestSet = new Set<string>();
    for (const t of ts) {
      for (const uid of assigneesByTask.get(t.id) || []) set.add(uid);
      for (const gid of teamsByTask.get(t.id) || []) for (const uid of membersByTeam.get(gid) || []) set.add(uid);
      for (const gid of guestsByTask.get(t.id) || []) guestSet.add(gid);
    }
    zoneRows.push({
      id: z.id, name: z.name, floorName: floorName.get(z.floorId) || "",
      priority: z.priority, workStatus: z.workStatus, taskCount: ts.length,
      assignedUserIds: Array.from(set),
      assignedGuestNames: Array.from(guestSet).map((gid) => guestNameById.get(gid) || "ゲスト"),
    });
  }

  return { people, guestPeople, zones: zoneRows };
}
