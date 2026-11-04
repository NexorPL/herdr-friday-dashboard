import fs from "node:fs";
function edit(p, pairs){ let s=fs.readFileSync(p,"utf8"); for(const [a,b] of pairs){ if(!s.includes(a)) throw new Error(p+" miss "+a); s=s.replace(a,()=>b);} fs.writeFileSync(p,s); }
edit("mods/friday/core/lists.js",[
[`/** The checkbox lines of todos.md in file order: { line (index), done, body }. */
export function todoRows(text) {
  return parseMd(text ?? "").lines.flatMap((l, line) => {
    const b = checkboxOf(l.text);
    return b ? [{ line, ...b }] : [];
  });
}`,`/**
 * The checkbox lines of todos.md in file order: { line (index), text (the raw line, which identifies
 * it when toggling), unique (no other row has the same raw line), done, body }.
 */
export function todoRows(text) {
  const rows = parseMd(text ?? "").lines.flatMap((l, line) => {
    const b = checkboxOf(l.text);
    return b ? [{ line, text: l.text, ...b }] : [];
  });
  return rows.map((r) => ({ ...r, unique: rows.filter((o) => o.text === r.text).length === 1 }));
}`]]);
edit("test/lists.test.js",[
[`assert.deepEqual(todoRows("# T\n- [ ] a\r\n- [x] b\nplain\n"), [{ line: 1, done: false, body: "a" }, { line: 2, done: true, body: "b" }]);`,
`assert.deepEqual(todoRows("# T\n- [ ] a\r\n- [x] b\nplain\n"), [{ line: 1, text: "- [ ] a", unique: true, done: false, body: "a" }, { line: 2, text: "- [x] b", unique: true, done: true, body: "b" }]);
  assert.deepEqual(todoRows("- [ ] a\n- [ ] a\n").map((r) => r.unique), [false, false]);`],
[`{ line: 1, done: false, body: "b" }`,`{ line: 1, text: "- [ ] b", unique: true, done: false, body: "b" }`]]);
