import "server-only";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { get, head, put } from "@vercel/blob";
import { Types } from "mongoose";
import OpenAI, { toFile } from "openai";
import type { TranscriptionDiarized } from "openai/resources/audio/transcriptions";
import * as OpenCC from "opencc-js/cn2t";
import { BLOB_ACCESS, audioContentType, deleteBlobQuietly } from "@/lib/blob";
import { clipAsDataUrl, detectSilences, encodeSegment, planChunks, probeDurationSeconds } from "@/lib/ffmpeg";
import { toMeetingDetail, type MeetingDetail, type TranscriptSegment } from "@/lib/meeting-dto";
import { connectDB } from "@/lib/mongodb";
import { SUMMARY_MODEL, summarizeTranscript, type MeetingMinutes } from "@/lib/summarize";
import { MAX_AUDIO_SECONDS, MAX_UPLOAD_BYTES, userAudioPrefix } from "@/lib/upload-config";
import { MeetingModel } from "@/models/Meeting";

// 流程：prepareMeeting（切段）→ transcribeChunk（第 1 段，再其餘各段）→ finalizeMeeting（合併 + AI 整理）
// 每一步都是獨立請求，避免長錄音超過單一請求的執行時間上限，失敗也能從中斷處續跑

// 會議需要分辨講者，所以用有 diarization 的模型（單次上限 1400 秒）
export const TRANSCRIBE_MODEL = "gpt-4o-transcribe-diarize";
// 每段上限 6 分鐘。模型本身單次上限是 1400 秒，但實測轉錄很慢：20 分鐘一段要 306 秒、
// 8 分鐘一段要 166–176 秒，都太接近部署平台單一請求 300 秒的上限，所以切得更短留足餘裕
const CHUNK_MAX_SECONDS = 6 * 60;
// API 最多接受 4 位已知講者
const MAX_KNOWN_SPEAKERS = 4;
// 後續各段新出現、無法對應到已知講者的標籤，先用這個前綴暫存，finalize 時再統一編號
const UNMATCHED_PREFIX = "?";

// 模型常輸出簡體中文，且 diarize 模型不支援 prompt，改在這裡轉成台灣正體。
// 只轉字形不轉用詞（不用 "twp"），避免把講者原話的詞彙替換掉
const toTaiwanese = OpenCC.Converter({ from: "cn", to: "tw" });

/** 可以直接顯示給使用者的錯誤，status 對應 HTTP 狀態碼 */
export class PipelineError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function openaiClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new PipelineError("伺服器未設定 OPENAI_API_KEY", 500);
  return new OpenAI({ apiKey });
}

async function downloadBlob(url: string): Promise<ReadableStream<Uint8Array>> {
  const blob = await get(url, { access: BLOB_ACCESS });
  if (!blob?.stream) throw new PipelineError("找不到音檔", 404);
  return blob.stream;
}

async function withWorkDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "meeting-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---------- 第一步：驗證上傳的原始檔、切段、建立會議紀錄 ----------

