// test_step20_5.js
//
// STEP20-5(動画作成中の待機表示・自動スクロール)の静的確認テスト。
// UI改善のみ。動画生成・共有ロジック、STEP20-4で実機確認済みの
// 「生成完了 → 共有するボタン表示 → ユーザー操作 → navigator.share()」の流れを壊していないこと、
// 押したボタンの作成中表示と自動スクロールが実装されていることを確認する。
// 実際の見た目・スクロール挙動はNode.jsでは検証できず、iPad実機確認が必要。

const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passCount = 0;
function check(name, fn) {
  try {
    fn();
    passCount++;
    console.log("  OK  " + name);
  } catch (e) {
    console.log("  NG  " + name);
    console.log("      " + e.message);
    process.exitCode = 1;
  }
}

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const fnBody = (re) => {
  const m = html.match(re);
  assert.ok(m, "関数が見つからない: " + re);
  return m[0];
};

console.log("\n[STEP20-5] 押したボタンの作成中表示");

check("クリックしたボタン自身がexportShotAsVideoへ渡される", () => {
  assert.ok(html.includes('exportBtn.addEventListener("click", () => exportShotAsVideo(shot, exportBtn));'));
});

check("startExportButtonProgress: 「作成中… N秒」の経過時間表示で、進捗率(N/M秒)表記ではない", () => {
  const body = fnBody(/function startExportButtonProgress\([\s\S]*?\n  \}/);
  assert.ok(body.includes('"作成中… "'));
  assert.ok(body.includes('"秒"'));
  assert.ok(!body.includes("durationMs"), "実進捗と誤解される表示(射の長さとの比較)をしていない");
  assert.ok(body.includes("setInterval(render"), "経過表示の更新タイマーがない");
});

check("元のボタン文言を保存し、stop()で必ず元に戻す(タイマーも解除)", () => {
  const body = fnBody(/function startExportButtonProgress\([\s\S]*?\n  \}/);
  assert.ok(body.includes("const originalText = btn.textContent;"));
  assert.ok(body.includes("clearInterval(timerId)"));
  assert.ok(body.includes("btn.textContent = originalText;"));
  assert.ok(body.includes('classList.remove("exporting")'));
});

check("exportShotAsVideoラッパーはtry/finallyで、成功・失敗・早期returnのいずれでも表示を元に戻す", () => {
  const body = fnBody(/async function exportShotAsVideo\(shot, triggerBtn\)[\s\S]*?\n  \}/);
  assert.ok(body.includes("await runExportShotAsVideo(shot);"));
  assert.ok(/finally\s*\{\s*[\s\S]*progress\.stop\(\)/.test(body));
});

check("作成中ボタンは無効化中も読める(.exporting:disabledのopacity:1)、通常の無効化(他ボタン)は維持", () => {
  assert.ok(/\.shot-export\.exporting:disabled\s*\{\s*opacity:\s*1;\s*\}/.test(html));
  assert.ok(/\.shot-export:disabled\s*\{\s*opacity:\s*0\.4;\s*\}/.test(html));
  assert.ok(html.includes("setAllExportButtonsDisabled(true);"));
});

console.log("\n[STEP20-5] 自動スクロール");

check("生成開始時に状態表示、完成時に「共有する」行をscrollIntoViewで見える位置へ寄せる", () => {
  const run = fnBody(/async function runExportShotAsVideo\([\s\S]*?\n  \}/);
  assert.ok(run.includes("scrollExportUiIntoView(exportStatusEl)"));
  const prep = fnBody(/function prepareExportedVideoForShare\([\s\S]*?\n  \}/);
  assert.ok(prep.includes("scrollExportUiIntoView(exportShareRow)"));
  assert.ok(prep.indexOf('exportShareRow.style.display = "flex";') < prep.indexOf("scrollExportUiIntoView(exportShareRow)"), "表示前にスクロールしている");
});

check("scrollExportUiIntoViewは最小スクロール(block:nearest)で、失敗しても例外を投げない", () => {
  const body = fnBody(/function scrollExportUiIntoView\([\s\S]*?\n  \}/);
  assert.ok(body.includes('block: "nearest"'));
  assert.ok(body.includes("try {") && body.includes("catch"));
});

console.log("\n[STEP20-5] STEP20-4の動作・禁止事項を壊していない");

check("生成完了処理からnavigator.share()を直接呼ばず、共有はボタンのclickから直接呼ぶ(STEP20-4のまま)", () => {
  const run = fnBody(/async function runExportShotAsVideo\([\s\S]*?\n  \}/);
  assert.ok(!/navigator\.share\(\{/.test(run));
  assert.ok(/exportShareBtn\.addEventListener\("click",\s*\(\)\s*=>\s*\{\s*shareExportedVideo\(pendingExportFile, pendingExportTiming\);\s*\}\);/.test(html));
  assert.ok(html.includes("navigator.share({ files: [file], title: file.name })"));
});

check("動画生成ロジック(captureStream/MediaRecorder/Blob/フレーム描画/時間)は変更していない", () => {
  const run = fnBody(/async function runExportShotAsVideo\([\s\S]*?\n  \}/);
  ["exportCanvas.captureStream(24)", "new MediaRecorder(", "new Blob(chunks", "BufferEngine.findFrameAt(frames, clamped)",
   "const durationMs = frames[frames.length - 1].time;", "recorder.start();", "await stopped;"].forEach((s) =>
    assert.ok(run.includes(s), "生成ロジックの断片が失われている: " + s));
  assert.ok(!/VideoEncoder|VideoDecoder|ffmpeg/i.test(html));
});

check("「動画保存」→「共有する」への切り替え案は実装していない(共有ボタンは従来のexportShareBtnのみ)", () => {
  assert.strictEqual((html.match(/exportBtn\.textContent = "動画保存"/g) || []).length, 1);
  assert.ok(!html.includes('exportBtn.textContent = "共有する"'));
  assert.ok(html.includes('id="exportShareBtn"'));
});

check("4エンジン・A/B比較・STEP19修正は変更されていない(主要関数の存在確認)", () => {
  ["async function openComparison(shotA, shotB)", "function closeComparison()", "function setComparisonSync(on)",
   "async function openShotReview(shot)"].forEach((s) => assert.ok(html.includes(s), s));
  assert.ok(html.includes("setComparisonMarkingMode(channel, false)"));
  assert.ok(!/StorageEngine\.(saveShot|saveMarking|deleteShot|deleteMarking|deleteShotMarkings)\(/.test(
    fnBody(/async function runExportShotAsVideo\([\s\S]*?\n  \}/)));
});

check("HTML内のメインスクリプトが構文として解析可能", () => {
  const m = html.match(/<script>\s*\(\(\) => \{[\s\S]*?\}\)\(\);\s*<\/script>/);
  assert.ok(m);
  assert.doesNotThrow(() => new Function(m[0].replace(/^<script>/, "").replace(/<\/script>$/, "")));
});

console.log("\n" + passCount + " 件成功" + (process.exitCode ? " / 失敗あり" : " / 全て成功"));
console.log("\n[注記] 作成中表示の見え方・自動スクロールの挙動・ボタン幅変化によるレイアウトへの影響は、iPad実機確認が必要です。\n");
