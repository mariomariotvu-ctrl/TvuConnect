import { extractAcronym, normalizeVietnameseText } from './matchingUtils';

const normalizeSearchText = (value: string) => normalizeVietnameseText(value)
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const addPrefixes = (target: Set<string>, value: string) => {
  for (let length = 2; length <= Math.min(value.length, 24); length += 1) {
    target.add(value.slice(0, length));
  }
};

/**
 * Build bounded prefix tokens for public, non-sensitive profile fields. This
 * supports Firestore `array-contains` searches without exposing MSSV, phone,
 * email, or an exact location.
 */
export const buildStudentSearchTokens = (fields: Array<string | undefined>): string[] => {
  const tokens = new Set<string>();

  fields.forEach((field) => {
    if (!field) return;

    const normalized = normalizeSearchText(field);
    if (normalized.length >= 2) addPrefixes(tokens, normalized);
    normalized.split(' ').filter((word) => word.length >= 2).forEach((word) => {
      addPrefixes(tokens, word);
    });

    const acronym = extractAcronym(normalized);
    if (acronym.length >= 2) addPrefixes(tokens, acronym);
  });

  return [...tokens].slice(0, 200);
};

/** Pick a selective token for the server query; full matching stays client-side. */
export const getStudentSearchQueryToken = (keyword: string): string | null => {
  const normalized = normalizeSearchText(keyword);
  return normalized.length >= 2 ? normalized.slice(0, 24) : null;
};
