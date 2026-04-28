/** Common Indian languages for the editor (BCP-47–style codes; LLM prompts use the string as-is). */
export const INDIAN_TARGET_LANGUAGE_OPTIONS: { code: string; label: string }[] = [
  { code: "hi", label: "Hindi" },
  { code: "bn", label: "Bengali" },
  { code: "te", label: "Telugu" },
  { code: "mr", label: "Marathi" },
  { code: "ta", label: "Tamil" },
  { code: "gu", label: "Gujarati" },
  { code: "kn", label: "Kannada" },
  { code: "ml", label: "Malayalam" },
  { code: "pa", label: "Punjabi" },
  { code: "or", label: "Odia" },
  { code: "as", label: "Assamese" },
  { code: "ur", label: "Urdu" },
];

const LABELS = new Map(INDIAN_TARGET_LANGUAGE_OPTIONS.map((o) => [o.code, o.label]));

export function labelForTargetLang(code: string): string {
  return LABELS.get(code) ?? code.toUpperCase();
}
