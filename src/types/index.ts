export interface PageDoc {
  url?: string;
  title: string;
  meta: {
    author?: string;
    site?: string;
    published?: string;
    pack?: string; // which pattern pack was used
    jsonLd?: boolean; // whether JSON-LD was verified
  };
  kind: 'thread' | 'article' | 'mixed';
  content: ContentBlock[];
  links: LinkRef[];
  metadata: Record<string, any>; // catch-all for raw signals/trace data
}

export type ContentBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'text'; text: string }
  | { type: 'code'; text: string; language?: string }
  | { type: 'quote'; text: string; author?: string }
  | { type: 'list'; items: string[] }
  | { type: 'thread-item'; level: number; author?: string; content: ContentBlock[]; timestamp?: string; children?: ContentBlock[]; collapsed?: boolean }
  | { type: 'link'; text: string; url: string; refId?: number }
  | { type: 'image'; alt?: string; src: string; caption?: string };

export interface LinkRef {
  id: number;
  text: string;
  url: string;
}

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
  identifier: string; // URL or File path
  rawContent: Buffer;
  mimeType?: string;
}

export interface IBrowserAdapter {
  render(url: string): Promise<string>;
  close(): Promise<void>;
}
