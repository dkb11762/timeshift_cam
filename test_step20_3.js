// test_step20_3.js
//
// STEP20-3(動画共有失敗の診断強化)の静的確認テスト。
//
// 今回の目的は診断情報の追加のみであり、共有処理・動画生成処理の設計変更は一切行っていない。
// そのため本テストでは、
//   1. 指示された診断項目(err.name/message/constructor.name、navigator.userActivationの
//      isActive/hasBeenActive、navigator.canShareの結果、file.type/size、MediaRecorderの
//      mimeType、動画生成開始/Blob生成完了/navigator.share()呼び出しの各時刻)が
//      画面表示コードに存在すること
//   2. navigator.share()の呼び出し方(files+titleの単純な呼び出し)や、MediaRecorder/
//      captureStream/Blob生成のロジック自体がSTEP20-2から変更されていないこと
//   3. 禁止事項(共有方式変更・共有ボタン新設・動画生成処理変更・MediaRecorder方式変更・
//      WebCodecs導入・MP4変換方式変更・4エンジン変更・60秒化)に抵触していないこと
//   4. STEP20-2までの回帰(4エンジン非依存・書き込みAPI不使用・既存機能温存等)が
//      引き続き成立していること
// を静的に確認する。navigator.userActivation等の実際の値そのものはNode.jsでは
// 検証できないため、iPad Safari実機での確認が別途必要(このテストは表示コードの存在確認のみ)。

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

console.log("\n[STEP20-3] 指示された診断項目が画面表示コードに存在すること");

check("err.name / err.message / err.constructor?.name を表示している", () => {
  assert.ok(step20Src.includes('"err.name: "'));
  assert.ok(step20Src.includes('"err.message: "'));
  assert.ok(step20Src.includes("err.constructor && err.constructor.name"));
});

check("navigator.userActivation.isActive / hasBeenActive を表示している", () => {
  assert.ok(step20Src.includes("function describeUserActivation"));
  assert.ok(step20Src.includes("ua.isActive"));
  assert.ok(step20Src.includes("ua.hasBeenActive"));
  // 呼び出し直前とcatch時の両方で記録していること
  assert.ok(step20Src.includes("呼び出し直前のuserActivation"));
  assert.ok(step20Src.includes("catch時点のuserActivation"));
});

check("navigator.canShare({files:[file]})の結果を表示している", () => {
  assert.ok(step20Src.includes("const canShareResult = navigator.canShare"));
  assert.ok(step20Src.includes("navigator.canShare({files:[file]})"));
});

check("file.type / file.size を表示している", () => {
  assert.ok(/diag\.push\(\s*"file\.type=".*file\.type.*file\.size/.test(step20Src.replace(/\s+/g, " ")));
});

check("使用したMediaRecorderのmimeTypeを表示している", () => {
  assert.ok(step20Src.includes("MediaRecorder mimeType"));
  assert.ok(step20Src.includes("timing.mimeType"));
});

check("動画生成開始時刻・Blob生成完了時刻・navigator.share()呼び出し時刻を記録・表示している", () => {
  assert.ok(step20Src.includes("const exportStartedAt = Date.now();"));
  assert.ok(step20Src.includes("const blobReadyAt = Date.now();"));
  assert.ok(step20Src.includes('"動画生成開始: "'));
  assert.ok(step20Src.includes('"Blob生成完了: "'));
  assert.ok(step20Src.includes('"navigator.share()呼び出し: "'));
});

check("診断情報は表示するだけで、値に基づいて処理を分岐させていない(コメントで明示)", () => {
  assert.ok(step20Src.includes("この値に基づいて処理を分岐させたりはしない"));
});

console.log("\n[STEP20-3] 共有処理・動画生成処理の設計を変更していないことの確認");

check("navigator.share()の呼び出し方自体は変更していない(files+titleのみ、新しい引数を追加していない)", () => {
  assert.ok(/navigator\.share\(\{\s*files:\s*\[file\],\s*title:\s*filename\s*\}\)/.test(step20Src));
});

check("共有ボタンを新設していない(既存の「動画保存」ボタン1つのまま)", () => {
  const exportBtnCount = (html.match(/exportBtn\.textContent = "動画保存"/g) || []).length;
  assert.strictEqual(exportBtnCount, 1, "動画保存ボタンの生成箇所が1箇所ではない");
  assert.ok(!html.includes('"共有する"'), "新しい共有ボタンらしき文言が追加されている");
});

check("MediaRecorder/captureStream/Blob生成のロジック自体は変更していない(STEP20-2と同じ構成)", () => {
  assert.ok(step20Src.includes("exportCanvas.captureStream(24)"));
  assert.ok(step20Src.includes("new MediaRecorder("));
  assert.ok(step20Src.includes("new Blob(chunks"));
  assert.ok(step20Src.includes("BufferEngine.findFrameAt("));
});

check("WebCodecsを導入していない", () => {
  assert.ok(!/VideoEncoder|VideoDecoder/.test(step20Src));
});

check("MP4変換ライブラリを導入していない、外部scriptを追加していない", () => {
  assert.ok(!/ffmpeg/i.test(html));
  const scriptSrcs = [...html.matchAll(/<script src="([^"]+)">/g)].map((m) => m[1]);
  scriptSrcs.forEach((src) => {
    assert.ok(
      ["bufferEngine.js", "playbackEngine.js", "storageEngine.js", "coordinateEngine.js"].includes(src),
      "想定外の外部scriptが追加されている: " + src
    );
  });
});

check("録画時間を60秒等に固定していない(保存フレームのtimeから算出したdurationMsのまま)", () => {
  assert.ok(step20Src.includes("frames[frames.length - 1].time"));
  assert.ok(!/setInterval\(/.test(step20Src));
});

console.log("\n[STEP20-3] STEP20-2までの回帰の確認");

check("4エンジンファイルは無変更、書き込み系APIを呼んでいない", () => {
  ["bufferEngine.js", "playbackEngine.js", "storageEngine.js", "coordinateEngine.js"].forEach((f) => {
    assert.ok(fs.existsSync(path.join(__dirname, f)), f + "が見つからない");
  });
  const storageSrc = fs.readFileSync(path.join(__dirname, "storageEngine.js"), "utf8");
  assert.ok(/const DB_VERSION = 2;/.test(storageSrc));
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

check("既存機能(保存・レビュー・比較)の主要関数・STEP19修正が維持されている", () => {
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

check("exportStatus表示にwhite-space:pre-lineが指定され、複数行の診断表示が崩れない", () => {
  assert.ok(/#exportStatus\s*\{\s*white-space:\s*pre-line;\s*\}/.test(html));
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
  "\n[注記] navigator.userActivation等の実際の値・診断表示の実際の見た目・原因特定そのものは\n" +
    "Node.jsでは検証できず、iPad Safari実機での確認が必要です。今回はまだ実機テストへは進みません。\n"
);