export async function prepareMeeting(
  userId: string,
  input: { blobUrl: string; fileName: string },
): Promise<{ meetingId: string; totalChunks: number; durationSeconds: number }> {
  // 檔案是瀏覽器直接傳到 Blob 的，網址由前端提供，必須確認真的是這位使用者上傳的
  const meta = await head(input.blobUrl).catch(() => null);
  if (!meta) throw new PipelineError("找不到上傳的錄音檔，請重新上傳", 400);
  if (!meta.pathname.startsWith(userAudioPrefix(userId)) || meta.pathname.includes("/chunks/")) {
    throw new PipelineError("無效的錄音檔", 403);
  }
  if (meta.size > MAX_UPLOAD_BYTES) {
    await deleteBlobQuietly(meta.url);
    throw new PipelineError(`錄音檔超過 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB 上限`, 413);
  }

  await connectDB();
  if (await MeetingModel.exists({ userId, "audio.url": meta.url })) {
    throw new PipelineError("這個錄音檔已經建立過會議紀錄", 409);
  }

  const meetingId = new Types.ObjectId();
  const chunkUrls: string[] = [];

  try {
    return await withWorkDir(async (dir) => {
      const ext = path.extname(meta.pathname) || ".audio";
      const original = path.join(dir, `original${ext}`);
      await pipeline(
        Readable.fromWeb((await downloadBlob(meta.url)) as NodeReadableStream),
        createWriteStream(original),
      );

      const duration = await probeDurationSeconds(original);
      if (duration < 1) throw new PipelineError("錄音長度太短", 400);
      if (duration > MAX_AUDIO_SECONDS) {
        throw new PipelineError(`錄音長度超過 ${MAX_AUDIO_SECONDS / 3600} 小時上限`, 413);
      }

      const silences = duration > CHUNK_MAX_SECONDS ? await detectSilences(original) : [];
      const plan = planChunks(duration, silences, CHUNK_MAX_SECONDS);

      const chunks = [];
      for (const [i, c] of plan.entries()) {
        const out = path.join(dir, `chunk-${i}.mp3`);
        await encodeSegment(original, c.start, c.end - c.start, out);
        const blob = await put(`${userAudioPrefix(userId)}chunks/${meetingId}/${i}.mp3`, await readFile(out), {
          access: BLOB_ACCESS,
          addRandomSuffix: true,
          contentType: "audio/mpeg",
        });
        chunkUrls.push(blob.url);
        chunks.push({ startMs: Math.round(c.start * 1000), endMs: Math.round(c.end * 1000), blobUrl: blob.url });
      }

      await MeetingModel.create({
        _id: meetingId,
        userId,
        title: input.fileName.replace(/\.[^.]+$/, "") || "未命名會議",
        durationSeconds: duration,
        source: { kind: "upload", fileName: input.fileName, mimeType: meta.contentType },
        audio: {
          url: meta.url,
          pathname: meta.pathname,
          size: meta.size,
          contentType: audioContentType(meta.pathname, meta.contentType),
        },
        status: "transcribing",
        processing: { chunks },
      });

      return { meetingId: String(meetingId), totalChunks: chunks.length, durationSeconds: duration };
    });
  } catch (err) {
    // 沒有成功建立紀錄：清掉這次產生的分段檔與原始檔，避免孤兒檔案
    await Promise.all([...chunkUrls, meta.url].map(deleteBlobQuietly));
    if (err instanceof PipelineError) throw err;
    console.error("prepareMeeting failed:", err);
    throw new PipelineError(
      err instanceof Error && err.message.startsWith("無法讀取音檔") ? err.message : "錄音檔處理失敗，請稍後再試",
      500,
    );
  }
}

// ---------- 第二步：轉錄單一段 ----------

type RawSegment = { speaker: string; start: number; end: number; text: string };

// 從第一段挑出講話最多的幾位講者，各擷取一段 2–10 秒的聲音樣本（API 規定的長度）
function pickReferenceClips(segments: RawSegment[]) {
  const talkTime = new Map<string, number>();
  for (const s of segments) talkTime.set(s.speaker, (talkTime.get(s.speaker) ?? 0) + (s.end - s.start));
  const speakers = [...talkTime.entries()].sort((a, b) => b[1] - a[1]).map(([sp]) => sp);

  const picks: { speaker: string; start: number; duration: number }[] = [];
  for (const speaker of speakers) {
    if (picks.length >= MAX_KNOWN_SPEAKERS) break;
    const own = segments.filter((s) => s.speaker === speaker);
    // 優先選 3–10 秒中最長的一段；否則從較長的段落中間擷取 8 秒
    const fit = own
      .filter((s) => s.end - s.start >= 3 && s.end - s.start <= 10)
      .sort((a, b) => b.end - b.start - (a.end - a.start))[0];
    if (fit) {
      picks.push({ speaker, start: fit.start, duration: fit.end - fit.start });
      continue;
    }
    const long = own.find((s) => s.end - s.start > 10);
    if (long) picks.push({ speaker, start: long.start + 1, duration: 8 });
    // 只有很短發言的講者無法提供樣本，後續段落會被視為新講者
  }
  return picks;
}

