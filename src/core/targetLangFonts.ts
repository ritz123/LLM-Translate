/**
 * Maps target locale codes to CSS classes that load matching Noto families
 * (see index.css + index.html Google Fonts link).
 */
export type TargetScriptClass =
  | "target-script-deva"
  | "target-script-beng"
  | "target-script-telu"
  | "target-script-taml"
  | "target-script-gujr"
  | "target-script-knda"
  | "target-script-mlym"
  | "target-script-guru"
  | "target-script-orya"
  | "target-script-arab"
  | "target-script-latn";

export function targetScriptClassForLang(code: string): TargetScriptClass {
  switch (code) {
    case "hi":
    case "mr":
    case "ne":
      return "target-script-deva";
    case "bn":
    case "as":
      return "target-script-beng";
    case "te":
      return "target-script-telu";
    case "ta":
      return "target-script-taml";
    case "gu":
      return "target-script-gujr";
    case "kn":
      return "target-script-knda";
    case "ml":
      return "target-script-mlym";
    case "pa":
      return "target-script-guru";
    case "or":
      return "target-script-orya";
    case "ur":
      return "target-script-arab";
    default:
      return "target-script-latn";
  }
}
