// 網站名稱：頁首 Logo、分頁標題、頁尾、Word 檔資訊都用這個
export const APP_NAME = "AI 會議記錄／讀書筆記";

/** 分頁標題：「頁面名稱｜網站名稱」 */
export function pageTitle(page: string) {
  return `${page}｜${APP_NAME}`;
}
