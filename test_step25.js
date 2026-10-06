// test_step25.js
//
// STEP25(60秒射×2本比較時の黒画面・ページ再読み込み対策)のテスト。
// 比較中はライブ側のフレーム取得・バッファ保持を止め、ライブbufferを解放する(カメラstreamは維持)。
//
// index.html内の関数を、実際のソースをそのまま取り出してスタブ環境で実行する(挙動テスト)と、
// ソース文字列に対する静的確認を併用する。DOM・iPad Safariそのものの挙動は対象外。

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { PlaybackEngine } = require("./playbackEngine.js");

let passCount = 0;
let pending = Promise.resolve();
function check(name, fn) {
  pending = pending.then(async () => {
    try {
      await fn();
      passCount++;
      console.log("  OK  " + name);
    } catch (e) {
      console.log("  NG  " + name);
      console.log("      " + e.message);
      process.exitCode = 1;
    }
  });
}

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

function fnBody(src, re) {
  const m = src.match(re);
  assert.ok(m, "関数が見つからない: " + re);
  return m[0];
}
const openComparisonSrc = fnBody(html, /async function openComparison\([\s\S]*?\n  \}/);
const closeComparisonSrc = fnBody(html, /function closeComparison\(\)[\s\S]*?\n  \}/);
const loopSrc = fnBody(html, /  function loop\(\) \{[\s\S]*?\n  \}/);
const captureFrameSrc = fnBody(html, /  function captureFrame\(now\) \{[\s\S]*?\n  \}/);
const startCameraSrc = fnBody(html, /  async function startCamera\(\) \{[\s\S]*?\n  \}/);

// ---------------------------------------------------------------
console.log("\n[STEP25] A. 比較開始(静的確認)");
// ---------------------------------------------------------------

check("openComparison(): A/B読み込みより前にライブ処理を停止する(suspendLiveForComparison)", () => {
  const iSuspend = openComparisonSrc.indexOf("suspendLiveForComparison()");
  const iLoad = openComparisonSrc.indexOf("loadShotIntoChannel(");
  assert.ok(iSuspend >= 0, "suspendLiveForComparison()を呼んでいない");
  assert.ok(iLoad > iSuspend, "ライブ停止がA/B読み込みより後になっている");
});

check("suspendLiveForComparison(): ライブbufferをclearBuffer()で解放・クリアする", () => {
  const body = fnBody(html, /function suspendLiveForComparison\(\) \{[\s\S]*?\n  \}/);
  assert.ok(body.includes("clearBuffer()"));
  assert.ok(body.includes("cameraGeneration += 1"), "取得世代を無効化していない");
  assert.ok(body.includes("playback.goLive()"));
});

check("既存のclearBuffer()は全Bitmapをclose()し、配列を空にする", () => {
  const body = fnBody(html, /function clearBuffer\(\) \{[\s\S]*?\n  \}/);
  assert.ok(body.includes("f.bitmap.close()"));
  assert.ok(body.includes("frameBuffer.length = 0"));
});

