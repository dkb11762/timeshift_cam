// test_step24.js
// STEP24(A/B比較の「選び方・同期」の説明UI)のテスト。内部ロジックは変更していないため、
// 選択ロジックはindex.htmlのchangeハンドラと同じ考え方で再現し、説明UIは静的に確認する。
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passCount = 0;
function check(name, fn) {
  try { fn(); passCount++; console.log("  OK  " + name); }
  catch (e) { console.log("  NG  " + name); console.log("      " + e.message); process.exitCode = 1; }
}
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

// index.htmlのchangeハンドラ(最大2件・選択順・解除)と同じロジック
function makeSelection() {
  let sel = [];
  return {
    toggle(shot, checked) {
      if (checked) {
        if (sel.length >= 2) return false; // 3件目は選べない(チェックを戻す)
        if (sel.some((s) => s.id === shot.id)) return false; // 同じ射の重複不可
        sel.push(shot);
        return true;
      }
      sel = sel.filter((s) => s.id !== shot.id);
      return true;
    },
    get: () => sel.slice(),
    slot: (id) => { const i = sel.findIndex((s) => s.id === id); return i === 0 ? "A" : i === 1 ? "B" : ""; },
    label: () => "比較する（" + sel.length + "/2）",
    disabled: () => sel.length !== 2,
  };
}
const S = (id) => ({ id });

console.log("\n[STEP24] A/B選択");
check("1本目がA、2本目がB", () => {
  const s = makeSelection(); s.toggle(S("x"), true); s.toggle(S("y"), true);
  assert.strictEqual(s.slot("x"), "A"); assert.strictEqual(s.slot("y"), "B");
});
check("3本目は選択できない", () => {
  const s = makeSelection(); s.toggle(S("x"), true); s.toggle(S("y"), true);
  assert.strictEqual(s.toggle(S("z"), true), false); assert.strictEqual(s.get().length, 2);
});
check("同じ射をA/Bにできない", () => {
  const s = makeSelection(); s.toggle(S("x"), true);
  assert.strictEqual(s.toggle(S("x"), true), false); assert.strictEqual(s.get().length, 1);
});
check("Aを外すとBがAになる(現仕様)", () => {
  const s = makeSelection(); s.toggle(S("x"), true); s.toggle(S("y"), true); s.toggle(S("x"), false);
  assert.strictEqual(s.slot("y"), "A");
});
check("比較ボタンの状態表示(n/2・有効/無効)が維持される", () => {
  const s = makeSelection();
  assert.strictEqual(s.label(), "比較する（0/2）"); assert.strictEqual(s.disabled(), true);
  s.toggle(S("x"), true); assert.strictEqual(s.disabled(), true);
  s.toggle(S("y"), true); assert.strictEqual(s.label(), "比較する（2/2）"); assert.strictEqual(s.disabled(), false);
  assert.ok(html.includes('compareStartBtn.textContent = "比較する（" + compareSelection.length + "/2）"'));
  assert.ok(html.includes("compareStartBtn.disabled = compareSelection.length !== 2"));
  assert.ok(html.includes("if (compareSelection.length >= 2) {"));
  assert.ok(html.includes("shotA.id === shotB.id"));
});

console.log("\n[STEP24] 保存射一覧の説明");
check("0/1/2本の補助説明が定義され、updateCompareStartButton内で切り替わる", () => {
  const fn = html.match(/function updateCompareStartButton\(\)[\s\S]*?\n  \}/)[0];
  assert.ok(fn.includes("compareHintEl.textContent"));
  assert.ok(fn.includes("比較する2本を選んでください。1本目 → A、2本目 → B として比較します。"));
  assert.ok(fn.includes("Aを選択済み。あと1本選んでください（2本目 → B）。"));
  assert.ok(fn.includes("A・Bの2本を選択済み。選べるのは2本までです。"));
  assert.ok(html.includes('id="compareHint"'));
});

console.log("\n[STEP24] 比較画面の説明");
check("A/Bの対応が常時表示される", () => {
  assert.ok(html.includes('id="comparisonModeHint"'));
  assert.ok(html.includes("A＝1本目に選んだ射 ／ B＝2本目に選んだ射"));
});
check("同期ON/OFFの説明が実挙動と一致し、setComparisonSyncで切り替わる", () => {
  const fn = html.match(/function setComparisonSync\(on\)[\s\S]*?\n  \}/)[0];
  assert.ok(fn.includes("comparisonModeTextEl.textContent"));
  assert.ok(fn.includes("同期ON：A・Bを同じ経過時間で操作します。ONにした時点で、BをAの位置に合わせます。"));
  assert.ok(fn.includes("同期OFF：A・Bをそれぞれ別々に操作できます。"));
  assert.ok(!html.includes("同じ位置で再生"), "曖昧な旧文言が残っている");
});
check("同期バーは「共通の経過時間（Aを基準）」＋共通位置表示", () => {
  assert.ok(html.includes("<span>共通の経過時間（Aを基準）</span>"));
  assert.ok(html.includes("共通位置"));
});

console.log("\n[STEP24] 変更していないもの");
check("formatShotDate()はSTEP23の秒表示のまま", () => {
  assert.ok(/pad\(d\.getMinutes\(\)\) \+ ":" \+ pad\(d\.getSeconds\(\)\)/.test(html));
});
check("A/Bタイトル生成・同期の内部ロジックの記述が維持されている", () => {
  assert.ok(html.includes('channel.label + "：" + formatShotDate'));
  assert.ok(html.includes("setComparisonTime(comparisonA.playback.playbackTime, false)"));
  assert.ok(html.includes("comparisonB.playback.playbackTime = clampComparisonTime(comparisonB, comparisonSyncTime)"));
  assert.ok(html.includes('comparisonSyncBar.style.display = "none"'));
});

console.log("\n" + passCount + " 件成功" + (process.exitCode ? " / 失敗あり" : " / 全て成功"));
console.log("\n[注記] 実機確認が必要: 縦/横画面での説明行の見え方・画面圧迫、設定パネル内の補助文の読みやすさ\n");
