import "server-only";
import { spawn } from "node:child_process";
import { accessSync, chmodSync, constants, copyFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

let cachedPath: string | null = null;

// Linux 版執行檔靠 postinstall 腳本加上執行權限，但 npm 可能擋掉安裝腳本，
// 部署環境的 node_modules 又是唯讀的：沒有執行權限時複製一份到 /tmp 再加權限
function ffmpegPath() {
  if (cachedPath) return cachedPath;
  const original = ffmpegInstaller.path;
  if (process.platform === "win32") return (cachedPath = original);
  try {
    accessSync(original, constants.X_OK);
    return (cachedPath = original);
  } catch {
    const copy = path.join(tmpdir(), "ffmpeg-bin");
    if (!existsSync(copy)) copyFileSync(original, copy);
    chmodSync(copy, 0o755);
    return (cachedPath = copy);
  }
}

/** 執行 ffmpeg，回傳 stderr（ffmpeg 的資訊輸出都在 stderr） */
function runFfmpeg(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath(), ["-hide_banner", "-nostdin", ...args]);
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
      // 只保留尾端，避免長音檔的進度輸出吃光記憶體
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg 結束代碼 ${code}：${stderr.slice(-500)}`));
    });
  });
}

/** 音檔長度（秒）。讀不到時拋錯，通常代表不是有效的音檔 */
export async function probeDurationSeconds(file: string): Promise<number> {
  // -t 0 輸出到 null：只讀檔頭資訊，不實際解碼整個檔案
  let stderr: string;
  try {
    stderr = await runFfmpeg(["-i", file, "-t", "0", "-f", "null", "-"]);
  } catch (err) {
    console.error("ffmpeg probe failed:", err);
    throw new Error("無法讀取音檔，檔案可能損毀或不是音訊檔");
  }
  const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!m) throw new Error("無法讀取音檔長度，檔案可能損毀或不是音訊檔");
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export type Silence = { start: number; end: number };

/** 找出整段音檔中的靜音區間，用來挑選切段位置 */
export async function detectSilences(file: string): Promise<Silence[]> {
  const stderr = await runFfmpeg(["-i", file, "-af", "silencedetect=noise=-35dB:d=0.5", "-f", "null", "-"]);
  const silences: Silence[] = [];
  let start: number | null = null;
  for (const line of stderr.split("\n")) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) start = Math.max(0, Number(s[1]));
    const e = line.match(/silence_end:\s*([\d.]+)/);
    if (e && start != null) {
      silences.push({ start, end: Number(e[1]) });
      start = null;
    }
  }
  return silences;
}

/**
 * 規劃切段：每段不超過 maxSeconds，切點優先落在目標位置前 searchWindow 秒內最接近的靜音，
 * 找不到靜音才硬切。回傳每段的 [start, end]（秒）
 */
export function planChunks(
  duration: number,
  silences: Silence[],
  maxSeconds: number,
  searchWindow = 90,
): { start: number; end: number }[] {
  const chunks: { start: number; end: number }[] = [];
  let pos = 0;
  while (duration - pos > maxSeconds) {
    const target = pos + maxSeconds;
    const candidates = silences
      .map((s) => (s.start + s.end) / 2)
      .filter((mid) => mid > target - searchWindow && mid <= target);
    const cut = candidates.length > 0 ? Math.max(...candidates) : target;
    chunks.push({ start: pos, end: cut });
    pos = cut;
  }
  chunks.push({ start: pos, end: duration });
  return chunks;
}

// 語音辨識用：16kHz 單聲道 mp3，20 分鐘約 7MB，遠低於 OpenAI 25MB 上限
const SPEECH_ENCODE = ["-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k"];

/** 擷取 [start, start+duration) 秒並轉成語音辨識用 mp3 */
export async function encodeSegment(input: string, start: number, duration: number, output: string) {
  await runFfmpeg(["-y", "-ss", start.toFixed(3), "-i", input, "-t", duration.toFixed(3), ...SPEECH_ENCODE, output]);
}

/** 擷取一小段音訊，回傳 data URL（給 known_speaker_references 用） */
export async function clipAsDataUrl(input: string, start: number, duration: number, workDir: string) {
  const out = path.join(workDir, `ref-${start.toFixed(2)}.mp3`);
  await encodeSegment(input, start, duration, out);
  const buf = await readFile(out);
  return `data:audio/mpeg;base64,${buf.toString("base64")}`;
}
