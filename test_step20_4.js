// test_step20_4.js
//
// STEP20-4(動画生成とnavigator.share()呼び出しの分離)の静的確認テスト。
//
// 目的：STEP20-3までは動画生成(Blob完成)の直後に自動でnavigator.share()を呼んでおり、
// これが「動画生成中の非同期処理でtransient user activationが失効する」ことによる
// NotAllowedErrorの原因と推定された。STEP20-4では、
//   1. 動画生成完了後はnavigator.share()を自動実行しない
//   2. 生成済みFile/Blobを保持し、「共有する」ボタンの表示のみ行う
//   3. 「共有する」ボタンのクリックそのものを起点にnavigator.share()を呼ぶ
// という構造に変更した。本テストはこの構造をNode.js上で静的に確認する
// (navigator.share()の実際の成否・Safariのuser activation判定そのものは
// Node.jsでは検証できず、iPad実機確認が別途必要)。
//
// 既存テスト(test_coordinateEngine.js / test_step11.js〜test_step17.js / test_step20_3.js)は
// 本ファイルの対象外。ただしtest_step20_3.jsのうち「共有ボタンを新設していない」等、
// STEP20-4で意図的に変更した項目はここで置き換える。

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

const sectionStart = html.indexOf('const exportStatusEl = document.getElementById("exportStatus");');
const sectionEnd = html.indexOf("// ---- 保存済み射の再生 ----");
const step20Src = sectionStart >= 0 && sectionEnd > sectionStart ? html.slice(sectionStart, sectionEnd) : "";

console.log("\n[STEP20-4] 動画生成完了処理からnavigator.share()を直接呼んでいないこと");

