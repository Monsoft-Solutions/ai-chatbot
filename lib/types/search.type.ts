import { CoreMessage, JSONValue, Message } from 'ai';

export type SearchResults = {
  images: SearchResultImage[];
  results: SearchResultItem[];
  number_of_results?: number;
  query: string;
};

// If enabled the include_images_description is true, the images will be an array of { url: string, description: string }
// Otherwise, the images will be an array of strings
export type SearchResultImage =
  | string
  | {
      url: string;
      description: string;
      number_of_results?: number;
    };

export type SerperSearchResults = {
  searchParameters: {
    q: string;
    type: string;
    engine: string;
  };
  videos: SerperSearchResultItem[];
};

export type SearchResultItem = {
  title: string;
  url: string;
  content: string;
};

export type SerperSearchResultItem = {
  title: string;
  link: string;
  snippet: string;
  imageUrl: string;
  duration: string;
  source: string;
  channel: string;
  date: string;
  position: number;
};

export interface Chat extends Record<string, any> {
  id: string;
  title: string;
  createdAt: Date;
  userId: string;
  path: string;
  messages: ExtendedCoreMessage[]; // Note: Changed from AIMessage to ExtendedCoreMessage
  sharePath?: string;
}

// ExtendedCoreMessage for saveing annotations
export type ExtendedCoreMessage = Omit<CoreMessage, 'role' | 'content'> & {
  role: CoreMessage['role'] | 'data';
  content: CoreMessage['content'] | JSONValue;
};

export type AIMessage = {
  role: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool';
  content: string;
  id: string;
  name?: string;
  type?:
    | 'answer'
    | 'related'
    | 'skip'
    | 'inquiry'
    | 'input'
    | 'input_related'
    | 'tool'
    | 'followup'
    | 'end';
};
