/**
 * 名簿提出のホワイトリストDTO — Phase 2 (PLAN_v1.md §2.5 / 審議#2)。
 *
 * 提出スナップショット (workerSetJson) はビルダー出力の生オブジェクトをそのまま入れず、
 * 必ずこの DTO を通す。単価・支払・銀行口座・社内メモ等の機密は**構造的に含められない**
 * （スプレッド禁止・明示フィールドのみ詰め替え。genba の buildShareView と同じ方式）。
 */

export type RosterQualificationDto = {
  name: string;
  obtainedDate: string | null;
  certificateNumber: string | null;
};

export type RosterDocumentDto = {
  documentType: string;
  expiryDate: string | null;
  docStatus: string | null;
};

export type RosterWorkerDto = {
  /** 提出元テナントの employees.id（写し） */
  employeeRef: number;
  nameKanji: string;
  nameKana: string | null;
  nameRomaji: string | null;
  dateOfBirth: string | null;
  bloodType: string | null;
  gender: string | null;
  nationality: string | null;
  /** CCUS番号（会社横断の名寄せキー） */
  ccusNumber: string | null;
  residenceStatus: string | null;
  residenceCardExpiry: string | null;
  experienceYears: number | null;
  qualifications: RosterQualificationDto[];
  documents: RosterDocumentDto[];
};

const toYmdOrNull = (v: unknown): string | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

/**
 * employees + qualifications + documents の行からホワイトリストDTOを構築する。
 * ここに列挙されていないフィールドは何があっても提出物に入らない。
 */
export function buildRosterWorkerDto(
  employee: Record<string, unknown>,
  qualifications: Record<string, unknown>[],
  documents: Record<string, unknown>[],
): RosterWorkerDto {
  return {
    employeeRef: Number(employee.id),
    nameKanji: String(employee.nameKanji ?? ""),
    nameKana: employee.nameKana != null ? String(employee.nameKana) : null,
    nameRomaji: employee.nameRomaji != null ? String(employee.nameRomaji) : null,
    dateOfBirth: toYmdOrNull(employee.dateOfBirth),
    bloodType: employee.bloodType != null ? String(employee.bloodType) : null,
    gender: employee.gender != null ? String(employee.gender) : null,
    nationality: employee.nationality != null ? String(employee.nationality) : null,
    ccusNumber: employee.careerUpNumber != null && String(employee.careerUpNumber) !== "" ? String(employee.careerUpNumber) : null,
    residenceStatus: employee.residenceStatus != null ? String(employee.residenceStatus) : null,
    residenceCardExpiry: toYmdOrNull(employee.residenceCardExpiry),
    experienceYears: employee.experienceYears != null ? Number(employee.experienceYears) : null,
    qualifications: qualifications.map((q) => ({
      name: String(q.name ?? ""),
      obtainedDate: toYmdOrNull(q.obtainedDate),
      certificateNumber: q.certificateNumber != null ? String(q.certificateNumber) : null,
    })),
    documents: documents.map((d) => ({
      documentType: String(d.documentType ?? ""),
      expiryDate: toYmdOrNull(d.expiryDate),
      docStatus: d.docStatus != null ? String(d.docStatus) : null,
    })),
  };
}

/** 名寄せ候補: 受領側 genba 名簿行と提出作業員の一致判定（CCUS一致 > 表示名一致） */
export function matchRosterWorker(
  worker: { displayName: string; ccusNumber: string | null },
  siteWorkers: { id: string; guestName: string | null; displayName: string; ccusNumber?: string | null }[],
): { siteWorkerId: string; matchType: "ccus" | "name" }[] {
  const out: { siteWorkerId: string; matchType: "ccus" | "name" }[] = [];
  for (const sw of siteWorkers) {
    if (worker.ccusNumber && sw.ccusNumber && worker.ccusNumber === sw.ccusNumber) {
      out.push({ siteWorkerId: sw.id, matchType: "ccus" });
    } else if (sw.guestName === worker.displayName || sw.displayName === worker.displayName) {
      out.push({ siteWorkerId: sw.id, matchType: "name" });
    }
  }
  // CCUS一致を優先して先頭に
  return out.sort((a, b) => (a.matchType === b.matchType ? 0 : a.matchType === "ccus" ? -1 : 1));
}
