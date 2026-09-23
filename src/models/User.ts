import { Schema, deleteModel, model, models, type InferSchemaType, type Model } from "mongoose";

const UserSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    // 預設查詢不帶出密碼雜湊，登入時需明確 .select("+passwordHash")
    passwordHash: { type: String, required: true, select: false },
  },
  { timestamps: true },
);

export type User = InferSchemaType<typeof UserSchema>;

// dev 模式 hot reload 會重新執行這個檔案：先移除舊 model 再重新註冊，
// 否則會沿用舊 schema，新加的欄位在存檔時會被默默丟掉
if (process.env.NODE_ENV !== "production" && models.User) deleteModel("User");

export const UserModel: Model<User> =
  (models.User as Model<User>) || model<User>("User", UserSchema);
