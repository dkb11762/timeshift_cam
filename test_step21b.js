// test_step21b.js
//
// STEP21-B(保存時間を約1分へ拡張)のNode.jsで検証可能な範囲のテスト。
//   ・index.html内の「STEP21-BEGIN 〜 STEP21-END」ブロック(純粋ロジック)を、そのまま取り出して検証する
//     (実装とテストのロジックが乖離しないようにするため)。
//   ・保存処理・captureFrame・回転処理の「配線」は静的に確認する(DOM/IndexedDB/カメラはNode.jsでは動かせない)。
// 既存テスト(test_coordinateEngine.js / test_step11.js〜test_step17.js / test_step20系 / test_step21a.js)は
// 本ファイルの対象外。別途そのまま実行し、回帰がないことを確認すること。

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

// ---- index.htmlからSTEP21ブロックを取り出す ----
function grabLine(re, label) {
  const m = html.match(re);
  assert.ok(m, label + "の定義が見つからない");
  return m[0];
}
const preludeSrc = [
  grabLine(/const MAX_DELAY_SEC = \d+;/, "MAX_DELAY_SEC"),
  grabLine(/const SLOW_WINDOW_OPTIONS = \[[^\]]*\];/, "SLOW_WINDOW_OPTIONS"),
  grabLine(/const MAX_SLOW_WINDOW_SEC = \d+;/, "MAX_SLOW_WINDOW_SEC"),
  grabLine(/const BUFFER_RETENTION_SEC = [^;]+;/, "BUFFER_RETENTION_SEC"),
].join("\n");
const beginIdx = html.indexOf("// STEP21-BEGIN");
const endIdx = html.indexOf("// STEP21-END");
assert.ok(beginIdx >= 0 && endIdx > beginIdx, "STEP21-BEGIN/ENDが見つからない");
const blockSrc = html.slice(beginIdx, endIdx);
const S = new Function(
  preludeSrc + "\n" + blockSrc +
    "\nreturn { SAVE_RANGE_OPTIONS, SLOW_WINDOW_OPTIONS, DEFAULT_SAVE_RANGE_SEC, MAX_SAVE_RANGE_SEC," +
    " MAX_BUFFER_RETENTION_SEC, BUFFER_RETENTION_SEC, SAVE_SHORTFALL_NOTICE_SEC, sanitizeSaveRangeSec," +
    " computeBufferRetentionSec, computeSaveAvailableSec, createFrameProtector };"
)();

console.log("\n[STEP21-B] 保存範囲と選択肢の分離");