export async function transcribeChunk(userId: string, meetingId: string, index: number): Promise<void> {
  await connectDB();
  const doc = await MeetingModel.findOne({ _id: meetingId, userId }).select("status processing").lean();
  if (!doc) throw new PipelineError("找不到這筆會議紀錄", 404);
  const chunks = doc.processing?.chunks ?? [];
  const chunk = chunks[index];
  if (doc.status !== "transcribing" || !chunk) throw new PipelineError("這段不需要轉錄", 409);
  if (chunk.status === "done") return; // 重複呼叫（例如重試）直接視為完成
  if (index > 0 && chunks[0].status !== "done") {
    throw new PipelineError("需要先完成第 1 段", 409);
  }

  const refs = index > 0 ? (doc.processing?.speakerRefs ?? []) : [];
  const refByName = new Map(refs.map((r) => [r.name, r.label]));

  try {
    const audio = Buffer.from(await new Response(await downloadBlob(chunk.blobUrl)).arrayBuffer());

    // SDK 的型別沒有 diarized_json 專屬 overload，回傳值需自行轉型
    const result = (await openaiClient().audio.transcriptions.create({
      file: await toFile(audio, `chunk-${index}.mp3`, { type: "audio/mpeg" }),
      model: TRANSCRIBE_MODEL,
      response_format: "diarized_json",
      chunking_strategy: "auto", // 超過 30 秒的音檔必填
      ...(refs.length > 0 && {
        known_speaker_names: refs.map((r) => r.name),
        known_speaker_references: refs.map((r) => r.dataUrl),
      }),
    })) as unknown as TranscriptionDiarized;

    const raw: RawSegment[] = result.segments.map((s) => ({
      speaker: s.speaker,
      start: s.start,
      end: s.end,
      text: toTaiwanese(s.text.trim()),
    }));

    // 第一段的標籤（A、B…）就是最終標籤；後續段落對應回已知講者，對應不到的先暫存
    const label = (speaker: string) =>
      index === 0 ? speaker : (refByName.get(speaker) ?? `${UNMATCHED_PREFIX}${index}:${speaker}`);
    const segments: TranscriptSegment[] = raw
      .filter((s) => s.text)
      .map((s) => ({
        speaker: label(s.speaker),
        startMs: chunk.startMs + Math.round(s.start * 1000),
        endMs: chunk.startMs + Math.round(s.end * 1000),
        text: s.text,
      }));

    const update: Record<string, unknown> = {
      [`processing.chunks.${index}.status`]: "done",
      [`processing.chunks.${index}.segments`]: segments,
    };

    // 有多段時，從第一段建立講者聲音樣本
    if (index === 0 && chunks.length > 1) {
      update["processing.speakerRefs"] = await withWorkDir(async (dir) => {
        const file = path.join(dir, "chunk-0.mp3");
        await writeFile(file, audio);
        const picks = pickReferenceClips(raw);
        return Promise.all(
          picks.map(async (p) => ({
            name: `speaker_${p.speaker}`, // 避免和 API 對新講者自動給的 A、B 撞名
            label: p.speaker,
            dataUrl: await clipAsDataUrl(file, p.start, p.duration, dir),
          })),
        );
      });
    }

    // 用欄位路徑更新：不同段同時完成也不會互相覆蓋
    await MeetingModel.updateOne(
      { _id: meetingId, userId },
      { $set: update, $unset: { [`processing.chunks.${index}.error`]: 1 } },
    );
  } catch (err) {
    const message =
      err instanceof OpenAI.APIError ? `語音轉文字失敗：${err.message}` : "語音轉文字失敗，請稍後再試";
    console.error(`transcribeChunk ${meetingId}#${index} failed:`, err);
    await MeetingModel.updateOne(
      { _id: meetingId, userId },
      { $set: { [`processing.chunks.${index}.error`]: message } },
    ).catch(() => {});
    throw new PipelineError(message, err instanceof OpenAI.APIError ? 502 : 500);
  }
}

