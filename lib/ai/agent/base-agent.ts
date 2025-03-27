import { type DataStreamWriter, type Message, type Tool, smoothStream, streamText } from 'ai';
import { type Session } from 'next-auth';
import { generateUUID } from '@/lib/utils';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';

export type AgentTools = Record<string, Tool>;

export type AgentConfig = {
  id: string;
  name: string;
  description: string;
  model: string;
  systemPrompt: string;
  tools: AgentTools;
  capabilities: string[];
  maxSteps: number;
};

export type AgentContext = {
  session: Session | null;
  dataStream?: DataStreamWriter;
};

export class BaseAgent {
  protected config: AgentConfig;
  protected context: AgentContext;

  constructor(config: AgentConfig, context: AgentContext) {
    this.config = config;
    this.context = context;
  }

  /**
   * Update the agent's context (e.g., with a new session or dataStream)
   */
  public updateContext(context: AgentContext): void {
    // Only update properties that are provided
    if (context.session !== undefined) {
      this.context.session = context.session;
    }

    if (context.dataStream !== undefined) {
      this.context.dataStream = context.dataStream;
    }
  }

  public getId(): string {
    return this.config.id;
  }

  public getName(): string {
    return this.config.name;
  }

  public getDescription(): string {
    return this.config.description;
  }

  public getCapabilities(): string[] {
    return this.config.capabilities;
  }

  public getTools(): AgentTools {
    return this.config.tools;
  }

  public getActiveToolNames(): string[] {
    return Object.keys(this.config.tools);
  }

  public async processMessages(
    messages: Message[],
    options?: Partial<Parameters<typeof streamText>[0]>
  ): Promise<void> {
    if (!this.context.dataStream) {
      throw new Error('DataStream is required for processing messages');
    }

    // Prepare a custom agent header message
    this.context.dataStream.writeData({
      text: `Now processing your request with the ${this.getName()}...`,
      type: 'thinking'
    });

    // Prepare for processing
    const callSettings = {
      model: myProvider.languageModel(this.config.model),
      system: this.config.systemPrompt,
      messages,
      maxSteps: this.config.maxSteps || 5,
      experimental_activeTools: this.getActiveToolNames(),
      experimental_transform: smoothStream({ chunking: 'word' }),
      experimental_generateMessageId: generateUUID,
      tools: this.config.tools,
      toolCallStreaming: true,
      experimental_telemetry: {
        isEnabled: isProductionEnvironment,
        functionId: `agent-${this.config.id}`
      },
      ...options
    };

    console.log(`Processing messages with agent: ${this.config.name}`);

    try {
      const result = streamText(callSettings);
      console.log(`Called streamText with model: ${this.config.model}`);

      // Consume and merge the stream
      result.consumeStream();
      result.mergeIntoDataStream(this.context.dataStream, {
        sendReasoning: true
      });
    } catch (error) {
      console.error(`Error processing messages with ${this.config.name}:`, error);

      // Provide a fallback response in case of error
      this.context.dataStream.writeData({
        type: 'assistant_message',
        message: {
          id: generateUUID(),
          role: 'assistant',
          parts: [
            `I'm sorry, but I encountered an error while processing your request. Please try again later.`
          ]
        }
      });
    }
  }
}
