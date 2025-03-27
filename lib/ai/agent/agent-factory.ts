import { type Message } from 'ai';
import { BaseAgent, type AgentContext } from './base-agent';
import { ChatAgent } from './specialized/chat-agent';
import { ResearchAgent } from './specialized/research-agent';
import { DocumentAgent } from './specialized/document-agent';
import { RouterAgent } from './specialized/router-agent';

export class AgentFactory {
  private static instance: AgentFactory;
  private agents: Map<string, BaseAgent> = new Map();
  private context: AgentContext;

  private constructor(context: AgentContext) {
    this.context = context;
    this.registerDefaultAgents();
  }

  public static getInstance(context: AgentContext): AgentFactory {
    if (!AgentFactory.instance) {
      AgentFactory.instance = new AgentFactory(context);
    } else {
      // Update context if necessary (e.g., new session or dataStream)
      AgentFactory.instance.updateContext(context);
    }
    return AgentFactory.instance;
  }

  private updateContext(context: AgentContext): void {
    this.context = context;

    // Update context for all existing agents
    this.agents.forEach((agent) => {
      agent.updateContext(context);
    });
  }

  private registerDefaultAgents(): void {
    // Register specialized agents
    this.registerAgent(new ChatAgent(this.context));
    this.registerAgent(new ResearchAgent(this.context));
    this.registerAgent(new DocumentAgent(this.context));

    // Register router agent last (it needs to know about all other agents)
    const specializedAgents = this.getSpecializedAgents();
    this.registerAgent(new RouterAgent(this.context, specializedAgents));

    console.log(`Registered ${this.agents.size} agents:`);
    this.agents.forEach((agent, id) => {
      console.log(`- ${id}: ${agent.getName()}`);
    });
  }

  public registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.getId(), agent);
  }

  public getAgent(id: string): BaseAgent | undefined {
    return this.agents.get(id);
  }

  public getRouterAgent(): RouterAgent {
    const routerAgent = this.agents.get('router') as RouterAgent;
    if (!routerAgent) {
      throw new Error('Router agent not registered');
    }
    return routerAgent;
  }

  public getSpecializedAgents(): BaseAgent[] {
    // Return all agents except the router
    return Array.from(this.agents.values()).filter((agent) => agent.getId() !== 'router');
  }

  public async processWithRouter(messages: Message[]): Promise<void> {
    // The router agent will determine which specialized agent to use
    const routerAgent = this.getRouterAgent();
    await routerAgent.route(messages);
  }
}
