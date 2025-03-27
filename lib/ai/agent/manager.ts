/**
 * Agent manager for coordinating AI agent components
 */
import { type DataStreamWriter, type Message } from 'ai';
import { type Session } from 'next-auth';
import { AgentPlanner } from './planner';
import { AgentMemory } from './memory';
import { AgentReflection } from './reflection';
import { type ToolRegistry } from './tools/registry';

/**
 * Agent state
 */
export type AgentState = 'idle' | 'planning' | 'executing' | 'reflecting' | 'waiting-for-input';

/**
 * Execution result type
 */
export type ExecutionResult = {
  success: boolean;
  stepResults: Record<string, any>;
  error?: string;
};

/**
 * Agent context containing session, conversation, and tools
 */
export type AgentContext = {
  session: Session;
  dataStream: DataStreamWriter;
  conversation: Message[];
  currentRequest: string;
  tools: ToolRegistry;
};

/**
 * Agent manager that coordinates planning, execution, and reflection
 */
export class AgentManager {
  private state: AgentState = 'idle';
  private context: AgentContext;
  private planner: AgentPlanner;
  private memory: AgentMemory;
  private reflection: AgentReflection;

  /**
   * Create a new agent manager
   */
  constructor(context: AgentContext) {
    this.context = context;
    this.planner = new AgentPlanner();
    this.memory = new AgentMemory();
    this.reflection = new AgentReflection();
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Process a user request
   */
  async processRequest(request: string): Promise<void> {
    // Update context with new request
    this.context.currentRequest = request;

    try {
      // Stream initial status
      this.streamToUser("I'm analyzing your request...");

      // Retrieve relevant memory
      const relevantMemory = await this.memory.retrieveRelevantContext(request);

      // Generate plan
      this.state = 'planning';
      this.streamToUser('Creating a plan to address your request...');
      const plan = await this.planner.createPlan(request, relevantMemory);

      // Stream plan to user
      this.streamPlanToUser(plan);

      // Execute plan
      this.state = 'executing';
      this.streamToUser('Executing the plan...');
      const result = await this.executeSteps(plan.steps);

      // Reflect on execution
      this.state = 'reflecting';
      this.streamToUser('Reflecting on the execution...');
      const reflection = await this.reflection.reflect(plan, result);

      // Store in memory
      await this.memory.storeExecution(request, plan, result, reflection);

      // Stream reflection insights if there are any
      if (reflection.insights.length > 0) {
        this.streamToUser(`Key insights: ${reflection.insights.join(', ')}`);
      }

      // Return to idle state
      this.state = 'idle';
    } catch (error) {
      console.error('Agent error:', error);
      this.streamToUser(
        `I encountered an error while processing your request: ${error instanceof Error ? error.message : String(error)}`
      );
      this.state = 'idle';
    }
  }

  /**
   * Execute plan steps
   */
  private async executeSteps(steps: Array<any>): Promise<ExecutionResult> {
    const results: Record<string, any> = {};
    let success = true;

    // In a real implementation, this would handle dependencies and parallel execution
    // For now, execute steps sequentially
    for (const step of steps) {
      try {
        this.streamToUser(`Executing step: ${step.description}`);

        // If step requires a tool, execute it
        if (step.toolName) {
          const tool = this.context.tools.getTool(step.toolName);

          if (!tool) {
            throw new Error(`Tool not found: ${step.toolName}`);
          }

          const result = await tool(step.toolParameters || {});
          results[step.id] = result;
          this.streamToUser(`Completed: ${step.description}`);
        } else {
          // If no tool is specified, mark as completed without execution
          results[step.id] = { completed: true };
          this.streamToUser(`Completed: ${step.description}`);
        }
      } catch (error) {
        console.error(`Error executing step ${step.id}:`, error);
        results[step.id] = { error: error instanceof Error ? error.message : String(error) };
        success = false;
        this.streamToUser(
          `Error in step "${step.description}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      success,
      stepResults: results
    };
  }

  /**
   * Stream a message to the user
   */
  private streamToUser(message: string): void {
    this.context.dataStream.writeData({ text: message });
  }

  /**
   * Stream plan information to the user
   */
  private streamPlanToUser(plan: any): void {
    this.streamToUser(`Plan: ${plan.goal}`);

    // Send plan to data stream for UI visualization
    this.context.dataStream.writeData({
      type: 'agent-plan',
      content: JSON.stringify(plan)
    });

    // Stream steps to user
    this.streamToUser(`I'll approach this in ${plan.steps.length} steps:`);

    plan.steps.forEach((step: any, index: number) => {
      this.streamToUser(`${index + 1}. ${step.description}`);
    });
  }
}
