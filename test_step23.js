// test_step23.js
// STEP23(基本操作・保存の意味の明確化)のNode検証。DOM/実機の見え方は対象外(末尾の注記参照)。
const assert = require("assert");
const fs = require("fs");
const path = require("path");
let passCount = 0;
function check(name, fn) {
  try { fn(); passCount++; console.log("  OK  " + name); }
  catch (e) { console.log("  NG  " + name); console.log("      " + e.message); process.exitCode = 1; }
}
const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const m = html.match(/\/\/ STEP23-BEGIN([\s\S]*?)\/\/ STEP23-END/);
assert.ok(m, "STEP23-BEGIN/ENDブロックが見つからない");
const api = new Function(m[1] + "\nreturn {nextRewoundState,formatSaveRewoundNote,computeShownDelaySec,formatLiveStatusText,formatSaveRangeMeaning,formatSaveProgressText,SAVE_DONE_LIST_NOTE};")();

console.log("\n[STEP23-A] 遅延表示は設定値でなく実測値");
check("通常再生(10秒遅れ)なら約10秒", () => assert.strictEqual(api.computeShownDelaySec(50000, 40000 - 20), 10));
check("5秒戻った(15秒前のフレーム)なら約15秒(設定10秒のままでも)", () => assert.strictEqual(api.computeShownDelaySec(50000, 35000), 15));
check("一時停止で時間が経つと実測値が増える", () => {
  assert.strictEqual(api.computeShownDelaySec(60000, 40000), 20);
  assert.strictEqual(api.computeShownDelaySec(70000, 40000), 30);
});
check("フレームが無ければnull、負にならない", () => {
  assert.strictEqual(api.computeShownDelaySec(1000, null), null);
  assert.strictEqual(api.computeShownDelaySec(1000, 5000), 0);
});
check("LIVE文言は実測値を使う(固定の10ではない)", () => {
  assert.strictEqual(api.formatLiveStatusText(10), "LIVE（約10秒遅れ）");
  assert.strictEqual(api.formatLiveStatusText(15), "LIVE（約15秒遅れ）");
  assert.strictEqual(api.formatLiveStatusText(null), "LIVE（遅延中）");
});
check("renderFrameがframe.timeから実測しdelaySecondsを表示に使っていない", () => {
  assert.ok(html.includes("computeShownDelaySec(now, frame.time)"));
  assert.ok(!/delayValueLabel\.textContent\s*=\s*delaySeconds/.test(html), "バッジに設定値を代入している");
  assert.ok(html.includes('約<b id="delayValueLabel">-</b>秒前の映像'));
});
check("DELAY以外(一時停止/スロー/過去再生)の既存状態表示は維持", () => {
  ['PAUSE: "一時停止"', 'REPLAY: "再生中（過去）"', 'SLOW: "スロー再生中"', 'SLOW_PAUSED: "スロー再生（一時停止）"'].forEach((s) => assert.ok(html.includes(s), s));
  assert.ok(html.includes('label === "DELAY" ? formatLiveStatusText(shownDelaySec)'));
});