check("保存範囲は10/30/60秒", () => {
  assert.deepStrictEqual(S.SAVE_RANGE_OPTIONS, [10, 30, 60]);
});
check("スロー確認範囲は3/5/10秒のまま", () => {
  assert.deepStrictEqual(S.SLOW_WINDOW_OPTIONS, [3, 5, 10]);
});
check("SAVE_RANGE_OPTIONSとSLOW_WINDOW_OPTIONSは別の配列(参照を共有していない)", () => {
  assert.notStrictEqual(S.SAVE_RANGE_OPTIONS, S.SLOW_WINDOW_OPTIONS);
  assert.ok(!/SAVE_RANGE_OPTIONS\s*=\s*SLOW_WINDOW_OPTIONS/.test(html), "旧来の共有代入が残っている");
  assert.ok(!/SLOW_WINDOW_OPTIONS\s*=\s*SAVE_RANGE_OPTIONS/.test(html));
});
check("スロー確認側(ライブ/レビュー/比較)のSLOW_WINDOW_OPTIONS使用が3箇所とも残っている", () => {
  const uses = html.match(/SLOW_WINDOW_OPTIONS\.forEach/g) || [];
  assert.strictEqual(uses.length, 3);
});
check("保存範囲の描画はSAVE_RANGE_OPTIONSを使う", () => {
  assert.ok(/SAVE_RANGE_OPTIONS\.forEach\(\(sec\) => \{/.test(html));
});

console.log("\n[STEP21-B] 初期値・保存値の検証(移行)");

check("初期値は60秒", () => {
  assert.strictEqual(S.DEFAULT_SAVE_RANGE_SEC, 60);
  assert.strictEqual(S.sanitizeSaveRangeSec(0), 60); // キー無し: Number(null)=0
  assert.strictEqual(S.sanitizeSaveRangeSec(NaN), 60);
});
check("既存の有効な設定(10/30/60)は維持される(10秒を60秒へ強制変更しない)", () => {
  assert.strictEqual(S.sanitizeSaveRangeSec(10), 10);
  assert.strictEqual(S.sanitizeSaveRangeSec(30), 30);
  assert.strictEqual(S.sanitizeSaveRangeSec(60), 60);
});
check("旧仕様の3/5秒は60秒へ移行される", () => {
  assert.strictEqual(S.sanitizeSaveRangeSec(3), 60);
  assert.strictEqual(S.sanitizeSaveRangeSec(5), 60);
  assert.strictEqual(S.sanitizeSaveRangeSec(45), 60);
});
check("起動時に検証関数を通し、移行した値をlocalStorageへ保存し直している(静的確認)", () => {
  assert.ok(/let saveRangeSec = sanitizeSaveRangeSec\(Number\(localStorage\.getItem\("saveRangeSec"\)\)\);/.test(html));
  assert.ok(/localStorage\.setItem\("saveRangeSec", String\(saveRangeSec\)\);/.test(html));
});
check("保存範囲とスロー確認範囲は別のlocalStorageキーで永続化される", () => {
  assert.ok(html.includes('localStorage.setItem("saveRangeSec", String(sec))'));
  assert.ok(html.includes('localStorage.setItem("slowWindowSec", String(sec))'));
  assert.ok(!/localStorage\.setItem\("saveRangeSec", String\(slow/.test(html));
  assert.ok(!/localStorage\.setItem\("slowWindowSec", String\(save/.test(html));
});

console.log("\n[STEP21-B] バッファ保持時間(R2方式)");

check("標準条件(遅延10秒+保存60秒)は75秒", () => {
  assert.strictEqual(S.computeBufferRetentionSec(10, 60), 75);
});
check("保存10秒は従来の45秒のまま(遅延1〜30秒)", () => {
  for (let d = 1; d <= 30; d++) assert.strictEqual(S.computeBufferRetentionSec(d, 10), Math.max(45, d + 15));
  assert.strictEqual(S.computeBufferRetentionSec(10, 10), 45);
  assert.strictEqual(S.computeBufferRetentionSec(30, 10), 45);
});
check("保存30秒: 遅延10秒で45秒、遅延30秒で65秒", () => {
  assert.strictEqual(S.computeBufferRetentionSec(10, 30), 45);
  assert.strictEqual(S.computeBufferRetentionSec(30, 30), 65);
});
check("上限80秒を超えない(遅延30秒+保存60秒でも80秒)", () => {
  assert.strictEqual(S.MAX_BUFFER_RETENTION_SEC, 80);
  assert.strictEqual(S.computeBufferRetentionSec(30, 60), 80);
  for (const d of [1, 10, 20, 30]) for (const r of [10, 30, 60]) {
    const v = S.computeBufferRetentionSec(d, r);
    assert.ok(v >= 45 && v <= 80, "範囲外: " + d + "," + r + " -> " + v);
  }
});
check("下限は従来の基準値(BUFFER_RETENTION_SEC=45)", () => {
  assert.strictEqual(S.BUFFER_RETENTION_SEC, 45);
});
check("captureFrame()の間引きはgetBufferRetentionSec()を使い、固定値を直接使っていない(静的確認)", () => {
  const fn = html.match(/function captureFrame\(now\) \{[\s\S]*?\n  \}\n/)[0];
  assert.ok(fn.includes("getBufferRetentionSec()"));
  assert.ok(!fn.includes("BUFFER_RETENTION_SEC * 1000"));
  assert.ok(fn.includes("releaseBufferFrame(old)"));
  assert.ok(!/old\.bitmap\.close\(\)/.test(fn), "間引きで直接close()している(保護をすり抜ける)");
});

console.log("\n[STEP21-B] 今保存できる長さ");

check("バッファ最古〜再生位置の範囲を、選択中の保存範囲で頭打ちにする", () => {
  assert.strictEqual(S.computeSaveAvailableSec(100000, 40000, 60), 60);
  assert.strictEqual(S.computeSaveAvailableSec(100000, 70000, 60), 30);
  assert.strictEqual(S.computeSaveAvailableSec(100000, 70000, 10), 10);
});
check("バッファが空・再生位置未確定・最古が再生位置より後の場合は0(負数にならない)", () => {
  assert.strictEqual(S.computeSaveAvailableSec(null, 0, 60), 0);
  assert.strictEqual(S.computeSaveAvailableSec(100000, null, 60), 0);
  assert.strictEqual(S.computeSaveAvailableSec(1000, 5000, 60), 0);
});
check("UI要素・ラベルが追加され、スロー確認範囲と保存範囲が別項目になっている(静的確認)", () => {
  assert.ok(html.includes('id="saveAvailableInfo"'));
  assert.ok(html.includes(">スロー確認範囲</div>"));
  assert.ok(html.includes("保存する範囲（現在の再生位置から過去へさかのぼって保存）"));
  assert.ok(html.includes("updateSaveAvailableInfo(false, now)"), "loop()から更新していない");
});

console.log("\n[STEP21-B] 保存中のフレーム保護");

function makeFrames(n) {
  return Array.from({ length: n }, (_, i) => ({ time: i * 50, bitmap: { closed: 0, close() { this.closed++; } } }));
}
// index.htmlのreleaseBufferFrame()と同じ流れ
function makeReleaser(getProtector) {
  return (f) => {
    const p = getProtector();
    if (p && p.tryDefer(f)) return;
    f.bitmap.close();
  };
}

check("保存中に古い側が間引かれても、未書き込みの保護対象はclose()されない(保護あり)", () => {
  const buffer = makeFrames(1500);
  const selected = buffer.slice(0, 1300); // 古い側から保存(最も間引かれやすい側)
  let protector = S.createFrameProtector(selected);
  const release = makeReleaser(() => protector);
  let maxDeferred = 0;
  for (let i = 0; i < selected.length; i++) {
    // 保存1枚あたり、ライブ側で2枚ぶん古いフレームが間引かれる(保存が遅い最悪ケースを模擬)
    for (let k = 0; k < 2 && buffer.length; k++) release(buffer.shift());
    assert.strictEqual(selected[i].bitmap.closed, 0, "未書き込みのフレーム" + i + "がclose()された");
    maxDeferred = Math.max(maxDeferred, protector.deferredCount());
    protector.markDone(i + 1).forEach((f) => f.bitmap.close()); // onProgress相当
  }
  protector.finish().forEach((f) => f.bitmap.close());
  protector = null;
  selected.forEach((f, i) => assert.ok(f.bitmap.closed <= 1, "二重close: " + i));
  assert.ok(maxDeferred > 0, "退避が一度も発生しておらず、保護の検証になっていない");
});
check("対照: 保護が無い場合は同じ状況で未書き込みフレームがclose()される(テストが実際に検出できることの確認)", () => {
  const buffer = makeFrames(1500);
  const selected = buffer.slice(0, 1300);
  let closedTooEarly = 0;
  for (let i = 0; i < selected.length; i++) {
    for (let k = 0; k < 2 && buffer.length; k++) buffer.shift().bitmap.close();
    if (selected[i].bitmap.closed > 0) closedTooEarly++;
  }
  assert.ok(closedTooEarly > 0);
});
check("保存範囲外のフレームは保護されず、通常どおり即座にclose()される", () => {
  const buffer = makeFrames(100);
  const selected = buffer.slice(50, 100);
  const protector = S.createFrameProtector(selected);
  const release = makeReleaser(() => protector);
  release(buffer[0]);
  assert.strictEqual(buffer[0].bitmap.closed, 1);
  assert.strictEqual(protector.deferredCount(), 0);
});
check("書き込み済み(idx<done)のフレームが後で間引かれた場合は、退避せず即close()される", () => {
  const buffer = makeFrames(10);
  const selected = buffer.slice(0, 5);
  const protector = S.createFrameProtector(selected);
  protector.markDone(3);
  assert.strictEqual(protector.tryDefer(selected[0]), false);
  assert.strictEqual(protector.tryDefer(selected[3]), true);
});
check("markDone(n)は、退避中のうちインデックス<nのものだけを返す", () => {
  const selected = makeFrames(6);
  const protector = S.createFrameProtector(selected);
  [0, 1, 4].forEach((i) => protector.tryDefer(selected[i]));
  const rel = protector.markDone(2);
  assert.deepStrictEqual(rel.map((f) => f.time), [0, 50]);
  assert.strictEqual(protector.deferredCount(), 1);
});
check("finish()は残りの退避分をすべて返し、以後は何も保護しない(失敗時の後始末)", () => {
  const selected = makeFrames(4);
  const protector = S.createFrameProtector(selected);
  protector.tryDefer(selected[1]);
  protector.tryDefer(selected[3]);
  const rest = protector.finish();
  assert.strictEqual(rest.length, 2);
  assert.strictEqual(protector.deferredCount(), 0);
  assert.strictEqual(protector.tryDefer(selected[2]), false);
});

console.log("\n[STEP21-B] 保存処理の配線(静的確認)");

const saveHandler = html.match(/saveShotBtn\.addEventListener\("click", async \(\) => \{[\s\S]*?\n  \}\);\n/)[0];

check("保護対象の登録は、saveShot()の直前で、awaitを挟まずに行われる(切り出し結果を一致させるため)", () => {
  const a = saveHandler.indexOf("saveProtector = createFrameProtector(");
  const b = saveHandler.indexOf("await StorageEngine.saveShot(");
  assert.ok(a >= 0 && b > a, "保護の登録がsaveShot()より後、または存在しない");
  assert.ok(!/await/.test(saveHandler.slice(a, b)), "保護登録とsaveShot()の間にawaitがある");
});
check("保護の切り出しはsaveShot()と同じ入力・StorageEngineの公開APIを使う", () => {
  assert.ok(saveHandler.includes("StorageEngine.computeSaveRange("));
  assert.ok(saveHandler.includes("StorageEngine.selectFramesInRange("));
  assert.ok(saveHandler.includes("await StorageEngine.saveShot(frameBuffer, saveOpts)"));
  assert.ok(saveHandler.includes("saveOpts.playbackTime, saveOpts.windowSec, saveOpts.oldestAvailableTime"));
});
check("onProgressで書き込み済みフレームの退避分を解放し、finallyで残りを必ず解放する", () => {
  assert.ok(saveHandler.includes("closeFrameList(saveProtector.markDone(done))"));
  const fin = saveHandler.slice(saveHandler.indexOf("} finally {"));
  assert.ok(fin.includes("closeFrameList(saveProtector.finish())"));
  assert.ok(fin.includes("saveProtector = null"));
});
check("保存中はカメラ切替ボタンを無効化し、終了後に戻す。切替ハンドラにもガードがある", () => {
  assert.ok(saveHandler.includes("flipBtn.disabled = true"));
  assert.ok(saveHandler.includes("flipBtn.disabled = false"));
  const flip = html.match(/flipBtn\.addEventListener\("click", async \(\) => \{[\s\S]*?\n  \}\);/)[0];
  assert.ok(flip.indexOf("if (isSaving) return;") >= 0 && flip.indexOf("if (isSaving) return;") < flip.indexOf("startCamera()"));
});
check("保存中の回転処理(applyOrientation)は保留され、保存完了後に反映される", () => {
  const ao = html.match(/function applyOrientation\(\) \{[\s\S]*?\n  \}\n/)[0];
  const firstStmt = ao.slice(ao.indexOf("{") + 1).trim();
  assert.ok(firstStmt.indexOf("// STEP21-B") === 0 || firstStmt.indexOf("if (isSaving)") >= 0);
  assert.ok(ao.indexOf("if (isSaving)") < ao.indexOf("clearBuffer()"), "保留判定がclearBuffer()より後ろにある");
  assert.ok(ao.includes("orientationDeferredBySave = true"));
  const fin = saveHandler.slice(saveHandler.indexOf("} finally {"));
  assert.ok(fin.indexOf("isSaving = false") >= 0 && fin.indexOf("applyOrientation()") > fin.indexOf("isSaving = false"),
    "保留した回転を、isSaving=falseにした後で反映していない");
});
check("実際の保存時間が確認できる: 成功表示に実際の秒数、要求より1.5秒以上短い場合は要求値と併記", () => {
  assert.ok(saveHandler.includes("const requestedSec = saveRangeSec"));
  assert.ok(saveHandler.includes("windowSec: requestedSec"));
  assert.ok(saveHandler.includes("SAVE_SHORTFALL_NOTICE_SEC"));
  assert.ok(saveHandler.includes("要求 ") && saveHandler.includes("実際 "));
  assert.ok(saveHandler.includes("actualSec.toFixed(1)"));
});
check("失敗時の診断表示(STEP18②)は維持されている", () => {
  assert.ok(saveHandler.includes("エラー種別: "));
  assert.ok(saveHandler.includes("failed ? 20000 : 3000"));
});

console.log("\n[STEP21-B] 変更していないもの(静的確認)");

check("STEP19: 比較画面のsetComparisonMarkingMode(channel, false)が残っている", () => {
  assert.ok(html.includes("setComparisonMarkingMode(channel, false);"));
});
check("STEP20-5: 動画保存(作成中表示・共有ボタン)が残っている", () => {
  ["async function exportShotAsVideo(", "function startExportButtonProgress(", "function scrollExportUiIntoView(",
   "function prepareExportedVideoForShare(", "async function shareExportedVideo(", 'id="exportShareBtn"',
   "作成中… "].forEach((k) => assert.ok(html.includes(k), k + " が見つからない"));
  assert.ok(!/exportShotAsVideo[\s\S]{0,400}navigator\.share\(/.test(html.match(/async function runExportShotAsVideo[\s\S]*?\n  \}\n/)[0]),
    "動画生成側でnavigator.share()を自動呼び出ししている");
});
check("動画生成方式は変更なし(captureStream→MediaRecorder)、WebCodecs/MP4ライブラリは未導入", () => {
  assert.ok(html.includes("exportCanvas.captureStream(24)"));
  assert.ok(html.includes("new MediaRecorder("));
  assert.ok(!/VideoEncoder|VideoDecoder|mp4box|ffmpeg|mux\.js/i.test(html));
});
check("bufferEngine/playbackEngine/storageEngine/coordinateEngineの読み込みは従来どおり(index.htmlはEngineを書き換えない)", () => {
  ["bufferEngine.js", "playbackEngine.js", "storageEngine.js", "coordinateEngine.js"].forEach((f) =>
    assert.ok(html.includes('<script src="' + f + '"></script>')));
  assert.ok(!html.includes("DB_VERSION = 3"));
});
check("スロー確認範囲/保存射レビュー/比較画面の既定値(DEFAULT_SLOW_WINDOW_SEC=5, DEFAULT_SLOW_RATE=1/3)は不変", () => {
  assert.ok(html.includes("const DEFAULT_SLOW_WINDOW_SEC = 5;"));
  assert.ok(html.includes("const DEFAULT_SLOW_RATE = 1 / 3;"));
});

console.log("\n" + passCount + " 件成功" + (process.exitCode ? " / 失敗あり" : " / 全て成功"));
console.log(
  "\n[注記] 以下はNode.jsでは検証できず、iPad実機確認が必要です:\n" +
    "  - 10/30/60秒の保存、60秒Shotの再生・マーキング・A/B比較・動画保存\n" +
    "  - 保持75秒時(遅延10秒+保存60秒)の、A/B比較・動画保存中の負荷(ライブ取り込みも継続するため)\n" +
    "  - 保存中の回転保留・カメラ切替無効化の実際の見え方\n" +
    "  - 「今保存できる長さ」表示の見た目・更新のタイミング\n"
);
