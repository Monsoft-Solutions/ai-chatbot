/**
 * Agent planner for breaking down user requests into structured plans
 */
import { myProvider } from '@/lib/ai/providers';
import { generateUUID } from '@/lib/utils';

/**
 * Represents a single step in an execution plan
 */
export type PlanStep = {
  id: string;
  description: string;
  toolName?: string;
  toolParameters?: Record<string, any>;
  dependsOn: string[];
  expectedOutcome: string;
};

/**
 * Represents a complete execution plan
 */
export type Plan = {
  id: string;
  goal: string;
  steps: PlanStep[];
  reasoning: string;
};

/**
 * Agent planner that creates structured plans from user requests
 */
export class AgentPlanner {
  private plannerModel = myProvider.languageModel('chat-model-reasoning');

  /**
   * Create a structured plan from a user request
   */
  async createPlan(request: string, context: any): Promise<Plan> {
    // Use AI to generate a structured plan
    const planResult = await this.plannerModel.doGenerate({
      prompt: `${this.getPlanningSystemPrompt()}\n\nRequest: ${request}\n\nContext: ${JSON.stringify(context, null, 2)}`
    } as any);

    try {
      // Parse the plan from the result
      const plan = this.parsePlanFromText(planResult.text || '');
      return {
        id: generateUUID(),
        ...plan
      };
    } catch (error) {
      console.error('Failed to parse plan:', error);
      // Return a basic fallback plan if parsing fails
      return this.createFallbackPlan(request);
    }
  }

  /**
   * Get the system prompt for plan generation
   */
  private getPlanningSystemPrompt(): string {
    return `You are a planning agent that breaks down user requests into clear, executable steps. 
    Your task is to:
    1. Analyze the user's request thoroughly
    2. Break it down into logical steps
    3. For each step, identify if a tool should be used
    4. Define dependencies between steps
    5. Return a structured plan in JSON format

    The plan should follow this format:
    {
      "goal": "Brief description of the overall goal",
      "reasoning": "Your reasoning about how to approach this task",
      "steps": [
        {
          "id": "step1",
          "description": "Description of the step",
          "toolName": "optional tool name if this step uses a tool",
          "toolParameters": {}, 
          "dependsOn": [],
          "expectedOutcome": "what you expect to get from this step"
        }
      ]
    }
    
    Include the 'toolName' field only if the step requires a specific tool.
    The 'dependsOn' field should contain IDs of other steps that must be completed before this step.
    Be specific in the 'expectedOutcome' field to facilitate validation.
    
    Always respond with a valid JSON object without any additional text before or after.`;
  }

  /**
   * Parse a plan from text (expects JSON)
   */
  private parsePlanFromText(text: string): Omit<Plan, 'id'> {
    // Find the JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON object found in the response');
    }

    const jsonString = jsonMatch[0];
    const parsed = JSON.parse(jsonString);

    // Validate the plan structure
    if (!parsed.goal || !parsed.steps || !Array.isArray(parsed.steps)) {
      throw new Error('Invalid plan structure');
    }

    // Ensure each step has required fields
    parsed.steps = parsed.steps.map((step: any) => ({
      id: step.id || generateUUID(),
      description: step.description || 'No description provided',
      toolName: step.toolName,
      toolParameters: step.toolParameters || {},
      dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
      expectedOutcome: step.expectedOutcome || 'No expected outcome specified'
    }));

    return {
      goal: parsed.goal,
      reasoning: parsed.reasoning || 'No reasoning provided',
      steps: parsed.steps
    };
  }

  /**
   * Create a fallback plan when plan generation or parsing fails
   */
  private createFallbackPlan(request: string): Plan {
    return {
      id: generateUUID(),
      goal: `Process request: ${request}`,
      reasoning: 'Using fallback plan due to planning failure',
      steps: [
        {
          id: 'fallback-step',
          description: 'Process the request directly',
          dependsOn: [],
          expectedOutcome: 'Request handled successfully'
        }
      ]
    };
  }
}
