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
import { clipAsDataUrl, concatAudio, detectSilences, encodeSegment, planChunks, probeDurationSeconds } from "@/lib/ffmpeg";
import { toMeetingDetail, type MeetingDetail, type TranscriptSegment } from "@/lib/meeting-dto";
import { connectDB } from "@/lib/mongodb";
import { SUMMARY_MODEL, summarizeTranscript, type AiNotes, type SummaryAttachment } from "@/lib/summarize";
import {
  ATTACHMENT_KIND_BY_EXT,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENTS_TOTAL_BYTES,
  MAX_ATTACHMENT_BYTES,
  MAX_AUDIO_SECONDS,
  MAX_RECORDINGS,
  MAX_UPLOAD_BYTES,
  fileExtension,
  type NoteType,
  userAttachmentPrefix,
  userAudioPrefix,
} from "@/lib/upload-config";
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

/** API 路由攔到非預期錯誤時給使用者的訊息：至少說明是哪個動作、是不是資料庫連不上 */
export function unexpectedErrorMessage(action: string, err: unknown) {
  const name = err instanceof Error ? err.name : "";
  if (name.startsWith("MongoServerSelection") || name.startsWith("MongooseServerSelection") || name === "MongoNetworkError") {
    return `${action}失敗：無法連線到資料庫，請稍後再試`;
  }
  return `${action}時發生未預期的錯誤，詳細原因請看伺服器紀錄`;
}

