import OpenAI from "openai";
import type { TranscriptionDiarized } from "openai/resources/audio/transcriptions";
import * as OpenCC from "opencc-js/cn2t";
import { deleteBlobQuietly, uploadMeetingAudio } from "@/lib/blob";
import { getSessionUserId } from "@/lib/dal";
import { toMeetingDetail, type MeetingDetail, type TranscriptSegment } from "@/lib/meeting-dto";
import { connectDB } from "@/lib/mongodb";
import { SUMMARY_MODEL, summarizeTranscript, type MeetingMinutes } from "@/lib/summarize";
import { MeetingModel } from "@/models/Meeting";

// 長音檔轉錄 + AI 整理可能要跑好幾分鐘（部署平台會參考這個上限）
export const maxDuration = 300;

// OpenAI 語音轉文字 API 單檔上限
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["flac", "mp3", "mp4", "mpeg", "mpga", "m4a", "ogg", "wav", "webm"];

// 會議需要分辨講者，所以用有 diarization 的模型
const TRANSCRIBE_MODEL = "gpt-4o-transcribe-diarize";

// 模型常輸出簡體中文，且 diarize 模型不支援 prompt，改在這裡轉成台灣正體。
// 只轉字形不轉用詞（不用 "twp"），避免把講者原話的詞彙替換掉
const toTaiwanese = OpenCC.Converter({ from: "cn", to: "tw" });

export type TranscribeResponse = {
  meeting: MeetingDetail;
  // 非致命問題（例如錄音檔沒存成功），逐字稿與整理結果仍然有效
  warnings: string[];
};

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return errorResponse("請先登入", 401);
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return errorResponse("伺服器未設定 OPENAI_API_KEY", 500);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("請用 multipart/form-data 上傳音檔", 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return errorResponse("請選擇一個音檔", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return errorResponse("音檔超過 25MB 上限", 413);
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return errorResponse(`不支援的格式，請上傳 ${ALLOWED_EXTENSIONS.join(" / ")}`, 415);
  }

  const openai = new OpenAI({ apiKey });
  const warnings: string[] = [];

  // 第一步：語音轉文字
  let result: TranscriptionDiarized;
  try {
    // SDK 的型別沒有 diarized_json 專屬 overload，回傳值需自行轉型
    result = (await openai.audio.transcriptions.create({
      file,
      model: TRANSCRIBE_MODEL,
      response_format: "diarized_json",
      chunking_strategy: "auto", // 超過 30 秒的音檔必填
    })) as unknown as TranscriptionDiarized;
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      console.error("OpenAI transcription failed:", err.status, err.message);
      return errorResponse(`語音轉文字失敗：${err.message}`, 502);
    }
    console.error("Transcription failed:", err);
    return errorResponse("語音轉文字失敗，請稍後再試", 500);
  }

  const text = toTaiwanese(result.text);
  const segments: TranscriptSegment[] = result.segments.map((s) => ({
    speaker: s.speaker,
    startMs: Math.round(s.start * 1000),
    endMs: Math.round(s.end * 1000),
    text: toTaiwanese(s.text.trim()),
  }));

  // 第二步：AI 整理。失敗時不讓整個請求失敗，逐字稿轉錄成本較高，照樣保存
  let minutes: MeetingMinutes | null = null;
  let minutesError: string | undefined;
  try {
    minutes = await summarizeTranscript(openai, text, segments);
  } catch (err) {
    console.error("Summarization failed:", err);
    minutesError =
      err instanceof OpenAI.APIError ? `AI 整理失敗：${err.message}` : "AI 整理失敗，請稍後再試";
  }

  // 第三步：錄音檔存到 Vercel Blob。失敗時會議紀錄照存，只是沒有錄音檔
  let audio: { url: string; pathname: string; size: number; contentType: string } | undefined;
  try {
    const blob = await uploadMeetingAudio(userId, file);
    audio = { url: blob.url, pathname: blob.pathname, size: file.size, contentType: blob.contentType };
  } catch (err) {
    console.error("Blob upload failed:", err);
    warnings.push("錄音檔保存失敗，會議紀錄已保存但無法回放錄音");
  }

  // 第四步：寫入 MongoDB
  try {
    await connectDB();
    const doc = await MeetingModel.create({
      userId,
      title: minutes?.title || file.name.replace(/\.[^.]+$/, "") || "未命名會議",
      durationSeconds: result.duration,
      source: { kind: "upload", fileName: file.name, mimeType: file.type },
      audio,
      transcript: { fullText: text, segments },
      ai: minutes
        ? {
            summary: minutes.summary,
            keyPoints: minutes.keyPoints,
            actionItems: minutes.actionItems.map((a) => ({
              task: a.task,
              owner: a.owner ?? undefined,
              due: a.due ?? undefined,
            })),
            model: SUMMARY_MODEL,
            generatedAt: new Date(),
          }
        : undefined,
      status: minutes ? "completed" : "transcribed",
      errorMessage: minutesError,
    });

    const body: TranscribeResponse = { meeting: toMeetingDetail(doc.toObject()), warnings };
    return Response.json(body, { status: 201 });
  } catch (err) {
    console.error("Saving meeting failed:", err);
    // 資料庫沒存成功，錄音檔就成了孤兒檔案，順手刪掉
    if (audio) await deleteBlobQuietly(audio.url);
    return errorResponse("會議紀錄保存失敗，請稍後再試", 500);
  }
}
