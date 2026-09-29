// test_step21a.js
//
// STEP21-A(60秒保存・実機負荷検証)の静的確認テスト。
// 目的は「本体アプリ・4エンジン・sw.js・manifest.jsonを一切変更していないこと」と、
// 新規追加した検証専用ページ(verify_60s_load.html)が、
//   ・本番と同じStorageEngine/BufferEngineの公開APIのみを使っていること
//   ・テストShotの識別(testTag)と、それに基づく削除の絞り込みが実装されていること
//   ・通常Shotを巻き込む一括削除処理が存在しないこと
//   ・60秒化そのものを本体へ実装していないこと(SAVE_RANGE_OPTIONS/BUFFER_RETENTION_SEC無変更)
//   ・video export(MediaRecorder等)をこのページに実装していないこと(本体アプリ側で行う方針のため)
// を静的に確認する。IndexedDBの実書き込み・カメラ取り込み・実際のfps/メモリ挙動は
// Node.jsでは検証できないため対象外(iPad実機確認が必要)。
//
// 既存テスト(test_coordinateEngine.js / test_step11.js〜test_step17.js、
// 存在すればtest_step20系)は本ファイルの対象外。別途そのまま実行し、回帰がないことを確認すること。

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

const ROOT = __dirname;
const indexHtmlPath = path.join(ROOT, "index.html");
const storageEnginePath = path.join(ROOT, "storageEngine.js");
const swPath = path.join(ROOT, "sw.js");
const manifestPath = path.join(ROOT, "manifest.json");
const verifyPagePath = path.join(ROOT, "verify_60s_load.html");

const indexHtmlSrc = fs.readFileSync(indexHtmlPath, "utf8");
const storageEngineSrc = fs.readFileSync(storageEnginePath, "utf8");
const swSrc = fs.readFileSync(swPath, "utf8");
const manifestSrc = fs.readFileSync(manifestPath, "utf8");

console.log("\n[STEP21-A] 本体・4エンジン・PWA関連ファイルが無変更であることの静的確認");

check("verify_60s_load.htmlが存在する", () => {
  assert.ok(fs.existsSync(verifyPagePath), "verify_60s_load.htmlが見つからない");
});

check("index.html: SAVE_RANGE_OPTIONSがSLOW_WINDOW_OPTIONSを共用したまま(60秒化を本体に実装していない)", () => {
  assert.ok(indexHtmlSrc.includes("const SLOW_WINDOW_OPTIONS = [3, 5, 10];"), "SLOW_WINDOW_OPTIONSが変更されている");
  assert.ok(
    indexHtmlSrc.includes("const SAVE_RANGE_OPTIONS = SLOW_WINDOW_OPTIONS;"),
    "SAVE_RANGE_OPTIONSがSLOW_WINDOW_OPTIONSの共用でなくなっている(60秒等の選択肢が本体に追加された可能性)"
  );
});

check("index.html: BUFFER_RETENTION_SECの式が変更されていない(45秒のまま)", () => {
  assert.ok(
    indexHtmlSrc.includes("const BUFFER_RETENTION_SEC = MAX_DELAY_SEC + MAX_SLOW_WINDOW_SEC + 5;"),
    "BUFFER_RETENTION_SECの計算式が変更されている(60秒化が本体に反映された可能性)"
  );
  assert.ok(indexHtmlSrc.includes("const MAX_DELAY_SEC = 30;"));
  assert.ok(indexHtmlSrc.includes("const MAX_SLOW_WINDOW_SEC = 10;"));
});

check("index.html: DEFAULT_SAVE_RANGE_SECが変更されていない", () => {
  assert.ok(indexHtmlSrc.includes("const DEFAULT_SAVE_RANGE_SEC = 10;"));
});

check("storageEngine.js: DB_NAME/DB_VERSIONが変更されていない(スキーマ変更なし)", () => {
  assert.ok(storageEngineSrc.includes('const DB_NAME = "kyudoShotStorage";'));
  assert.ok(storageEngineSrc.includes("const DB_VERSION = 2;"));
});

check("sw.jsのAPP_SHELL_FILESにverify_60s_load.htmlが含まれていない(検証ページをキャッシュ対象にしない)", () => {
  const match = swSrc.match(/APP_SHELL_FILES\s*=\s*\[([\s\S]*?)\];/);
  assert.ok(match, "APP_SHELL_FILESの定義が見つからない");
  assert.ok(!match[1].includes("verify_60s_load"), "verify_60s_load.htmlがsw.jsのキャッシュ対象に含まれている");
});

