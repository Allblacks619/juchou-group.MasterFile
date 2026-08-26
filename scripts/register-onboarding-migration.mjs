import fs from "node:fs";

const path = "drizzle/meta/_journal.json";
const journal = JSON.parse(fs.readFileSync(path, "utf8"));
const tag = "0049_user_guide_state";
if (!journal.entries.some((entry) => entry.tag === tag)) {
  const nextIdx = Math.max(-1, ...journal.entries.map((entry) => Number(entry.idx))) + 1;
  journal.entries.push({
    idx: nextIdx,
    version: "5",
    when: 1787700000000,
    tag,
    breakpoints: true,
  });
  fs.writeFileSync(path, JSON.stringify(journal, null, 2) + "\n");
}
