export const DEFAULT_CHAT_MODEL: string = 'chat-model-smart';

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: 'chat-model-fast',
    name: 'Fast',
    description: 'Quick responses for simple questions'
  },
  {
    id: 'chat-model-smart',
    name: 'Smart',
    description: 'Balanced between speed and depth'
  },
  {
    id: 'chat-model-genius',
    name: 'Genius',
    description: 'Deep insights and detailed responses'
  },
  {
    id: 'chat-model-reasoning',
    name: 'Reasoning',
    description: 'Advanced reasoning for complex problems'
  }
];