check("カメラStreamは停止・再取得しない(比較関連コードにstop()/getUserMedia/startCamera/stopCameraが無い)", () => {
  const start = html.indexOf("let liveSuspendedForComparison");
  const end = html.indexOf("async function openShotReview(shot)");
  assert.ok(start > 0 && end > start);
  // コメントは除去してコード部分だけを見る
  const section = html.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ["getTracks", ".stop()", "getUserMedia", "startCamera", "stopCamera", "srcObject"].forEach((w) => {
    if (w === ".stop()") {
      // MediaStreamTrack.stop()を禁止。(MediaRecorderのstop等は比較区間には存在しない)
      assert.ok(!/track\.stop\(\)|getTracks\(\)/.test(section), "比較区間でtrackを停止している");
    } else {
      assert.ok(!section.includes(w), "比較区間に " + w + " が含まれている");
    }
  });
  assert.ok(!/startCamera\(/.test(openComparisonSrc) && !/startCamera\(/.test(closeComparisonSrc));
});

check("同一セッション中の保存(isSaving)中は比較を開始しない(保存対象フレームの保護)", () => {
  const iGuard = openComparisonSrc.indexOf("if (isSaving)");
  const iSuspend = openComparisonSrc.indexOf("suspendLiveForComparison()");
  assert.ok(iGuard >= 0 && iGuard < iSuspend, "isSavingガードがライブ停止より前に無い");
});

// ---------------------------------------------------------------
console.log("\n[STEP25] C. 比較中(ライブcapture停止・比較loopのみ)");
// ---------------------------------------------------------------

check("ライブloop(): 比較中はcaptureFrame()/renderFrame()を呼ばない", () => {
  assert.ok(/if \(running && !liveSuspendedForComparison\) \{\s*captureFrame\(now\);\s*renderFrame\(now\);/.test(loopSrc));
});

check("比較用rAFは1本のまま(comparisonLoopにrequestAnimationFrameは1箇所、A/B別ループ無し)", () => {
  const loopFn = fnBody(html, /function comparisonLoop\(now\) \{[\s\S]*?\n  \}/);
  assert.strictEqual((loopFn.match(/requestAnimationFrame\(/g) || []).length, 1);
  assert.ok(loopFn.includes('comparisonOverlay.style.display === "none"'));
  assert.ok(openComparisonSrc.includes("cancelAnimationFrame(comparisonRafId)"));
});

check("既存のA/B操作(Sync・再生・5秒・1F・スロー・マーキング)の関数が残っている", () => {
  [
    "function setComparisonSync(", "function setComparisonTime(", "function handleSyncedComparisonAction(",
    "function comparisonSyncSlowCheck(", "function comparisonSlowCheck(", "function setComparisonMarkingMode(",
    "function visibleComparisonMarkings(", "function advanceComparisonChannel(", "function drawComparisonChannelVisual(",
  ].forEach((f) => assert.ok(html.includes(f), f + " が消えている"));
  assert.ok(html.includes("Promise.all(["), "Promise.allの構造が維持されている");
  assert.ok(html.includes("loadShotIntoChannel(comparisonA, shotA, sessionId)"));
  assert.ok(html.includes("loadShotIntoChannel(comparisonB, shotB, sessionId)"));
});

// ---------------------------------------------------------------
console.log("\n[STEP25] B. 非同期(遅れて完成したBitmap)");
// ---------------------------------------------------------------

check("captureFrame()のthenは、世代が変わっていればbufferへ追加せずbmp.close()する(既存機構を利用)", () => {
  assert.ok(/if \(myGeneration !== cameraGeneration\) \{\s*bmp\.close\(\);\s*return;/.test(captureFrameSrc));
  const iGen = captureFrameSrc.indexOf("myGeneration !== cameraGeneration");
  const iInsert = captureFrameSrc.indexOf("insertSorted(");
  assert.ok(iGen >= 0 && iGen < iInsert, "世代チェックがinsertSortedより後にある");
});

check("startCamera()実行中(running=false)に比較を開いてもstreamが破棄されない(世代はrunning時のみ増やす)", () => {
  const body = fnBody(html, /function suspendLiveForComparison\(\) \{[\s\S]*?\n  \}/);
  assert.ok(/if \(running\) cameraGeneration \+= 1/.test(body));
  assert.ok(startCameraSrc.includes("myGeneration !== cameraGeneration"));
});

// ---- 実際のソースを取り出したスタブ実行 ----
function buildSandbox() {
  const start = html.indexOf("  let liveSuspendedForComparison = false;");
  const endMarker = "  /** チャンネルの再生位置だけを1フレーム分前進させる";
  const loadStart = html.indexOf("  async function loadShotIntoChannel(channel, shot, sessionId) {");
  const relStart = html.indexOf("  // STEP25: フレーム配列のImageBitmapを解放する");
  const relEnd = html.indexOf(endMarker);
  assert.ok(start > 0 && loadStart > start && relStart > loadStart && relEnd > relStart);
  // state/suspend/resume (start..loadStart前のコメント含む) と、load/closeFrames/stale/release (loadStart..relEnd)
  const resumeIdx = html.indexOf("  function resumeLiveAfterComparison()", start);
  const stateAndSuspend = html.slice(start, html.indexOf("\n  }", resumeIdx) + 4);
  const loadAndRelease = html.slice(loadStart, relEnd);
  const body = `
    "use strict";
    let running = true, cameraGeneration = 0, lastDisplayedFrameTime = 5, lastDisplayedTargetTime = 5, shownDelaySec = 9;
    const frameBuffer = [];
    const captureTimestamps = [1,2];
    const calls = [];
    function clearBuffer() { for (const f of frameBuffer) { try { f.bitmap.close(); } catch (e) {} } frameBuffer.length = 0; captureTimestamps.length = 0; calls.push("clearBuffer"); }
    const playback = { goLive() { calls.push("goLive"); } };
    const REVIEW_DELAY_SECONDS = 0.001, REVIEW_TIME_HEADROOM_MS = 1e7, DEFAULT_SLOW_RATE = 1/3, DEFAULT_SLOW_WINDOW_SEC = 5;
    function formatShotDate(ms) { return String(ms); }
    function comparisonNow(channel, realNow) { if (channel.clockBase === null) channel.clockBase = realNow; return REVIEW_TIME_HEADROOM_MS + (realNow - channel.clockBase); }
    function clampComparisonTime(channel, t) { return Math.max(0, Math.min(channel.durationMs, t)); }
    function setComparisonMarkingMode(channel, on) { channel.markingMode = on; }
    function renderComparisonRatePresets() {}
    function renderComparisonWindowPresets() {}
    function updateComparisonPosition() {}
    function redrawComparisonMarkings() {}
    function mkChannel(label) { return { label, titleEl: {}, canvas: {}, markOverlay: {}, playPauseBtn: {}, markings: [], frameBuffer: null, playback: null, shotId: null, durationMs: 0, clockBase: null }; }
    ${stateAndSuspend}
    ${loadAndRelease}
    return { calls, frameBuffer, captureTimestamps, mkChannel,
      get state() { return { running, cameraGeneration, liveSuspendedForComparison, comparisonSessionId, shownDelaySec }; },
      setRunning(v) { running = v; }, bumpSession() { return ++comparisonSessionId; }, getSession() { return comparisonSessionId; },
      suspendLiveForComparison, resumeLiveAfterComparison, loadShotIntoChannel, releaseComparisonChannel };
  `;
  return new Function("StorageEngine", "PlaybackEngine", "performance", body);
}
function makeFrames(n, label) {
  const frames = [];
  for (let i = 0; i < n; i++) frames.push({ time: i * 40, bitmap: { width: 640, height: 360, closed: false, close() { this.closed = true; }, label } });
  return frames;
}
function deferred() { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; }
function env(storage) {
  const make = buildSandbox();
  return make(storage, { PlaybackEngine }, { now: () => 123 }); // index.htmlはPlaybackEngine.PlaybackEngineとして参照する
}
const dummyStorage = { loadShotFrames: async () => [], loadShotMarkings: async () => [] };

check("suspend: ライブbufferの全Bitmapがclose()され、bufferが空になり、取得世代が進み、停止フラグが立つ", () => {
  const e = env(dummyStorage);
  const live = makeFrames(5, "live");
  live.forEach((f) => e.frameBuffer.push(f));
  const gen0 = e.state.cameraGeneration;
  e.suspendLiveForComparison();
  assert.strictEqual(e.frameBuffer.length, 0);
  assert.ok(live.every((f) => f.bitmap.closed), "ライブBitmapがcloseされていない");
  assert.strictEqual(e.state.cameraGeneration, gen0 + 1);
  assert.strictEqual(e.state.liveSuspendedForComparison, true);
  assert.ok(e.calls.includes("goLive"));
  assert.strictEqual(e.captureTimestamps.length, 0);
});

check("suspendを2回呼んでも二重処理しない(冪等)", () => {
  const e = env(dummyStorage);
  e.suspendLiveForComparison();
  const gen = e.state.cameraGeneration;
  e.suspendLiveForComparison();
  assert.strictEqual(e.state.cameraGeneration, gen);
});

check("running=false(startCamera実行中)なら世代を増やさない", () => {
  const e = env(dummyStorage);
  e.setRunning(false);
  e.suspendLiveForComparison();
  assert.strictEqual(e.state.cameraGeneration, 0);
});

check("世代機構の模擬: 比較開始前に開始されたcreateImageBitmapが後から完了しても、bufferに入らずcloseされる", () => {
  // captureFrame()のthen内ロジック(myGeneration !== cameraGeneration → close)を、実際の世代変化と組み合わせて確認
  const e = env(dummyStorage);
  const myGeneration = e.state.cameraGeneration; // createImageBitmap開始時に捕捉される世代
  e.suspendLiveForComparison(); // 比較開始
  const lateBitmap = { closed: false, close() { this.closed = true; } };
  // captureFrame()のthenと同じ判定
  if (myGeneration !== e.state.cameraGeneration) lateBitmap.close();
  else e.frameBuffer.push({ time: 1, bitmap: lateBitmap });
  assert.strictEqual(lateBitmap.closed, true);
  assert.strictEqual(e.frameBuffer.length, 0);
});

check("resume: 停止フラグが解除される(カメラstreamには触れない)", () => {
  const e = env(dummyStorage);
  e.suspendLiveForComparison();
  e.resumeLiveAfterComparison();
  assert.strictEqual(e.state.liveSuspendedForComparison, false);
});

check("正常系: A/B読み込みが完了するとチャンネルにBitmapが保持される", async () => {
  const framesA = makeFrames(10, "A"), framesB = makeFrames(12, "B");
  const storage = {
    loadShotFrames: async (id) => (id === "A" ? framesA : framesB),
    loadShotMarkings: async () => [],
  };
  const e = env(storage);
  const sid = e.bumpSession();
  const a = e.mkChannel("A"), b = e.mkChannel("B");
  await Promise.all([e.loadShotIntoChannel(a, { id: "A", createdAt: 1, durationMs: 400 }, sid), e.loadShotIntoChannel(b, { id: "B", createdAt: 2, durationMs: 480 }, sid)]);
  assert.strictEqual(a.frameBuffer, framesA);
  assert.strictEqual(b.frameBuffer, framesB);
  assert.ok(a.playback && b.playback);
  assert.ok(framesA.every((f) => !f.bitmap.closed) && framesB.every((f) => !f.bitmap.closed));
});

check("エラー(A失敗)後に遅れてBが完了しても、BのBitmapはチャンネルに残らずcloseされる", async () => {
  const framesB = makeFrames(20, "B");
  const dB = deferred();
  const storage = {
    loadShotFrames: (id) => (id === "A" ? Promise.reject(new Error("A failed")) : dB.p),
    loadShotMarkings: async () => [],
  };
  const e = env(storage);
  const sid = e.bumpSession();
  const a = e.mkChannel("A"), b = e.mkChannel("B");
  const pA = e.loadShotIntoChannel(a, { id: "A", createdAt: 1, durationMs: 400 }, sid);
  const pB = e.loadShotIntoChannel(b, { id: "B", createdAt: 2, durationMs: 480 }, sid);
  let firstErr = null;
  try { await Promise.all([pA, pB]); } catch (err) { firstErr = err; }
  assert.ok(firstErr && !firstErr.comparisonStale, "最初のrejectはAの実エラーのはず");
  // openComparison()のcatchと同じ後始末
  e.bumpSession();
  e.releaseComparisonChannel(a);
  e.releaseComparisonChannel(b);
  assert.strictEqual(b.frameBuffer, null);
  // その後でBの読み込みが完了する
  dB.resolve(framesB);
  let bErr = null;
  try { await pB; } catch (err) { bErr = err; }
  assert.ok(bErr && bErr.comparisonStale === true);
  assert.ok(framesB.every((f) => f.bitmap.closed), "遅れて完了したBitmapがcloseされていない");
  assert.strictEqual(b.frameBuffer, null, "遅れて完了したBitmapがチャンネルに保持されている");
  assert.strictEqual(b.playback, null);
});

check("読み込み中に比較を閉じた場合(closeComparison相当)、完了したBitmapがすべてcloseされる", async () => {
  const framesA = makeFrames(8, "A"), framesB = makeFrames(8, "B");
  const dA = deferred(), dB = deferred();
  const storage = { loadShotFrames: (id) => (id === "A" ? dA.p : dB.p), loadShotMarkings: async () => [] };
  const e = env(storage);
  const sid = e.bumpSession();
  const a = e.mkChannel("A"), b = e.mkChannel("B");
  const pA = e.loadShotIntoChannel(a, { id: "A", createdAt: 1, durationMs: 300 }, sid);
  const pB = e.loadShotIntoChannel(b, { id: "B", createdAt: 2, durationMs: 300 }, sid);
  e.bumpSession(); // closeComparison()
  e.releaseComparisonChannel(a); e.releaseComparisonChannel(b);
  dA.resolve(framesA); dB.resolve(framesB);
  const results = await Promise.allSettled([pA, pB]);
  assert.ok(results.every((r) => r.status === "rejected" && r.reason.comparisonStale));
  assert.ok(framesA.every((f) => f.bitmap.closed) && framesB.every((f) => f.bitmap.closed));
  assert.strictEqual(a.frameBuffer, null);
  assert.strictEqual(b.frameBuffer, null);
});

check("フレームのloadが完了した後、マーキング読み込み中にセッションが変わっても、Bitmapがcloseされる", async () => {
  const framesA = makeFrames(6, "A");
  const dM = deferred();
  const storage = { loadShotFrames: async () => framesA, loadShotMarkings: () => dM.p };
  const e = env(storage);
  const sid = e.bumpSession();
  const a = e.mkChannel("A");
  const pA = e.loadShotIntoChannel(a, { id: "A", createdAt: 1, durationMs: 200 }, sid);
  await new Promise((r) => setTimeout(r, 0));
  e.bumpSession();
  dM.resolve([]);
  let err = null;
  try { await pA; } catch (x) { err = x; }
  assert.ok(err && err.comparisonStale);
  assert.ok(framesA.every((f) => f.bitmap.closed));
  assert.strictEqual(a.frameBuffer, null);
});

// ---------------------------------------------------------------
console.log("\n[STEP25] D/E. 比較終了・エラー時のライブ再開、Bitmap解放");
// ---------------------------------------------------------------

check("closeComparison(): A/Bを解放し、ライブ処理を再開する(resumeLiveAfterComparison)", () => {
  assert.ok(closeComparisonSrc.includes("releaseComparisonChannel(comparisonA)"));
  assert.ok(closeComparisonSrc.includes("releaseComparisonChannel(comparisonB)"));
  assert.ok(closeComparisonSrc.includes("resumeLiveAfterComparison()"));
  assert.ok(closeComparisonSrc.includes("comparisonSessionId++"));
  assert.ok(closeComparisonSrc.includes("cancelAnimationFrame(comparisonRafId)"));
  assert.ok(!closeComparisonSrc.includes("shotReviewOverlay"));
});

check("releaseComparisonChannel()は全Bitmapをclose()する", () => {
  const e = env(dummyStorage);
  const ch = e.mkChannel("A");
  ch.frameBuffer = makeFrames(7, "A");
  const keep = ch.frameBuffer;
  e.releaseComparisonChannel(ch);
  assert.ok(keep.every((f) => f.bitmap.closed));
  assert.strictEqual(ch.frameBuffer, null);
});

check("openComparison()の読み込み失敗経路: セッション無効化→A/B解放→overlayを閉じる→ライブ再開", () => {
  const catchIdx = openComparisonSrc.indexOf("} catch (err) {");
  const tail = openComparisonSrc.slice(catchIdx);
  const iStale = tail.indexOf("err.comparisonStale");
  const iBump = tail.indexOf("comparisonSessionId++");
  const iRelA = tail.indexOf("releaseComparisonChannel(comparisonA)");
  const iHide = tail.indexOf('comparisonOverlay.style.display = "none"');
  const iResume = tail.indexOf("resumeLiveAfterComparison()");
  assert.ok(iStale >= 0 && iBump > iStale && iRelA > iBump && iHide > iRelA && iResume > iHide);
});

check("ライブ再開後、loop()の条件によりcaptureFrame()が再び呼ばれ、bufferは新しいフレームから再構築される(世代は比較開始時のまま有効)", () => {
  const e = env(dummyStorage);
  e.suspendLiveForComparison();
  e.resumeLiveAfterComparison();
  // 再開後の新しいcaptureFrame()は、その時点のcameraGeneration(=比較開始時に増えた値)を捕捉するため一致する
  const gen = e.state.cameraGeneration;
  e.frameBuffer.push({ time: 100, bitmap: { close() {} } });
  assert.strictEqual(e.frameBuffer.length, 1);
  assert.strictEqual(gen, 1);
});

// ---------------------------------------------------------------
console.log("\n[STEP25] 変更範囲・既存仕様の維持");
// ---------------------------------------------------------------

check("比較区間に書き込み系Storage API・StorageEngineの変更が無い", () => {
  const start = html.indexOf("let liveSuspendedForComparison");
  const end = html.indexOf("async function openShotReview(shot)");
  const section = html.slice(start, end);
  ["StorageEngine.saveShot", "StorageEngine.saveMarking", "StorageEngine.deleteShot", "StorageEngine.deleteMarking", "StorageEngine.deleteShotMarkings"].forEach((w) =>
    assert.ok(!section.includes(w), w)
  );
  assert.ok(section.includes("StorageEngine.loadShotFrames("));
});

check("60秒制限・解像度変更・フレーム削減が入っていない(定数が従来のまま)", () => {
  assert.ok(html.includes("const BUFFER_SCALE_WIDTH = 640;"));
  assert.ok(html.includes("const MAX_BUFFER_RETENTION_SEC = 80;"));
  assert.ok(html.includes("const SAVE_RANGE_OPTIONS = [10, 30, 60];"));
  assert.ok(html.includes("const DEFAULT_SAVE_RANGE_SEC = 60;"));
});

check("Engine4ファイル・sw.js・manifest.jsonが存在する(内容は本STEPで変更しない)", () => {
  ["bufferEngine.js", "playbackEngine.js", "storageEngine.js", "coordinateEngine.js", "sw.js", "manifest.json"].forEach((f) =>
    assert.ok(fs.existsSync(path.join(__dirname, f)), f)
  );
});

pending.then(() => {
  console.log("\n" + passCount + " 件成功" + (process.exitCode ? " / 失敗あり" : " / 全て成功"));
  console.log(
    "\n[注記] 以下はNode.jsでは検証できず、実機(iPad Safari)確認が必要です:\n" +
      "  - 60秒×2本比較での黒画面→再読み込みが再現しないこと\n" +
      "  - 比較終了後のライブ映像復帰、保存可能時間の再構築\n" +
      "  - 比較開始時のライブ停止がカメラ権限の再要求を招かないこと\n"
  );
});
