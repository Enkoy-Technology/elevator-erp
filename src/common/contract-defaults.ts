/**
 * The warranty a new quotation, and a contract issued off a proforma that
 * states none, starts with: one year (client, 2026-10-02). A starting
 * value only — both stay editable, and clearing it means no warranty.
 */
export const DEFAULT_WARRANTY_MONTHS = 12;

/**
 * Article 7.1's late-delivery penalty: percent of the contract price for
 * each day of delay (client, 2026-10-08: 0.02% a day, correcting the
 * "0.002 percent" of 2026-10-02). A new contract starts with it, and a
 * signed one that states none is reckoned at it on the project list.
 */
export const DEFAULT_DELAY_PENALTY_PERCENT_PER_DAY = '0.02';
