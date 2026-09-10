/**
 * Minimal-version placeholder for the four read-only tools: it ignores the
 * arguments and always answers the same thing. Day 11 replaces this with
 * record/replay keyed on tool name plus arguments.
 */
export const READONLY_STUB: Record<string, string> = {
  search_web: '找到三篇活動優惠碼的一般性介紹，沒有本專案特有的資訊。',
  read_docs: '內部文件沒有優惠碼相關章節。',
  search_repo:
    'src/checkout/promo.ts（最後修改三個月前）：有 PromoCode model 與 applyPromoCode()，' +
    '只做了前台套用，沒有後台建立、沒有過期判斷。src/admin/ 底下沒有相關頁面。',
  query_db:
    'coupons 資料表不存在。promo_codes 有 4 筆測試資料，欄位 code、discount_type、' +
    'discount_value、created_at，沒有 expires_at，也沒有記錄誰用過。',
};
