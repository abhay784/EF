export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function spokenSeconds(text: string): number {
  return Math.round(wordCount(text) / 2.5);
}
