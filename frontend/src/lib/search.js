// Shared text-search helpers for the page search bars.
//
// Case-insensitive, ignores leading/trailing spaces (phone keyboards add a
// trailing space after an autocompleted word, which used to make a search
// match nothing), and safe on missing fields (a null field just doesn't
// match instead of throwing and breaking the whole list).

export const normalizeSearch = (term) => (term == null ? "" : String(term).trim().toLowerCase());

// True when `term` is empty or appears in any of `values`.
export function matchesSearch(term, ...values) {
  const needle = normalizeSearch(term);
  if (!needle) return true;
  return values.some((v) => v != null && String(v).toLowerCase().includes(needle));
}

// Props for search <Input>s: stop mobile keyboards auto-capitalising,
// autocorrecting or spell-checking what's typed.
export const searchInputProps = {
  autoCapitalize: "none",
  autoCorrect: "off",
  autoComplete: "off",
  spellCheck: false,
  enterKeyHint: "search",
};
