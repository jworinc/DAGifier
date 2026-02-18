export interface PageDoc {
  version: string; // Schema version (e.g., "1.0")
  url?: string;
  title: string;
  meta: {
    author?: string;
    site?: string;
    published?: string;
    pack?: string; // which pattern pack was used
    jsonLd?: boolean; // whether JSON-LD was verified
    confidence: number; // 0.0 to 1.0
    warnings: string[];
  };
  kind: 'thread' | 'article' | 'mixed';
  content: ContentBlock[];
  links: LinkRef[];
  metadata: Record<string, any>; // catch-all for raw signals/trace data
  structural_signature?: string; // hash of the structure for diffing
}

export type ContentBlock =
  | { id: string; type: 'heading'; level: number; text: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'code'; text: string; language?: string }
  | { id: string; type: 'quote'; text: string; author?: string }
  | { id: string; type: 'list'; items: string[] }
  | { id: string; type: 'thread-item'; depth: number; author?: string; content: ContentBlock[]; timestamp?: string; children?: ContentBlock[]; parentId?: string; collapsed?: boolean }
  | { id: string; type: 'link'; text: string; url: string; refId?: number }
  | { id: string; type: 'image'; alt?: string; src: string; caption?: string };

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
  data?: any;
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