check("runExportShotAsVideo()(生成処理本体)内にnavigator.share()の実際の呼び出しが存在しない(生成完了処理からの直接呼び出し禁止。コメントでの言及は許容)", () => {
  const fnMatch = step20Src.match(/async function runExportShotAsVideo\([\s\S]*?\n  \}/);
  assert.ok(fnMatch, "runExportShotAsVideo()が見つからない");
  assert.ok(!/navigator\.share\(\{/.test(fnMatch[0]), "runExportShotAsVideo()がnavigator.share()を直接呼んでいる");
});

check("Blob生成完了後はprepareExportedVideoForShare()を呼ぶだけで、awaitで共有完了を待っていない", () => {
  const fnMatch = step20Src.match(/async function runExportShotAsVideo\([\s\S]*?\n  \}/);
  const body = fnMatch[0];
  assert.ok(body.includes("prepareExportedVideoForShare(blob, filename,"), "prepareExportedVideoForShare()の呼び出しが見つからない");
  assert.ok(!/await\s+shareExportedVideo/.test(body), "生成完了処理がshareExportedVideo()の完了を待っている(自動共有の名残)");
});

console.log("\n[STEP20-4] 「共有する」ボタンのクリックを起点にnavigator.share()を呼ぶこと");

check("「共有する」ボタン(exportShareBtn)が追加されている", () => {
  assert.ok(html.includes('id="exportShareBtn"'), "exportShareBtnが見つからない");
  assert.ok(html.includes('id="exportShareRow"'), "exportShareRowが見つからない");
  assert.ok(html.includes(">共有する<"), "「共有する」ボタンの文言が見つからない");
});

check("既存の「動画保存」ボタンはそのまま維持されている(削除・改名していない)", () => {
  assert.ok(html.includes('exportBtn.textContent = "動画保存"'), "既存の「動画保存」ボタンが見つからない");
  const exportBtnCount = (html.match(/exportBtn\.textContent = "動画保存"/g) || []).length;
  assert.strictEqual(exportBtnCount, 1);
});

check("exportShareBtnのclickハンドラがshareExportedVideo()を直接呼んでいる(間に他の非同期処理を挟んでいない)", () => {
  const m = html.match(/exportShareBtn\.addEventListener\("click",\s*\(\)\s*=>\s*\{[\s\S]*?\}\);/);
  assert.ok(m, "exportShareBtnのclickハンドラが見つからない");
  assert.ok(m[0].includes("shareExportedVideo(pendingExportFile, pendingExportTiming)"));
  // ハンドラ自体が同期関数(async宣言なし)であり、クリック処理自体がawaitを挟まずに
  // shareExportedVideo()呼び出しへ到達することを確認する
  assert.ok(!/async\s*\(\)\s*=>\s*\{/.test(m[0]), "clickハンドラがasyncになっている(不要な間接化の可能性)");
});

check("shareExportedVideo()はFile生成を行わず、渡されたFileをそのまま使う(再生成しない)", () => {
  const fnMatch = html.match(/async function shareExportedVideo\([\s\S]*?\n  \}/);
  assert.ok(fnMatch, "shareExportedVideo()が見つからない");
  assert.ok(!fnMatch[0].includes("new File("), "shareExportedVideo()内でFileを新規生成している(再生成禁止)");
  assert.ok(fnMatch[0].includes("navigator.share({ files: [file], title: file.name })"));
});

check("File/Blobの生成(new File)はprepareExportedVideoForShare()内で1回だけ行われる", () => {
  const fileNewCount = (html.match(/new File\(\[blob\]/g) || []).length;
  assert.strictEqual(fileNewCount, 1, "new Fileの呼び出し箇所が1箇所ではない(重複生成の可能性)");
  const fnMatch = html.match(/function prepareExportedVideoForShare\([\s\S]*?\n  \}/);
  assert.ok(fnMatch, "prepareExportedVideoForShare()が見つからない");
  assert.ok(fnMatch[0].includes("new File([blob]"));
});

console.log("\n[STEP20-4] 保持したFile/Blobを再利用し、動画を再生成しないこと");

check("pendingExportFile/pendingExportTimingが動画生成完了後に保持され、共有ボタンから参照される", () => {
  assert.ok(step20Src.includes("let pendingExportFile = null;"));
  assert.ok(step20Src.includes("let pendingExportTiming = null;"));
  assert.ok(step20Src.includes("pendingExportFile = file;"));
  assert.ok(step20Src.includes("pendingExportTiming = timing;"));
});

check("新しい動画生成の開始時に、前回の共有待ち状態をリセットしている(古いFileを誤って共有しない)", () => {
  const fnMatch = step20Src.match(/async function runExportShotAsVideo\([\s\S]*?\n  \}/);
  const body = fnMatch[0];
  const resetIdx = body.indexOf("pendingExportFile = null;");
  const isExportingIdx = body.indexOf("isExportingVideo = true;");
  assert.ok(resetIdx > isExportingIdx && resetIdx >= 0, "動画生成開始時にpendingExportFileをリセットしていない");
  assert.ok(body.includes('exportShareRow.style.display = "none";'));
});

check("動画生成ロジック(captureStream/MediaRecorder/Blob生成/描画)自体はSTEP20-2から変更されていない", () => {
  assert.ok(step20Src.includes("exportCanvas.captureStream(24)"));
  assert.ok(step20Src.includes("new MediaRecorder("));
  assert.ok(step20Src.includes("new Blob(chunks"));
  assert.ok(step20Src.includes("BufferEngine.findFrameAt("));
  assert.ok(step20Src.includes("frames[frames.length - 1].time"));
});

console.log("\n[STEP20-4] 完成時のサマリ表示(秒数/形式/サイズ)");

check("「動画が完成しました」のサマリに秒数・形式(MP4/WebM)・サイズ(MB)を含めている", () => {
  const fnMatch = html.match(/function prepareExportedVideoForShare\([\s\S]*?\n  \}/);
  const body = fnMatch[0];
  assert.ok(body.includes("動画が完成しました"));
  assert.ok(body.includes("durationSec"));
  assert.ok(/toFixed\(1\)\s*\+\s*"秒/.test(body), "秒数表示が見つからない");
  assert.ok(body.includes('"MP4"'));
  assert.ok(body.includes('"WebM"'));
  assert.ok(/1048576/.test(body), "MB換算(1048576での割り算)が見つからない");
});

console.log("\n[STEP20-4] エラー処理(AbortError=キャンセル、その他=エラー表示)");

check("AbortErrorはキャンセル、それ以外はエラーとして扱う分岐が維持されている", () => {
  const fnMatch = html.match(/async function shareExportedVideo\([\s\S]*?\n  \}/);
  const body = fnMatch[0];
  assert.ok(body.includes('err.name === "AbortError"'));
  assert.ok(body.includes("共有をキャンセルしました"));
  assert.ok(body.includes("共有に失敗しました"));
});

check("診断表示(err.name/message/constructor、userActivation、canShare、mimeType等)は維持されている", () => {
  const fnMatch = html.match(/async function shareExportedVideo\([\s\S]*?\n  \}/);
  const body = fnMatch[0];
  ["err.name: ", "err.message: ", "err.constructor?.name: ", "呼び出し直前のuserActivation", "catch時点のuserActivation", "navigator.canShare({files:[file]}):", "MediaRecorder mimeType: "].forEach(
    (s) => assert.ok(body.includes(s), "診断項目が失われている: " + s)
  );
  assert.ok(html.includes("function describeUserActivation"));
  assert.ok(html.includes("function formatDiagTimestamp"));
});

console.log("\n[STEP20-4] 禁止事項の非抵触の確認");

check("Canvas→captureStream→MediaRecorder→Blobの生成方式を変更していない", () => {
  assert.ok(step20Src.includes("exportCanvas.captureStream(24)"));
  assert.ok(step20Src.includes("recorder.start()"));
});

check("MP4優先/WebMフォールバックの候補リストを変更していない", () => {
  assert.ok(html.includes("const EXPORT_MIME_CANDIDATES = ["));
  assert.ok(html.includes('"video/mp4;codecs=h264"'));
  assert.ok(html.includes('"video/webm"'));
});

check("動画生成時間(保存フレームの実時間)を変更していない、60秒化していない", () => {
  assert.ok(step20Src.includes("const durationMs = frames[frames.length - 1].time;"));
  assert.ok(!/60\s*\*\s*1000/.test(step20Src));
});

check("WebCodecsを導入していない", () => {
  assert.ok(!/VideoEncoder|VideoDecoder/.test(step20Src));
});

check("MP4変換ライブラリ・音声トラック追加・マーキング焼き込みを行っていない", () => {
  assert.ok(!/ffmpeg/i.test(html));
  assert.ok(!/getAudioTracks|addTrack\(.*audio/i.test(step20Src));
  assert.ok(!step20Src.includes("drawMarkingShape") && !step20Src.includes("drawShotMarkingShape"));
});

check("StorageEngine/BufferEngine/PlaybackEngine/CoordinateEngineは無変更(4エンジンファイルは存在確認のみ、内容比較は既存回帰テストに委ねる)", () => {
  ["bufferEngine.js", "playbackEngine.js", "storageEngine.js", "coordinateEngine.js"].forEach((f) => {
    assert.ok(fs.existsSync(path.join(__dirname, f)), f + "が見つからない");
  });
  [
    "StorageEngine.saveShot",
    "StorageEngine.saveMarking",
    "StorageEngine.deleteShot(",
    "StorageEngine.deleteMarking(",
    "StorageEngine.deleteShotMarkings(",
  ].forEach((writeApi) => {
    assert.ok(!step20Src.includes(writeApi), "動画保存コードが書き込み系API(" + writeApi + ")を呼んでいる");
  });
});

check("A/B比較機能・STEP19修正・主要な既存関数は維持されている", () => {
  [
    "async function openShotReview(shot)",
    "function closeShotReview()",
    "async function openComparison(shotA, shotB)",
    "function closeComparison()",
    "function setComparisonSync(on)",
  ].forEach((sig) => {
    assert.ok(html.includes(sig), sig + " が見つからない");
  });
  assert.ok(html.includes("setComparisonMarkingMode(channel, false)"), "STEP19の修正が失われている");
});

check("大規模UI変更をしていない(既存の設定パネル構造・保存射一覧の位置を維持し、追加は最小限)", () => {
  assert.ok(html.includes('<div class="label" style="margin-top:14px">保存した射</div>'));
  assert.ok(html.includes('<div id="shotList" class="hint-note">まだ保存された射はありません。</div>'));
  // exportShareRowは既存のexportStatusの直後という最小限の追加位置にあること
  const idx1 = html.indexOf('<p id="exportStatus"');
  const idx2 = html.indexOf('<div class="row" id="exportShareRow"');
  assert.ok(idx1 >= 0 && idx2 > idx1 && idx2 - idx1 < 500, "exportShareRowの追加位置が離れすぎている(意図しない構造変更の可能性)");
});

check("HTML内のメインスクリプトが構文として解析可能である(実行はしない)", () => {
  const scriptMatch = html.match(/<script>\s*\(\(\) => \{[\s\S]*?\}\)\(\);\s*<\/script>/);
  assert.ok(scriptMatch, "本体IIFEスクリプトブロックが見つからない");
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new-func
    new Function(scriptMatch[0].replace(/^<script>/, "").replace(/<\/script>$/, ""));
  });
});

console.log("\n" + passCount + " 件成功" + (process.exitCode ? " / 失敗あり" : " / 全て成功"));
console.log(
  "\n[注記] navigator.share()の実際の成否、Safariのtransient user activationの挙動、\n" +
    "「共有する」ボタンの実際の見た目・タップ反応はNode.jsでは検証できず、iPad実機確認が必要です。\n" +
    "今回はGO後の実装・Node回帰確認までであり、まだ実機テストへは進みません。\n"
);