// OpenAI 的原始錯誤訊息是英文且偏技術，常見狀況換成看得懂的說明，其餘附上原文方便查
function describeOpenAIError(err: InstanceType<typeof OpenAI.APIError>) {
  if (err instanceof OpenAI.APIConnectionTimeoutError) return "OpenAI 回應逾時，可以按「重試」再試一次";
  if (err instanceof OpenAI.APIConnectionError) return "無法連線到 OpenAI，請確認網路連線";
  if (err.status === 401) return "OpenAI API 金鑰無效或已過期，請檢查 OPENAI_API_KEY";
  if (err.status === 429) {
    return err.code === "insufficient_quota"
      ? "OpenAI 帳戶額度不足，請到 OpenAI 後台儲值"
      : "OpenAI 請求太頻繁，請稍候再按「重試」";
  }
  if (err.status !== undefined && err.status >= 500) return `OpenAI 服務暫時異常（HTTP ${err.status}），請稍後再試`;
  return err.message;
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

export type AttachmentInput = { blobUrl: string; fileName: string };

// 補充資料同樣由前端提供網址，逐一確認是這位使用者上傳、格式與大小都在限制內
async function verifyAttachments(userId: string, inputs: AttachmentInput[]) {
  if (inputs.length > MAX_ATTACHMENTS) throw new PipelineError(`補充資料最多 ${MAX_ATTACHMENTS} 個檔案`, 400);
  const metas = await Promise.all(inputs.map((a) => head(a.blobUrl).catch(() => null)));
  const verified = metas.map((meta, i) => {
    if (!meta) throw new PipelineError(`找不到補充資料「${inputs[i].fileName}」，請重新上傳`, 400);
    if (!meta.pathname.startsWith(userAttachmentPrefix(userId)) || !ATTACHMENT_KIND_BY_EXT[fileExtension(meta.pathname)]) {
      throw new PipelineError("無效的補充資料", 403);
    }
    if (meta.size > MAX_ATTACHMENT_BYTES) {
      throw new PipelineError(`「${inputs[i].fileName}」超過 ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB 上限`, 413);
    }
    return {
      url: meta.url,
      pathname: meta.pathname,
      fileName: inputs[i].fileName,
      size: meta.size,
      contentType: ATTACHMENT_KIND_BY_EXT[fileExtension(meta.pathname)].mime,
    };
  });
  if (verified.reduce((sum, a) => sum + a.size, 0) > MAX_ATTACHMENTS_TOTAL_BYTES) {
    throw new PipelineError(`補充資料合計超過 ${MAX_ATTACHMENTS_TOTAL_BYTES / 1024 / 1024}MB 上限`, 413);
  }
  return verified;
}

export type RecordingInput = { blobUrl: string; fileName: string };

// 錄音檔由前端提供網址，逐一確認是這位使用者上傳、大小在限制內
async function verifyRecordings(userId: string, inputs: RecordingInput[]) {
  if (inputs.length === 0) throw new PipelineError("請至少上傳一個錄音檔", 400);
  if (inputs.length > MAX_RECORDINGS) throw new PipelineError(`錄音檔最多 ${MAX_RECORDINGS} 個`, 400);
  const metas = await Promise.all(inputs.map((r) => head(r.blobUrl).catch(() => null)));
  // 確認屬於這位使用者的檔案，驗證失敗時一併清掉（前端重試會重新上傳）
  const owned = metas.filter(
    (meta): meta is NonNullable<typeof meta> =>
      meta !== null &&
      meta.pathname.startsWith(userAudioPrefix(userId)) &&
      !meta.pathname.includes("/chunks/") &&
      !meta.pathname.startsWith(userAttachmentPrefix(userId)),
  );
  const fail = async (message: string, status: number): Promise<never> => {
    await Promise.all(owned.map((m) => deleteBlobQuietly(m.url)));
    throw new PipelineError(message, status);
  };

  for (const [i, meta] of metas.entries()) {
    if (!meta) await fail(`找不到上傳的錄音檔「${inputs[i].fileName}」，請重新上傳`, 400);
    else if (!owned.includes(meta)) await fail("無效的錄音檔", 403);
  }
  if (owned.reduce((sum, m) => sum + m.size, 0) > MAX_UPLOAD_BYTES) {
    await fail(`錄音檔合計超過 ${MAX_UPLOAD_BYTES / 1024 / 1024}MB 上限`, 413);
  }
  return { metas: owned, cleanup: () => Promise.all(owned.map((m) => deleteBlobQuietly(m.url))) };
}

export async function prepareMeeting(
  userId: string,
  input: { noteType: NoteType; recordings: RecordingInput[]; attachments: AttachmentInput[] },
): Promise<{ meetingId: string; totalChunks: number; durationSeconds: number }> {
  // 檔案是瀏覽器直接傳到 Blob 的，網址由前端提供，必須確認真的是這位使用者上傳的
  const { metas, cleanup } = await verifyRecordings(userId, input.recordings);
  const names = input.recordings.map((r) => r.fileName);
  const multiple = metas.length > 1;

  const attachments = await verifyAttachments(userId, input.attachments).catch(async (err) => {
    // 前端重試時會重新上傳，這次的錄音檔就用不到了
    await cleanup();
    throw err;
  });

  await connectDB();
  if (!multiple && (await MeetingModel.exists({ userId, "audio.url": metas[0].url }))) {
    throw new PipelineError("這個錄音檔已經建立過會議紀錄", 409);
  }

  const meetingId = new Types.ObjectId();
  const createdUrls: string[] = []; // 這次產生的分段檔與合併檔，失敗時要清掉
  // 目前進行到哪一步，失敗時告訴使用者卡在哪裡
  let step = "下載錄音檔";

  try {
    const result = await withWorkDir(async (dir) => {
      const originals: string[] = [];
      for (const [i, meta] of metas.entries()) {
        step = multiple ? `下載第 ${i + 1} 個錄音檔「${names[i]}」` : "下載錄音檔";
        const file = path.join(dir, `original-${i}${path.extname(meta.pathname) || ".audio"}`);
        await pipeline(
          Readable.fromWeb((await downloadBlob(meta.url)) as NodeReadableStream),
          createWriteStream(file),
        );
        originals.push(file);
      }

      const durations: number[] = [];
      for (const [i, file] of originals.entries()) {
        step = multiple ? `讀取「${names[i]}」的錄音長度` : "讀取錄音長度";
        const seconds = await probeDurationSeconds(file).catch((err: Error) => {
          throw multiple ? new Error(`無法讀取音檔「${names[i]}」：${err.message.replace(/^無法讀取音檔，?/, "")}`) : err;
        });
        if (seconds < 1) throw new PipelineError(multiple ? `「${names[i]}」錄音長度太短` : "錄音長度太短", 400);
        durations.push(seconds);
      }
      const duration = durations.reduce((a, b) => a + b, 0);
      if (duration > MAX_AUDIO_SECONDS) {
        throw new PipelineError(
          `錄音長度${multiple ? "合計" : ""}超過 ${MAX_AUDIO_SECONDS / 3600} 小時上限`,
          413,
        );
      }

      // 多個錄音檔：依順序接成一個檔，之後的切段、轉錄、播放都用這個檔
      let source = originals[0];
      let audio = {
        url: metas[0].url,
        pathname: metas[0].pathname,
        size: metas[0].size,
        contentType: audioContentType(metas[0].pathname, metas[0].contentType),
      };
      if (multiple) {
        step = `合併 ${metas.length} 個錄音檔`;
        source = path.join(dir, "merged.mp3");
        await concatAudio(originals, source);
        step = "上傳合併後的錄音";
        const merged = await put(`${userAudioPrefix(userId)}merged/${meetingId}.mp3`, await readFile(source), {
          access: BLOB_ACCESS,
          addRandomSuffix: true,
          contentType: "audio/mpeg",
        });
        createdUrls.push(merged.url);
        const size = (await head(merged.url)).size;
        audio = { url: merged.url, pathname: merged.pathname, size, contentType: "audio/mpeg" };
      }

      step = "偵測靜音位置";
      const silences = duration > CHUNK_MAX_SECONDS ? await detectSilences(source) : [];
      const plan = planChunks(duration, silences, CHUNK_MAX_SECONDS);

      const chunks = [];
      for (const [i, c] of plan.entries()) {
        const out = path.join(dir, `chunk-${i}.mp3`);
        step = `切割第 ${i + 1} 段錄音`;
        await encodeSegment(source, c.start, c.end - c.start, out);
        step = `上傳第 ${i + 1} 段錄音`;
        const blob = await put(`${userAudioPrefix(userId)}chunks/${meetingId}/${i}.mp3`, await readFile(out), {
          access: BLOB_ACCESS,
          addRandomSuffix: true,
          contentType: "audio/mpeg",
        });
        createdUrls.push(blob.url);
        chunks.push({ startMs: Math.round(c.start * 1000), endMs: Math.round(c.end * 1000), blobUrl: blob.url });
      }

      // 每個錄音檔在合併後時間軸上的起點，逐字稿與 AI 整理用來標示「第幾個錄音」
      let offset = 0;
      const recordings = durations.map((seconds, i) => {
        const part = { fileName: names[i], startMs: Math.round(offset * 1000), durationSeconds: seconds };
        offset += seconds;
        return part;
      });

      step = "儲存會議紀錄";
      await MeetingModel.create({
        _id: meetingId,
        userId,
        title: names[0].replace(/\.[^.]+$/, "") || "未命名會議",
        noteType: input.noteType,
        durationSeconds: duration,
        source: {
          kind: "upload",
          fileName: multiple ? `${names[0]} 等 ${names.length} 個檔案` : names[0],
          mimeType: multiple ? "audio/mpeg" : metas[0].contentType,
        },
        audio,
        ...(multiple && { recordings }),
        ...(attachments.length > 0 && { attachments }),
        status: "transcribing",
        processing: { chunks },
      });

      return { meetingId: String(meetingId), totalChunks: chunks.length, durationSeconds: duration };
    });
    // 多個錄音檔已經合併保存，原始檔用不到了
    if (multiple) await cleanup();
    return result;
  } catch (err) {
    // 沒有成功建立紀錄：清掉這次產生的分段檔、原始檔與補充資料，避免孤兒檔案
    await Promise.all([...createdUrls, ...attachments.map((a) => a.url)].map(deleteBlobQuietly));
    await cleanup();
    if (err instanceof PipelineError) throw err;
    console.error(`prepareMeeting failed at「${step}」:`, err);
    throw new PipelineError(
      err instanceof Error && err.message.startsWith("無法讀取音檔")
        ? err.message
        : `錄音檔處理失敗：${step}時發生錯誤，請重新上傳再試一次`,
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

  const part = `第 ${index + 1} 段`;
  let step = "下載音檔";
  try {
    const audio = Buffer.from(await new Response(await downloadBlob(chunk.blobUrl)).arrayBuffer());

    step = "語音轉文字";
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
      step = "擷取講者聲音樣本";
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

    step = "儲存轉錄結果";
    // 用欄位路徑更新：不同段同時完成也不會互相覆蓋
    await MeetingModel.updateOne(
      { _id: meetingId, userId },
      { $set: update, $unset: { [`processing.chunks.${index}.error`]: 1 } },
    );
  } catch (err) {
    const message =
      err instanceof OpenAI.APIError
        ? `${part}語音轉文字失敗：${describeOpenAIError(err)}`
        : `${part}處理失敗：${step}時發生錯誤，可以按「重試」再試一次`;
    console.error(`transcribeChunk ${meetingId}#${index} failed at「${step}」:`, err);
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

// AI 整理結果依紀錄類型存進對應的欄位
function aiFields(result: AiNotes) {
  if (result.type === "study") {
    const { summary, sections, terms, examples } = result.notes;
    return { summary, sections, terms, examples };
  }
  const { summary, keyPoints, actionItems } = result.minutes;
  return {
    summary,
    keyPoints,
    actionItems: actionItems.map((a) => ({ task: a.task, owner: a.owner ?? undefined, due: a.due ?? undefined })),
  };
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
  let result: AiNotes | null = null;
  let minutesError: string | undefined;
  if (fullText.trim()) {
    try {
      const attachments: SummaryAttachment[] = await Promise.all(
        (doc.attachments ?? []).map(async (a) => {
          const type = ATTACHMENT_KIND_BY_EXT[fileExtension(a.pathname)];
          const data = await downloadBlob(a.url)
            .then((stream) => new Response(stream).arrayBuffer())
            .catch(() => {
              throw new PipelineError(`無法讀取補充資料「${a.fileName}」`, 500);
            });
          return { fileName: a.fileName, kind: type.kind, mime: type.mime, data: Buffer.from(data) };
        }),
      );
      result = await summarizeTranscript(openaiClient(), doc.noteType ?? "meeting", fullText, segments, {
        attachments,
        recordings: doc.recordings ?? [],
      });
    } catch (err) {
      console.error("Summarization failed:", err);
      minutesError = `AI 整理失敗：${
        err instanceof OpenAI.APIError
          ? describeOpenAIError(err)
          : err instanceof PipelineError
            ? err.message
            : err instanceof Error && err.message.startsWith("模型沒有完成整理")
              ? "AI 沒有完成整理，可能是內容太長，請再試一次"
              : "整理時發生未預期的錯誤，詳細原因請看伺服器紀錄"
      }`;
    }
  } else {
    minutesError = "錄音中沒有辨識到語音內容";
  }

  const updated = await MeetingModel.findOneAndUpdate(
    { _id: meetingId, userId },
    {
      $set: {
        title: (result?.type === "study" ? result.notes.title : result?.minutes.title) || doc.title,
        transcript: { fullText, segments },
        ...(result && { ai: { ...aiFields(result), model: SUMMARY_MODEL, generatedAt: new Date() } }),
        status: result ? "completed" : "transcribed",
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
