export type CategoryId =
  | 'merged-concerns'
  | 'missing-context'
  | 'conflicting-truth'
  | 'noise-over-signal'
  | 'irreversible-push';

/** Letters and Chinese labels follow notes/facts.md in the writing repo. */
export const CATEGORIES: Record<CategoryId, { letter: string; zh: string }> = {
  'merged-concerns': { letter: 'A', zh: '該分開的混在一起' },
  'missing-context': { letter: 'B', zh: '該有的沒有' },
  'conflicting-truth': { letter: 'C', zh: '說法不一致' },
  'noise-over-signal': { letter: 'D', zh: '字太多，重點太少' },
  'irreversible-push': { letter: 'E', zh: '叫它去做收不回的事' },
};
