export interface LanguageOption {
  id: string;
  label: string;
}

// Curated list of languages selectable from the status bar.
// Identifiers map directly to Monaco language ids, except "plaintext"
// which Monaco understands as the no-highlight default.
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: "plaintext", label: "Plain Text" },
  { id: "json", label: "JSON" },
  { id: "markdown", label: "Markdown" },
  { id: "xml", label: "XML" },
  { id: "yaml", label: "YAML" },
  { id: "ini", label: "INI / TOML" },
  { id: "sql", label: "SQL" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "scss", label: "SCSS" },
  { id: "less", label: "Less" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "go", label: "Go" },
  { id: "java", label: "Java" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "rust", label: "Rust" },
  { id: "shell", label: "Shell" },
  { id: "powershell", label: "PowerShell" },
  { id: "dockerfile", label: "Dockerfile" },
];

const LABEL_BY_ID: Record<string, string> = LANGUAGE_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.id] = opt.label;
    return acc;
  },
  {} as Record<string, string>,
);

export function getLanguageLabel(id: string): string {
  const key =
    String(id || "")
      .toLowerCase()
      .trim() || "plaintext";
  return LABEL_BY_ID[key] || key;
}
