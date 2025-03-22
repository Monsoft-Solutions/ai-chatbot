/**
 * Agent memory system for tracking execution history and context
 */
import { generateUUID } from '@/lib/utils';
import { type Plan } from './planner';

/**
 * Memory entry for storing execution details
 */
export type MemoryEntry = {
  id: string;
  request: string;
  timestamp: number;
  plan: Plan;
  executionResult: any;
  reflection: any;
};

/**
 * Agent memory system that stores short and long-term context
 */
export class AgentMemory {
  private shortTermMemory: MemoryEntry[] = [];
  private longTermMemory: Map<string, MemoryEntry> = new Map();
  private maxShortTermSize: number = 10;

  /**
   * Store execution results in memory
   */
  async storeExecution(
    request: string, 
    plan: Plan, 
    executionResult: any,
    reflection: any
  ): Promise<string> {
    const entry: MemoryEntry = {
      id: generateUUID(),
      request,
      timestamp: Date.now(),
      plan,
      executionResult,
      reflection
    };

    // Store in short-term memory
    this.shortTermMemory.push(entry);
    if (this.shortTermMemory.length > this.maxShortTermSize) {
      this.shortTermMemory.shift();
    }

    // Store in long-term memory
    this.longTermMemory.set(entry.id, entry);
    
    // Persist to database if needed
    // await this.persistMemory(entry);
    
    return entry.id;
  }

  /**
   * Retrieve memory entry by ID
   */
  getMemoryById(id: string): MemoryEntry | undefined {
    return this.longTermMemory.get(id);
  }

  /**
   * Get all short-term memory entries
   */
  getShortTermMemory(): MemoryEntry[] {
    return [...this.shortTermMemory];
  }

  /**
   * Retrieve relevant context for a request
   */
  async retrieveRelevantContext(request: string): Promise<any> {
    // In a future implementation, this would use embeddings or another
    // technique to find semantically relevant past memories
    
    // For now, simply return recent memories
    return {
      recentMemories: this.shortTermMemory,
      // Additional context could be added here
    };
  }

  /**
   * Clear short-term memory
   */
  clearShortTermMemory(): void {
    this.shortTermMemory = [];
  }

  /**
   * Clear all memory (use with caution)
   */
  clearAllMemory(): void {
    this.shortTermMemory = [];
    this.longTermMemory.clear();
  }
}

// Singleton instance for global memory access
let globalMemoryInstance: AgentMemory | null = null;

/**
 * Get the global memory instance
 */
export function getGlobalMemory(): AgentMemory {
  if (!globalMemoryInstance) {
    globalMemoryInstance = new AgentMemory();
  }
  return globalMemoryInstance;
} 