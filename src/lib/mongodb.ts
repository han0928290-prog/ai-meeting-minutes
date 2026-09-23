import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

// 開發模式 hot reload 會重新執行模組，把連線快取掛在 global 上避免連線數一直增加
const globalForMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache: MongooseCache = (globalForMongoose.mongooseCache ??= {
  conn: null,
  promise: null,
});

export async function connectDB() {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("請在 .env.local 設定 MONGODB_URI");
    }
    cache.promise = mongoose.connect(uri, { bufferCommands: false });
  }

  try {
    cache.conn = await cache.promise;
  } catch (err) {
    cache.promise = null;
    throw err;
  }

  return cache.conn;
}