console.log("\n[STEP23-A] 「最新へ戻る」");
check("ボタン2箇所が「最新へ戻る」、旧「現在へ」は残っていない", () => {
  assert.strictEqual((html.match(/act-go-live secondary-action wide">最新へ戻る</g) || []).length, 2);
  assert.ok(!html.includes("現在へ"), "旧文言が残っている");
});
check("goLive()の呼び出しは不変", () => {
  assert.ok(html.includes("goLiveBtns.forEach((btn) => btn.addEventListener(\"click\", () => playback.goLive()));"));
});

console.log("\n[STEP23-B] 保存の意味");
check("保存範囲ラベルと選択値連動の説明", () => {
  assert.ok(html.includes("保存する範囲：今表示している瞬間から過去へ"));
  assert.strictEqual(api.formatSaveRangeMeaning(60), "60秒 → 今の映像から過去60秒を保存します。この瞬間より後の映像は保存されません。");
  assert.ok(api.formatSaveRangeMeaning(10).startsWith("10秒 → 今の映像から過去10秒"));
  assert.ok(html.includes("saveRangeMeaning.textContent = formatSaveRangeMeaning(saveRangeSec)"));
});
check("保存範囲[10,30,60]・初期値60は不変", () => {
  assert.ok(html.includes("const SAVE_RANGE_OPTIONS = [10, 30, 60];"));
  assert.ok(html.includes("const DEFAULT_SAVE_RANGE_SEC = 60;"));
});
check("「今保存できる長さ」と不足時説明が維持されている", () => {
  assert.ok(html.includes('"今保存できる長さ: 約" + avail.toFixed(1) + "秒（選択: " + saveRangeSec + "秒）"'));
  assert.ok(html.includes("映像がまだ溜まっていません"));
  assert.ok(html.includes("遅延設定が長いため、最大で約"));
});
check("保存中の進捗に「コマ」", () => {
  assert.strictEqual(api.formatSaveProgressText(312, 1440), "保存中… 312 / 1440コマ");
  assert.ok(html.includes("formatSaveProgressText(done, total)"));
});
check("保存完了: 既存表示を維持し、一覧への追加を短く追記(通常・短縮の両方)", () => {
  assert.ok(html.includes('"保存しました（" + actualSec.toFixed(1) + "秒）\\n" + SAVE_DONE_LIST_NOTE'));
  assert.ok(html.includes('（バッファに存在する範囲のみ保存されました）\\n" + SAVE_DONE_LIST_NOTE') || html.includes('保存されました）\\n" + SAVE_DONE_LIST_NOTE'));
  assert.strictEqual(api.SAVE_DONE_LIST_NOTE, "保存射一覧に追加されました");
});
check("formatShotDateが秒まで(YYYY/MM/DD HH:MM:SS)。連番は付けていない", () => {
  const fm = html.match(/function formatShotDate\(ms\) \{[\s\S]*?\n  \}/)[0];
  const fn = new Function(fm + "\nreturn formatShotDate;")();
  const t = new Date(2026, 9, 2, 13, 21, 5).getTime();
  assert.strictEqual(fn(t), "2026/10/02 13:21:05");
  assert.notStrictEqual(fn(t), fn(t + 42000), "同じ分の2射が区別できる");
  assert.ok(!/射\s*\d/.test(fm));
});


console.log("\n[STEP23-B2] 「今保存できる長さ」: 再生位置を過去に戻している場合の説明");
check("通常の遅延再生中(差≈0)は過去扱いにならない", () => assert.strictEqual(api.nextRewoundState(false, 0.1), false));
check("5秒戻る(差≈5)で過去扱いになり、一時停止して時間が経っても維持", () => {
  assert.strictEqual(api.nextRewoundState(false, 5), true);
  assert.strictEqual(api.nextRewoundState(true, 12), true);
});
check("境界付近でヒステリシス: 入る3秒/戻る1.5秒(2秒前後で揺れても切り替わらない)", () => {
  assert.strictEqual(api.nextRewoundState(false, 2.9), false);
  assert.strictEqual(api.nextRewoundState(false, 3.1), true);
  assert.strictEqual(api.nextRewoundState(true, 2.0), true);
  assert.strictEqual(api.nextRewoundState(true, 1.4), false);
  let st = false; const seq = [2.8, 3.2, 2.6, 3.4, 2.2, 2.9]; const out = seq.map((v) => (st = api.nextRewoundState(st, v)));
  assert.deepStrictEqual(out, [false, true, true, true, true, true]);
});
check("実測が取れない(null)ときは過去扱いにしない", () => assert.strictEqual(api.nextRewoundState(true, null), false));
check("過去に戻している場合の説明文(「最新へ戻る」を案内し、「時間が経つと」とは言わない)", () => {
  const t = api.formatSaveRewoundNote(50.0);
  assert.ok(t.includes("再生位置を過去に戻しているため、今は約50秒までしか保存できません"));
  assert.ok(t.includes("「最新へ戻る」を押すと、より長く保存できます"));
  assert.ok(!t.includes("時間が経つと"));
});
check("index.html: 過去に戻している場合は専用文言、蓄積途中は従来文言を維持。計算関数は不変", () => {
  assert.ok(html.includes("nextRewoundState(saveInfoRewound, rewoundSec)"));
  assert.ok(html.includes("formatSaveRewoundNote(avail)"));
  assert.ok(html.includes("映像がまだ溜まっていません。時間が経つと選択した長さまで保存できます。"));
  assert.ok(html.includes("遅延設定が長いため、最大で約"));
  assert.ok(html.includes("function computeSaveAvailableSec(playbackTime, oldestTime, saveRangeSecValue) {"));
  assert.ok(html.includes("return Math.max(0, Math.min(saveRangeSecValue, (playbackTime - oldestTime) / 1000));"));
});

console.log("\n[STEP23] 変更禁止範囲");
check("Engine4ファイルは変更されていない(STEP23前のコピーと一致)", () => {
  const base = process.env.STEP23_BASE;
  if (!base) return console.log("      (STEP23_BASE未指定のためスキップ)");
  ["bufferEngine.js", "playbackEngine.js", "storageEngine.js", "coordinateEngine.js", "sw.js", "manifest.json"].forEach((f) =>
    assert.strictEqual(fs.readFileSync(path.join(__dirname, f), "utf8"), fs.readFileSync(path.join(base, f), "utf8"), f)
  );
});
check("動画保存・比較・同期・DB関連の主要コードが残っている", () => {
  ["runExportShotAsVideo", "shareExportedVideo", "handleSyncedComparisonAction", "setComparisonSync", "createFrameProtector"].forEach((n) => assert.ok(html.includes(n), n));
  assert.ok(!html.includes("DB_VERSION = 3"));
});

console.log("\n" + passCount + " 件成功" + (process.exitCode ? " / 失敗あり" : " / 全て成功"));
console.log("\n[注記] 実機(iPad Safari)確認が必要: 遅延バッジ/LIVE表示の実際の見え方と更新、5秒戻る/一時停止/スロー時の表示、「最新へ戻る」の動作、保存10/60秒の説明文の見え方、保存中・完了表示、同じ分に2射保存した際の一覧での識別\n");
