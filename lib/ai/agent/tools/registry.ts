/**
 * Tool registry for managing AI tools with agent-specific metadata
 */

export type ToolMetadata = {
  name: string;
  description: string;
  capabilities: string[];
  parameters: Record<string, any>;
  requiresAuth?: boolean;
  isExpensive?: boolean;
};

/**
 * Registry for managing AI tools with agent-specific metadata
 */
export class ToolRegistry {
  private tools: Map<string, any> = new Map();
  private metadata: Map<string, ToolMetadata> = new Map();

  /**
   * Register a tool with the registry
   */
  registerTool(name: string, tool: any, metadata: ToolMetadata): void {
    if (this.tools.has(name)) {
      console.warn(`Tool '${name}' is already registered. Overwriting.`);
    }

    this.tools.set(name, tool);
    this.metadata.set(name, { ...metadata, name });

    console.log(`Registered tool: ${name}`);
  }

  /**
   * Get a tool by name
   */
  getTool(name: string): any {
    return this.tools.get(name);
  }

  /**
   * Get tool metadata by name
   */
  getMetadata(name: string): ToolMetadata | undefined {
    return this.metadata.get(name);
  }

  /**
   * Get all registered tools
   */
  getAllTools(): Record<string, any> {
    const result: Record<string, any> = {};
    this.tools.forEach((tool, name) => {
      result[name] = tool;
    });
    return result;
  }

  /**
   * Get all tools with a specific capability
   */
  getToolsWithCapability(capability: string): ToolMetadata[] {
    return Array.from(this.metadata.values()).filter((metadata) =>
      metadata.capabilities.includes(capability)
    );
  }

  /**
   * Get all registered tool metadata
   */
  getAllMetadata(): ToolMetadata[] {
    return Array.from(this.metadata.values());
  }
}

/**
 * Creates a tool registry with all available tools
 */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // Tool registration will happen here
  // This will be populated as we refactor existing tools

  return registry;
}
