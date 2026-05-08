export type Format = "post" | "thread" | "video" | "carousel";

export interface Theme {
  title: string;
  one_liner: string;
  content_angle: string;
  sources: string[];
  suggested_formats: string[];
}

export interface WeeklyBrief {
  week: string;
  themes: Theme[];
  raw_highlights: string[];
  user_uploads: string[];
}

export interface VideoScript {
  hook: string;
  middle: string;
  cta: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GenerateRequest {
  theme: Theme | null;
  messages: ChatMessage[];
  brief: WeeklyBrief | null;
}
