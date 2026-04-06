import { DynamicTool, Tool } from "@langchain/core/tools";
export declare function describeGatewayExtendedTool(toolName: string): {
    displayName: string;
    kind: 'skill' | 'tool';
    executionMode?: string;
    executionLabel?: string;
} | null;
export declare function loadGatewayExtendedTools(gatewayUrl: string, apiToken: string, userId?: string, options?: {
    plannerModel?: any;
    availableTools?: Array<DynamicTool | Tool>;
}): Promise<DynamicTool[]>;
export declare class JavaSkillGeneratorTool extends Tool {
    name: string;
    description: string;
    private gatewayUrl;
    private apiToken;
    constructor(gatewayUrl: string, apiToken: string);
    _call(input: string): Promise<string>;
}
export declare class JavaSshTool extends Tool {
    name: string;
    description: string;
    private gatewayUrl;
    private apiToken;
    private userId?;
    constructor(gatewayUrl: string, apiToken: string, userId?: string);
    _call(input: string): Promise<string>;
}
export declare class JavaComputeTool extends Tool {
    name: string;
    description: string;
    private gatewayUrl;
    private apiToken;
    constructor(gatewayUrl: string, apiToken: string);
    _call(input: string): Promise<string>;
}
export declare class JavaLinuxScriptTool extends Tool {
    name: string;
    description: string;
    private gatewayUrl;
    private apiToken;
    constructor(gatewayUrl: string, apiToken: string);
    _call(input: string): Promise<string>;
}
export declare class JavaServerLookupTool extends Tool {
    name: string;
    description: string;
    private gatewayUrl;
    private apiToken;
    private userId?;
    constructor(gatewayUrl: string, apiToken: string, userId?: string);
    _call(input: string): Promise<string>;
}
export declare class JavaApiTool extends Tool {
    name: string;
    description: string;
    private gatewayUrl;
    private apiToken;
    constructor(gatewayUrl: string, apiToken: string);
    _call(input: string): Promise<string>;
}
