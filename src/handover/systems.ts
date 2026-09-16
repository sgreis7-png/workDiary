// The systems checked at a project handover, verbatim from paper form 70 (rev 1, 30.12.2022).
// The live list is admin-editable in handover_systems; this constant is what migration 0077
// seeds that table with, and systems.sql.test.ts holds the two in agreement — a label typed
// differently in SQL would silently produce a fifteenth system nobody ticks.
export const HANDOVER_SYSTEM_SEED = [
  'אוורור',
  'מערכת צינון',
  'חימום',
  'מערכת חשמל + מפיל וילון',
  'מערכת מים',
  'המטרה',
  'מיכלי תערובת',
  'מערכת האבסה',
  'מערכת שתייה',
  'מערכת תלייה וכננות',
  'מערכת תאים',
  'תאורה',
  'מערכת זבל',
  'מבנה/תשתית',
] as const
