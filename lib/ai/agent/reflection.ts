/**
 * Agent reflection system for evaluating execution success and identifying improvements
 */
import { myProvider } from '@/lib/ai/providers';
import { type Plan } from './planner';

/**
 * Reflection result type
 */
export type Reflection = {
  success: boolean;
  insights: string[];
  improvements: string[];
  feedback: string;
};

/**
 * Agent reflection system that analyzes execution and suggests improvements
 */
export class AgentReflection {
  private reflectionModel = myProvider.languageModel('chat-model-reasoning');

  /**
   * Reflect on a plan execution to evaluate success and identify improvements
   */
  async reflect(plan: Plan, executionResult: any): Promise<Reflection> {
    try {
      const reflectionResult = await this.reflectionModel.doGenerate({
        prompt: `${this.getReflectionSystemPrompt()}\n\nPlan: ${JSON.stringify(plan, null, 2)}\n\nExecution Result: ${JSON.stringify(executionResult, null, 2)}`
      } as any);

      // Parse reflection from the result
      return this.parseReflectionFromText(reflectionResult.text || '');
    } catch (error) {
      console.error('Reflection error:', error);
      return this.createFallbackReflection();
    }
  }

  /**
   * Get the system prompt for reflection
   */
  private getReflectionSystemPrompt(): string {
    return `You are a reflection agent that analyzes the execution of a plan and identifies insights and improvements.
    Your task is to:
    1. Determine if the plan execution was successful
    2. Identify key insights from the execution
    3. Suggest specific improvements for future executions
    4. Provide overall feedback on the execution process
    
    Return your reflection in JSON format:
    {
      "success": true/false,
      "insights": ["insight1", "insight2"],
      "improvements": ["improvement1", "improvement2"],
      "feedback": "overall feedback"
    }
    
    Be specific and actionable in your improvements.
    Always respond with a valid JSON object without any additional text before or after.`;
  }

  /**
   * Parse reflection from text (expects JSON)
   */
  private parseReflectionFromText(text: string): Reflection {
    // Find the JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error('No JSON object found in the response');
    }
    
    const jsonString = jsonMatch[0];
    const parsed = JSON.parse(jsonString);
    
    // Validate and normalize the reflection
    return {
      success: typeof parsed.success === 'boolean' ? parsed.success : false,
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
      feedback: parsed.feedback || 'No feedback provided'
    };
  }

  /**
   * Create a fallback reflection when reflection generation or parsing fails
   */
  private createFallbackReflection(): Reflection {
    return {
      success: false,
      insights: ['Reflection process failed'],
      improvements: ['Improve error handling in reflection system'],
      feedback: 'Unable to generate proper reflection due to an error.'
    };
  }
} 