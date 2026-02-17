export interface PageDoc {
  title: string;
  url?: string;
  author?: string;
  publishedDate?: string;
  content: ContentBlock[];
  metadata: Record<string, any>;
}

export type ContentBlock = 
  | { type: 'text'; text: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'thread-item'; level: number; author?: string; body: string; timestamp?: string; children?: ContentBlock[] }
  | { type: 'link'; text: string; url: string }
  | { type: 'image'; alt?: string; src: string; caption?: string };

export interface Trace {
  steps: TraceStep[];
  signals: Record<string, any>;
  durationMs: number;
}

export interface TraceStep {
  name: string;
  decision: string;
  reason: string;
  timestamp: number;
}

export interface IngestionPayload {
  source: 'url' | 'file' | 'stdin';
  identifier: string;
  rawContent: Buffer;
  mimeType?: string;
}
