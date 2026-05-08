export type Format = "post" | "thread" | "video" | "carousel";

export type StoryboardEventRelation = "root" | "next" | "parallel";

export interface EvidenceMetadata {
  details?: string;
  tools?: string[];
  features?: string[];
  artifacts?: string[];
  people_or_teams?: string[];
  decisions?: string[];
  blockers?: string[];
  grouping_hints?: string[];
}

export interface StoryboardEvent extends EvidenceMetadata {
  text: string;
  source: string;
  relation: StoryboardEventRelation;
  confirmed: boolean;
  discrepancy?: string;
}

export interface StoryboardPhase {
  title: string;
  events: StoryboardEvent[];
}

export interface StoryboardTurningPoint extends EvidenceMetadata {
  text: string;
  source: string;
}

export interface StoryboardOpenThread extends EvidenceMetadata {
  text: string;
  source?: string;
}

export interface Storyboard {
  title: string;
  overview: string;
  phases: StoryboardPhase[];
  parallel_events: StoryboardEvent[];
  key_turning_points: StoryboardTurningPoint[];
  open_threads: StoryboardOpenThread[];
  narrative_summary: string;
}

export interface Theme extends EvidenceMetadata {
  title: string;
  one_liner: string;
  content_angle: string;
  sources: string[];
  suggested_formats: string[];
  storyboard?: Storyboard;
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
  storyboard?: Storyboard;
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