check("manifest.jsonがverify_60s_load.htmlに一切言及していない", () => {
  assert.ok(!manifestSrc.includes("verify_60s_load"), "manifest.jsonが検証ページに言及している");
});

check("4エンジンファイルが存在する(内容の不変性はtest_coordinateEngine.js/test_step11〜17側で別途確認)", () => {
  ["bufferEngine.js", "playbackEngine.js", "coordinateEngine.js", "storageEngine.js"].forEach((f) => {
    assert.ok(fs.existsSync(path.join(ROOT, f)), f + "が見つからない");
  });
});

console.log("\n[STEP21-A] verify_60s_load.htmlの設計確認");

const verifySrc = fs.existsSync(verifyPagePath) ? fs.readFileSync(verifyPagePath, "utf8") : "";

check("検証ページはbufferEngine.js/storageEngine.jsのみを読み込み、本体index.html等を参照していない", () => {
  assert.ok(verifySrc.includes('<script src="bufferEngine.js"></script>'));
  assert.ok(verifySrc.includes('<script src="storageEngine.js"></script>'));
  assert.ok(!verifySrc.includes('src="index.html"'));
  assert.ok(!verifySrc.includes('src="playbackEngine.js"'), "本テストの目的にplaybackEngineは不要なはず(意図しない依存追加の確認)");
});

check("検証ページはDB名として本番と同じ'kyudoShotStorage'のみを使い、別DBを新設していない", () => {
  const opens = [...verifySrc.matchAll(/indexedDB\.open\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(opens.length > 0, "indexedDB.open()の呼び出しが見つからない");
  opens.forEach((name) => {
    assert.strictEqual(name, "kyudoShotStorage", "本番と異なるDB名: " + name);
  });
});

check("テストShotの識別子(STEP21A_TEST_)が実装されている", () => {
  assert.ok(verifySrc.includes('TEST_TAG_PREFIX = "STEP21A_TEST_"'));
});

check("testTagはstoreEngine.jsの必須フィールドを上書きしない追加フィールドとして書き込まれている", () => {
  const fnMatch = verifySrc.match(/function tagShotAsTest[\s\S]*?\n  \}/);
  assert.ok(fnMatch, "tagShotAsTest()が見つからない");
  const body = fnMatch[0];
  assert.ok(body.includes("rec.testTag = tag"), "testTagフィールドの追加が見つからない");
  ["rec.id =", "rec.createdAt =", "rec.durationMs =", "rec.delaySecondsAtCapture =", "rec.frameCount ="].forEach((forbidden) => {
    assert.ok(!body.includes(forbidden), "必須フィールドを書き換えている: " + forbidden);
  });
});

check("テストShot一覧はtestTagで絞り込んでいる(通常Shotを含めない)", () => {
  const fnMatch = verifySrc.match(/async function listTestShots\(\)[\s\S]*?\n  \}/);
  assert.ok(fnMatch, "listTestShots()が見つからない");
  assert.ok(fnMatch[0].includes("TEST_TAG_PREFIX"), "TEST_TAG_PREFIXによる絞り込みが見つからない");
  assert.ok(fnMatch[0].includes("StorageEngine.listShots()"), "StorageEngine.listShots()を使っていない");
});

