import { type Message, generateObject } from 'ai';
import { BaseAgent, type AgentConfig, type AgentContext } from '../base-agent';
import { thinkTool } from '@/lib/ai/tools/think.ai-tool';
import { generateUUID } from '@/lib/utils';
import { z } from 'zod';
import { myProvider } from '@/lib/ai/providers';

// Define interfaces for the message content parts
interface TextPart {
  type: 'text';
  text: string;
}

type MessageContent = string | (TextPart | unknown)[];

// Define a type for agent metadata
export type AgentMetadata = {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
};

// Function to generate system prompt dynamically based on available agents
export function generateRouterSystemPrompt(agents: AgentMetadata[]): string {
  let agentDescriptions = agents
    .map((agent) => `${agent.name} ("${agent.id}"): ${agent.description}`)
    .join('\n');

  return `You are an intelligent Router Agent that determines which specialized agent is best suited to handle a user's request.

Your task is to carefully analyze the user's message and select the most appropriate agent based on their capabilities:

${agentDescriptions}

Analyze the user request and determine the single best agent for the task. Be decisive in your selection.`;
}

// Define routing decision schema with Zod
const routingDecisionSchema = z.object({
  selectedAgentId: z.string().describe('The ID of the selected agent'),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe('The reasoning behind the agent selection')
});

type RoutingDecision = z.infer<typeof routingDecisionSchema>;

export class RouterAgent extends BaseAgent {
  private specializedAgents: BaseAgent[];
  private selectedAgent: BaseAgent | null = null;

  constructor(context: AgentContext, specializedAgents: BaseAgent[]) {
    // Extract metadata from the specialized agents
    const agentMetadata: AgentMetadata[] = specializedAgents.map((agent) => ({
      id: agent.getId(),
      name: agent.getName(),
      description: agent.getDescription(),
      capabilities: agent.getCapabilities()
    }));

    // Generate the system prompt dynamically
    const systemPrompt = generateRouterSystemPrompt(agentMetadata);

    // Create valid values for the selectedAgentId based on available agents
    const validAgentIds = specializedAgents.map((agent) => agent.getId());

    const config: AgentConfig = {
      id: 'router',
      name: 'Router Agent',
      description: 'Determines which specialized agent to handle the request',
      model: 'chat-model',
      systemPrompt,
      tools: {
        think: thinkTool
      },
      capabilities: ['agent-routing', 'task-classification'],
      maxSteps: 3
    };

    super(config, context);

    // Store specialized agents
    this.specializedAgents = specializedAgents;
  }

  // Helper method to find a fallback agent
  private getFallbackAgent(): BaseAgent | null {
    // Try to find chat agent first
    for (const agent of this.specializedAgents) {
      if (agent.getId() === 'chat') {
        return agent;
      }
    }

    // Otherwise return the first agent if available
    return this.specializedAgents.length > 0 ? this.specializedAgents[0] : null;
  }

  // Find an agent by ID
  private findAgentById(agentId: string): BaseAgent | null {
    for (const agent of this.specializedAgents) {
      if (agent.getId() === agentId) {
        return agent;
      }
    }
    return null;
  }

  // Extract text from a message
  private extractMessageText(message: Message): string {
    let content = message.content as MessageContent;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      let textParts: string[] = [];

      for (let i = 0; i < content.length; i++) {
        const part = content[i];
        if (
          part &&
          typeof part === 'object' &&
          'type' in part &&
          part.type === 'text' &&
          'text' in part
        ) {
          textParts.push(part.text as string);
        }
      }

      return textParts.join(' ');
    }

    return '';
  }

  public async route(messages: Message[]): Promise<void> {
    if (!this.context.dataStream) {
      throw new Error('DataStream is required for routing messages');
    }

    this.selectedAgent = null;

    // Inform the user that we're analyzing their request
    this.context.dataStream.writeData({
      text: 'Analyzing your request to determine the best specialized agent...',
      type: 'thinking'
    });

    // Get only the most recent user message for routing decision
    const lastUserMessage = messages[messages.length - 1];
    const userMessageContent = this.extractMessageText(lastUserMessage);

    try {
      console.log('Starting agent routing with generateObject');

      // Create a custom schema based on available agents
      const dynamicRoutingSchema = z.object({
        selectedAgentId: z.enum(
          this.specializedAgents.map((agent) => agent.getId()) as [string, ...string[]]
        ),
        confidence: z.number().min(0).max(1),
        reasoning: z.string().describe('The reasoning behind the agent selection')
      });

      // Use generateObject to get a structured routing decision
      const { object: decision } = await generateObject({
        model: myProvider.languageModel(this.config.model),
        schema: dynamicRoutingSchema,
        system: this.config.systemPrompt,
        prompt: `User request: "${userMessageContent}"\n\nDetermine which agent should handle this request.`,
        temperature: 0.1 // Lower temperature for more deterministic routing
      });

      // Log the routing decision
      console.log('Routing decision:', JSON.stringify(decision));

      this.context.dataStream.writeData({
        text: `Chosen agent: ${decision.selectedAgentId}`,
        type: 'thinking'
      });

      // Send the reasoning to the client
      this.context.dataStream.writeData({
        text: `${decision.reasoning}`,
        type: 'thinking'
      });

      // Find the selected agent
      this.selectedAgent = this.findAgentById(decision.selectedAgentId);

      if (this.selectedAgent) {
        // Send a status update to the client
        this.context.dataStream.writeData({
          text: `I've determined that the ${this.selectedAgent.getName()} is best suited to help you with this request (confidence: ${Math.round(decision.confidence * 100)}%).`,
          type: 'thinking'
        });

        console.log(`Router selected agent: ${this.selectedAgent.getName()}`);

        // Process the messages with the selected agent
        await this.selectedAgent.processMessages(messages);
      } else {
        throw new Error(`Agent with ID ${decision.selectedAgentId} not found`);
      }
    } catch (error) {
      console.error('Error in router agent:', error);

      // Inform the user about the fallback
      this.context.dataStream.writeData({
        text: "I couldn't determine the best agent for your request. Falling back to general chat...",
        type: 'thinking'
      });

      // Get fallback agent
      const fallbackAgent = this.getFallbackAgent();

      if (fallbackAgent) {
        console.log(`Falling back to default agent: ${fallbackAgent.getName()}`);
        await fallbackAgent.processMessages(messages);
      } else {
        console.error('No specialized agents available for fallback!');

        // Create a synthetic error response message
        this.context.dataStream.writeData({
          type: 'assistant_message',
          message: {
            id: generateUUID(),
            role: 'assistant',
            parts: [
              "I apologize, but I'm currently unable to process your request. Please try again later."
            ]
          }
        });
      }
    }
  }
}
