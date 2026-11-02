const PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "OpenAI/Anthropic-style key", re: /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/ },
  { name: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/ },
  { name: "Slack token", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/ },
  { name: "Generic secret assignment", re: /\b(?:api[_-]?key|secret|password|token)\b\s*[:=]\s*["']?[A-Za-z0-9_\-/+]{16,}/i },
];

/** Returns the names of secret-like patterns found in text, empty when clean. */
export function detectSecrets(text: string): string[] {
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.name);
}
