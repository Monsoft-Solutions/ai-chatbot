import { type DataStreamWriter, type Message } from 'ai';
import { type Session } from 'next-auth';
import { AgentFactory } from './agent-factory';
import { BaseAgent } from './base-agent';
import { RouterAgent } from './specialized/router-agent';

export type AgentServiceOptions = {
  session: Session | null;
  dataStream?: DataStreamWriter;
  selectedAgentId?: string;
};

export class AgentService {
  private factory: AgentFactory;
  private currentAgent: BaseAgent | null = null;
  private context: {
    session: Session | null;
    dataStream?: DataStreamWriter;
  };

  constructor(options: AgentServiceOptions) {
    const { session, dataStream, selectedAgentId } = options;
    
    this.context = {
      session,
      dataStream
    };
    
    // Initialize the agent factory
    this.factory = AgentFactory.getInstance(this.context);
    
    // Set the current agent if specified
    if (selectedAgentId) {
      this.currentAgent = this.factory.getAgent(selectedAgentId) || null;
    }
  }

  /**
   * Process messages using the appropriate agent
   */
  public async processMessages(messages: Message[]): Promise<void> {
    if (!this.context.dataStream) {
      throw new Error('DataStream is required for processing messages');
    }

    try {
      console.log(`Processing messages with AgentService`);
      
      // If we have a specific agent already selected, use it
      if (this.currentAgent) {
        console.log(`Using pre-selected agent: ${this.currentAgent.getName()}`);
        
        // Send notification about pre-selected agent
        this.context.dataStream.writeData({
          text: `Using the ${this.currentAgent.getName()} for your request...`,
          type: 'thinking'
        });
        
        await this.currentAgent.processMessages(messages);
        return;
      }
      
      // Otherwise, use the router agent to determine which agent to use
      console.log('No agent pre-selected, using RouterAgent to determine best agent');
      const routerAgent = this.factory.getRouterAgent();
      await routerAgent.route(messages);
      
    } catch (error) {
      console.error('Error in AgentService:', error);
      
      // Handle errors gracefully by providing a response
      if (this.context.dataStream) {
        this.context.dataStream.writeData({
          type: 'assistant_message',
          message: {
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            role: 'assistant',
            parts: ['I apologize, but I encountered an error while processing your request. Please try again later.']
          }
        });
      }
    }
  }

  /**
   * Get a specific agent by ID
   */
  public getAgent(id: string): BaseAgent | undefined {
    return this.factory.getAgent(id);
  }

  /**
   * Set the current agent by ID
   */
  public setCurrentAgent(id: string): boolean {
    const agent = this.factory.getAgent(id);
    if (agent) {
      this.currentAgent = agent;
      return true;
    }
    return false;
  }

  /**
   * Get all available specialized agents
   */
  public getAvailableAgents(): BaseAgent[] {
    return this.factory.getSpecializedAgents();
  }
} 