check("「テストShotをすべて削除」はtestTagで絞り込んだ配列のみをStorageEngine.deleteShot()に渡している(全件一括削除ではない)", () => {
  const fnMatch = verifySrc.match(/deleteTestShotsBtn"\)\.addEventListener\("click",[\s\S]*?\n  \}\);/);
  assert.ok(fnMatch, "deleteTestShotsBtnのハンドラが見つからない");
  const body = fnMatch[0];
  assert.ok(body.includes("listTestShots()"), "listTestShots()(testTag絞り込み済み)を使っていない");
  assert.ok(body.includes("StorageEngine.deleteShot(s.id)"), "公式のStorageEngine.deleteShot()を使っていない");
  assert.ok(!body.includes("StorageEngine.listShots()"), "絞り込み前の全件一覧を直接削除ループに使っている可能性");
});

check("createdAtだけを根拠にした一括削除ロジックが存在しない", () => {
  assert.ok(!/createdAt\s*<[^;]*deleteShot/.test(verifySrc), "createdAtだけを条件にした削除処理が見つかる");
  assert.ok(!verifySrc.includes(".clear()"), "オブジェクトストアの.clear()(全件削除)が使われている");
});

check("保存はStorageEngine.saveShot()の公開APIのみを使い、独自のIndexedDB書き込み(フレーム本体)を行っていない", () => {
  assert.ok(verifySrc.includes("StorageEngine.saveShot("));
  assert.ok(!verifySrc.includes('objectStore("shotFrames"'), "shotFramesストアへ直接書き込んでいる(saveShot()を迂回している)");
});

check("読み込みはStorageEngine.loadShotFrames()を使い、読み込んだImageBitmapを解放している(メモリリーク防止)", () => {
  assert.ok(verifySrc.includes("StorageEngine.loadShotFrames("));
  assert.ok(/bitmap\.close\(\)/.test(verifySrc));
});

check("並列読み込みはPromise.allで2件同時に行っている(比較画面と同じ負荷条件を再現)", () => {
  const fnMatch = verifySrc.match(/loadParallelBtn"\)\.addEventListener\("click",[\s\S]*?\n  \}\);/);
  assert.ok(fnMatch, "loadParallelBtnのハンドラが見つからない");
  assert.ok(fnMatch[0].includes("Promise.all("));
});

check("動画保存(MediaRecorder等)はこのページに実装していない(本体アプリ側で確認する方針)", () => {
  assert.ok(!verifySrc.includes("MediaRecorder"), "MediaRecorderがこのページに実装されている");
  assert.ok(!verifySrc.includes("captureStream"), "captureStreamがこのページに実装されている");
  assert.ok(!verifySrc.includes("navigator.share"), "navigator.shareがこのページに実装されている");
});

check("ストレージ使用量表示はRAM測定ではない旨が明記されている", () => {
  assert.ok(verifySrc.includes("RAM"), "RAMに関する注記が見つからない");
  assert.ok(verifySrc.includes("navigator.storage.estimate"), "navigator.storage.estimate()の使用が見つからない");
});

check("保持テストの各段階(15/30/45/60秒)でストレージ使用量を取得している", () => {
  assert.ok(verifySrc.includes("getStorageEstimate()"));
  const fnMatch = verifySrc.match(/async function runHoldStage[\s\S]*?\n  \}/);
  assert.ok(fnMatch, "runHoldStage()が見つからない");
  assert.ok(fnMatch[0].includes("getStorageEstimate()"), "保持テスト完了時にストレージ使用量を取得していない");
});

check("75秒・90秒ボタンは初期状態でdisabledであり、確認チェックボックスでのみ有効化される", () => {
  assert.ok(/data-hold="75"[^>]*disabled/.test(verifySrc), "75秒ボタンが初期状態でdisabledになっていない");
  assert.ok(/data-hold="90"[^>]*disabled/.test(verifySrc), "90秒ボタンが初期状態でdisabledになっていない");
  assert.ok(verifySrc.includes('allow7590'), "確認チェックボックスの仕組みが見つからない");
});

check("クラッシュ検知(直前に実行中だったステージの記録・復元)が実装されている", () => {
  assert.ok(verifySrc.includes("STAGE_KEY"), "ステージ記録用のキーが見つからない");
  assert.ok(verifySrc.includes("markStageStart"), "ステージ開始記録の仕組みが見つからない");
  assert.ok(verifySrc.includes("checkResumeState"), "再開時の状態確認処理が見つからない");
  assert.ok(verifySrc.includes("resumeBox"), "前回中断の表示領域が見つからない");
});

check("本体index.html側のcaptureFrame()と同じスロットル方式(一定間隔補正なしのnow代入)を踏襲している", () => {
  assert.ok(
    verifySrc.includes("if (now - lastCaptureTime < CAPTURE_INTERVAL_MS) return;") &&
      verifySrc.includes("lastCaptureTime = now;"),
    "本体と異なる取り込みロジックになっている可能性(fps測定条件が本体と一致しない)"
  );
});

console.log("\n" + passCount + " 件成功" + (process.exitCode ? " / 失敗あり" : " / 全て成功"));
console.log(
  "\n[注記] 以下はNode.jsでは検証できず、iPad実機確認が必要です:\n" +
    "  - 実カメラでの実効fps・60秒相当フレーム数の実測\n" +
    "  - 60秒保持中のSafariの安定性(映像停止・タブクラッシュの有無)\n" +
    "  - StorageEngine.saveShot()の実際の所要時間・IndexedDB使用量の増分\n" +
    "  - 1件/2件並列でのloadShotFrames()の実際の所要時間・失敗有無\n" +
    "  - 本体アプリでの60秒Shotのレビュー・A/B比較・動画保存(Share Sheet/写真保存)\n"
);
