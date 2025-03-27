import { BaseAgent, type AgentConfig, type AgentContext } from '../base-agent';
import { thinkTool } from '@/lib/ai/tools/think.ai-tool';

export const CHAT_SYSTEM_PROMPT = `You are a friendly Chat Agent designed for helpful, polite conversation.

Focus on engaging in natural dialogue and answering general knowledge questions to the best of your abilities.
Maintain a conversational tone and build rapport with the user.

You do NOT need to use external tools for simple conversations or questions that don't require current information.
Only use the 'think' tool for complex reasoning or when you need to organize your thoughts.

When asked for creative content (stories, poems, jokes), provide brief, engaging responses.
For factual questions, answer accurately based on your knowledge.
If unsure or if the question requires current information, clearly state your limitations and suggest searching the web.
`;

export class ChatAgent extends BaseAgent {
  constructor(context: AgentContext) {
    const config: AgentConfig = {
      id: 'chat',
      name: 'Chat Agent',
      description: 'Handles general conversation and basic questions',
      model: 'chat-model',
      systemPrompt: CHAT_SYSTEM_PROMPT,
      tools: {
        think: thinkTool
      },
      capabilities: [
        'general-conversation',
        'basic-qa',
        'creative-content',
        'friendly-chat'
      ],
      maxSteps: 3
    };

    super(config, context);
  }
} 