// ---------- 第三步：合併各段、統一講者標籤、AI 整理 ----------

// 依出現順序替還沒對應到的講者配上新的字母，跳過已使用的標籤
function relabelUnmatched(segments: TranscriptSegment[]) {
  const used = new Set(segments.map((s) => s.speaker).filter((sp) => !sp.startsWith(UNMATCHED_PREFIX)));
  const mapping = new Map<string, string>();
  let n = 0;
  const nextLabel = () => {
    for (;;) {
      const candidate = n < 26 ? String.fromCharCode(65 + n) : `S${n + 1}`;
      n++;
      if (!used.has(candidate)) return candidate;
    }
  };
  return segments.map((s) => {
    if (!s.speaker.startsWith(UNMATCHED_PREFIX)) return s;
    if (!mapping.has(s.speaker)) mapping.set(s.speaker, nextLabel());
    return { ...s, speaker: mapping.get(s.speaker)! };
  });
}

export async function finalizeMeeting(userId: string, meetingId: string): Promise<MeetingDetail> {
  await connectDB();
  const doc = await MeetingModel.findOne({ _id: meetingId, userId }).lean();
  if (!doc) throw new PipelineError("找不到這筆會議紀錄", 404);
  if (!doc.processing) return toMeetingDetail(doc); // 已經處理完成（重複呼叫）

  const chunks = doc.processing.chunks;
  const pending = chunks.map((c, i) => (c.status === "done" ? -1 : i + 1)).filter((i) => i > 0);
  if (pending.length > 0) throw new PipelineError(`第 ${pending.join("、")} 段尚未轉錄完成`, 409);

  await MeetingModel.updateOne({ _id: meetingId, userId }, { $set: { status: "summarizing" } });

  const segments = relabelUnmatched(
    chunks.flatMap((c) =>
      (c.segments ?? []).map((s) => ({
        speaker: s.speaker ?? "",
        startMs: s.startMs ?? 0,
        endMs: s.endMs ?? 0,
        text: s.text,
      })),
    ),
  );
  const fullText = segments.map((s) => s.text).join("\n");

  // AI 整理失敗不影響逐字稿保存
  let minutes: MeetingMinutes | null = null;
  let minutesError: string | undefined;
  if (fullText.trim()) {
    try {
      minutes = await summarizeTranscript(openaiClient(), fullText, segments);
    } catch (err) {
      console.error("Summarization failed:", err);
      minutesError =
        err instanceof OpenAI.APIError ? `AI 整理失敗：${err.message}` : "AI 整理失敗，請稍後再試";
    }
  } else {
    minutesError = "錄音中沒有辨識到語音內容";
  }

  const updated = await MeetingModel.findOneAndUpdate(
    { _id: meetingId, userId },
    {
      $set: {
        title: minutes?.title || doc.title,
        transcript: { fullText, segments },
        ...(minutes && {
          ai: {
            summary: minutes.summary,
            keyPoints: minutes.keyPoints,
            actionItems: minutes.actionItems.map((a) => ({
              task: a.task,
              owner: a.owner ?? undefined,
              due: a.due ?? undefined,
            })),
            model: SUMMARY_MODEL,
            generatedAt: new Date(),
          },
        }),
        status: minutes ? "completed" : "transcribed",
        ...(minutesError && { errorMessage: minutesError }),
      },
      $unset: { processing: 1, ...(!minutesError && { errorMessage: 1 }) },
    },
    { new: true },
  ).lean();
  if (!updated) throw new PipelineError("找不到這筆會議紀錄", 404);

  // 分段暫存檔已經用不到了
  await Promise.all(chunks.map((c) => deleteBlobQuietly(c.blobUrl)));

  return toMeetingDetail(updated);
}
