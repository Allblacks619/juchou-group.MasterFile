import { PRIORITY, STATUS } from "@/lib/genbaMap";

/** 図面上のエリア中心に表示する進捗リング + 名称 + 問題バッジ (プロトタイプ移植・CUD配色不変) */
export default function ProgressBadge({
  name, progress, issues, small, priority,
}: {
  name: string;
  progress: number;
  issues: number;
  small?: boolean;
  priority?: number | null;
}) {
  const r = small ? 34 : 46;
  const stroke = small ? 9 : 12;
  const circ = 2 * Math.PI * r;
  const pr = priority ? PRIORITY[priority] : null;
  return (
    <g>
      <circle r={r + stroke} fill="rgba(255,255,255,0.92)" stroke={pr ? pr.color : "#94a3b8"} strokeWidth="3" />
      <circle r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        r={r}
        fill="none"
        stroke={progress >= 100 ? STATUS.done.color : "#005AFF"}
        strokeWidth={stroke}
        strokeDasharray={`${(progress / 100) * circ} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90)"
      />
      <text y={small ? -4 : -6} textAnchor="middle" fontSize={small ? 20 : 26} fontWeight="700" fill="#0f172a">{name}</text>
      <text y={small ? 20 : 26} textAnchor="middle" fontSize={small ? 18 : 22} fill="#334155" style={{ fontVariantNumeric: "tabular-nums" }}>
        {Math.round(progress)}%
      </text>
      {issues > 0 && (
        <g transform={`translate(${r + 2},${-r - 2})`}>
          <circle r="16" fill={STATUS.issue.color} />
          <text y="6" textAnchor="middle" fontSize="20" fontWeight="700" fill="#fff">!</text>
        </g>
      )}
    </g>
  );
}
