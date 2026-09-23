import { Schema, deleteModel, model, models, type InferSchemaType, type Model } from "mongoose";

export const MEETING_STATUSES = [
  "draft", // 剛建立，還沒有逐字稿
  "transcribing", // 語音轉文字中
  "transcribed", // 逐字稿完成，等待 AI 整理
  "summarizing", // AI 整理中
  "completed", // 全部完成
  "failed", // 任一步驟失敗，看 errorMessage
] as const;

// 逐字稿的一段發言（有講者、時間軸時使用）
const TranscriptSegmentSchema = new Schema(
  {
    speaker: { type: String, trim: true },
    startMs: { type: Number, min: 0 },
    endMs: { type: Number, min: 0 },
    text: { type: String, required: true },
  },
  { _id: false },
);

const ActionItemSchema = new Schema(
  {
    task: { type: String, required: true, trim: true },
    owner: { type: String, trim: true },
    due: { type: String, trim: true }, // 保留會議原話中的期限，例如「下週五前」
    done: { type: Boolean, default: false },
  },
  { _id: true },
);

// AI 整理結果，逐字稿完成後才會填入
const AiResultSchema = new Schema(
  {
    summary: { type: String },
    keyPoints: { type: [String], default: undefined },
    decisions: { type: [String], default: undefined },
    actionItems: { type: [ActionItemSchema], default: undefined },
    topics: { type: [String], default: undefined },
    model: { type: String }, // 產生這份結果的模型，方便日後比較或重跑
    generatedAt: { type: Date },
  },
  { _id: false },
);

const MeetingSchema = new Schema(
  {
    // 擁有者：所有查詢都必須帶上 userId 條件，確保每個人只看得到自己的會議
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    meetingDate: { type: Date, default: Date.now },
    durationSeconds: { type: Number, min: 0 },
    participants: { type: [String], default: [] },
    language: { type: String, default: "zh-TW" },
    tags: { type: [String], default: [] },

    // 逐字稿來源
    source: {
      kind: { type: String, enum: ["upload", "recording", "paste"] },
      fileName: String,
      mimeType: String,
    },

    // 錄音檔（存在 Vercel Blob）。url 不直接給前端，播放一律經過有權限檢查的 API
    audio: {
      url: String,
      pathname: String,
      size: Number,
      contentType: String,
    },

    // 完整逐字稿：fullText 一定有；segments 在有講者 / 時間軸時才有
    transcript: {
      fullText: { type: String, default: "" },
      segments: { type: [TranscriptSegmentSchema], default: undefined },
    },

    ai: { type: AiResultSchema, default: undefined },

    status: {
      type: String,
      enum: MEETING_STATUSES,
      default: "draft",
      index: true,
    },
    errorMessage: { type: String },
  },
  { timestamps: true },
);

// 歷史列表查詢：某位使用者的會議，依日期新到舊
MeetingSchema.index({ userId: 1, meetingDate: -1 });

export type Meeting = InferSchemaType<typeof MeetingSchema>;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

// dev 模式 hot reload 會重新執行這個檔案：先移除舊 model 再重新註冊，
// 否則會沿用舊 schema，新加的欄位在存檔時會被默默丟掉
if (process.env.NODE_ENV !== "production" && models.Meeting) deleteModel("Meeting");

export const MeetingModel: Model<Meeting> =
  (models.Meeting as Model<Meeting>) || model<Meeting>("Meeting", MeetingSchema);
