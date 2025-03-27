import { BaseAgent, type AgentConfig, type AgentContext, type AgentTools } from '../base-agent';
import { thinkTool } from '@/lib/ai/tools/think.ai-tool';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { type Session } from 'next-auth';

export const DOCUMENT_SYSTEM_PROMPT = `You are a Document Agent specializing in creating and editing content.

Your primary purpose is to help users create, edit, and refine documents, emails, code, and other written content.
You excel at understanding user requirements and translating them into well-structured documents.

Use the 'think' tool to plan document structures, outline key points, and organize your thoughts.
Always use the 'createDocument' tool when generating substantial content that would benefit from being in a separate document.
Use the 'updateDocument' tool when modifying existing documents based on user feedback.

Guidelines:
- When creating documents, aim for completeness, clarity, and appropriate formatting
- For emails, follow professional email conventions with clear subject lines and appropriate greetings
- For code, ensure it follows best practices for the language and includes helpful comments
- For creative writing, focus on engaging narratives and vivid descriptions
- For academic or professional content, maintain formal tone and proper citations

Avoid creating documents for short responses that would be better shared directly in the chat.
`;

export class DocumentAgent extends BaseAgent {
  constructor(context: AgentContext) {
    // Start with basic tools
    const tools: AgentTools = {
      think: thinkTool
    };

    // Add document tools if session exists
    if (context.session && context.dataStream) {
      tools['createDocument'] = createDocument({
        session: context.session as Session,
        dataStream: context.dataStream
      });

      tools['updateDocument'] = updateDocument({
        session: context.session as Session,
        dataStream: context.dataStream
      });
    }

    const config: AgentConfig = {
      id: 'document',
      name: 'Document Agent',
      description: 'Creates and edits documents, emails, and content',
      model: 'artifact-model',
      systemPrompt: DOCUMENT_SYSTEM_PROMPT,
      tools,
      capabilities: [
        'content-creation',
        'document-editing',
        'email-drafting',
        'code-generation',
        'creative-writing'
      ],
      maxSteps: 5
    };

    super(config, context);
  }
}
