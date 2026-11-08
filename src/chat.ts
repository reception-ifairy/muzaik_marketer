// Conversation types and the SSE events streamed by POST /api/chat.

import type { ActivityStep, SourceLink } from './types';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceLink[];
  steps: ActivityStep[];
  images?: string[]; // ids of photos attached by the user (/api/chat/images/:id)
  status: 'complete' | 'partial' | 'error';
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export interface Conversation extends ConversationSummary {
  messages: ChatMessage[];
}

export type ChatEvent =
  | { type: 'conversation'; id: string; title: string; userMessageId: string; content: string; images: string[] }
  | { type: 'status'; text: string }
  | { type: 'activity'; step: ActivityStep }
  | { type: 'delta'; text: string }
  | { type: 'sources'; items: SourceLink[] }
  | { type: 'saved'; messageId: string; status: ChatMessage['status'] }
  | { type: 'fail'; message: string }
  | { type: 'done' };
