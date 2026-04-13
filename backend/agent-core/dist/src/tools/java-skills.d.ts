import { DynamicTool, Tool, DynamicStructuredTool, StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
declare const computeToolInputSchema: z.ZodObject<{
    operation: z.ZodEnum<["add", "subtract", "multiply", "divide", "factorial", "square", "sqrt", "timestamp_to_date", "date_diff_days"]>;
    operands: z.ZodArray<z.ZodUnion<[z.ZodNumber, z.ZodString]>, "many">;
}, "strip", z.ZodTypeAny, {
    operation?: "add" | "subtract" | "multiply" | "divide" | "factorial" | "square" | "sqrt" | "timestamp_to_date" | "date_diff_days";
    operands?: (string | number)[];
}, {
    operation?: "add" | "subtract" | "multiply" | "divide" | "factorial" | "square" | "sqrt" | "timestamp_to_date" | "date_diff_days";
    operands?: (string | number)[];
}>;
declare const serverLookupToolInputSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name?: string;
}, {
    name?: string;
}>;
declare const linuxScriptToolInputSchema: z.ZodObject<{
    serverId: z.ZodString;
    command: z.ZodString;
}, "strip", z.ZodTypeAny, {
    command?: string;
    serverId?: string;
}, {
    command?: string;
    serverId?: string;
}>;
declare const apiCallerToolInputSchema: z.ZodObject<{
    url: z.ZodString;
    method: z.ZodDefault<z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>>;
    headers: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    body: z.ZodOptional<z.ZodAny>;
}, "strip", z.ZodTypeAny, {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    url?: string;
    headers?: Record<string, string>;
    body?: any;
}, {
    method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    url?: string;
    headers?: Record<string, string>;
    body?: any;
}>;
declare const sshExecutorToolInputSchema: z.ZodObject<{
    host: z.ZodString;
    username: z.ZodString;
    command: z.ZodString;
    privateKey: z.ZodOptional<z.ZodString>;
    password: z.ZodOptional<z.ZodString>;
    confirmed: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    command?: string;
    host?: string;
    username?: string;
    privateKey?: string;
    password?: string;
    confirmed?: boolean;
}, {
    command?: string;
    host?: string;
    username?: string;
    privateKey?: string;
    password?: string;
    confirmed?: boolean;
}>;
declare const skillGeneratorToolInputSchema: z.ZodDiscriminatedUnion<"targetType", [z.ZodObject<{
    targetType: z.ZodLiteral<"api">;
    rawDescription: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    method: z.ZodOptional<z.ZodString>;
    endpoint: z.ZodOptional<z.ZodString>;
    interfaceDescription: z.ZodOptional<z.ZodString>;
    parameterContract: z.ZodOptional<z.ZodAny>;
    allowOverwrite: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>, boolean, unknown>;
}, "strip", z.ZodTypeAny, {
    targetType?: "api";
    rawDescription?: string;
    name?: string;
    description?: string;
    method?: string;
    endpoint?: string;
    interfaceDescription?: string;
    parameterContract?: any;
    allowOverwrite?: boolean;
}, {
    targetType?: "api";
    rawDescription?: string;
    name?: string;
    description?: string;
    method?: string;
    endpoint?: string;
    interfaceDescription?: string;
    parameterContract?: any;
    allowOverwrite?: unknown;
}>, z.ZodObject<{
    targetType: z.ZodLiteral<"ssh">;
    rawDescription: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    command: z.ZodOptional<z.ZodString>;
    allowOverwrite: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>, boolean, unknown>;
}, "strip", z.ZodTypeAny, {
    targetType?: "ssh";
    rawDescription?: string;
    name?: string;
    description?: string;
    allowOverwrite?: boolean;
    command?: string;
}, {
    targetType?: "ssh";
    rawDescription?: string;
    name?: string;
    description?: string;
    allowOverwrite?: unknown;
    command?: string;
}>, z.ZodObject<{
    targetType: z.ZodLiteral<"openclaw">;
    rawDescription: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    systemPrompt: z.ZodOptional<z.ZodString>;
    allowOverwrite: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>, boolean, unknown>;
}, "strip", z.ZodTypeAny, {
    targetType?: "openclaw";
    rawDescription?: string;
    name?: string;
    description?: string;
    allowOverwrite?: boolean;
    systemPrompt?: string;
}, {
    targetType?: "openclaw";
    rawDescription?: string;
    name?: string;
    description?: string;
    allowOverwrite?: unknown;
    systemPrompt?: string;
}>, z.ZodObject<{
    targetType: z.ZodLiteral<"template">;
    rawDescription: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
    allowOverwrite: z.ZodEffects<z.ZodDefault<z.ZodOptional<z.ZodBoolean>>, boolean, unknown>;
}, "strip", z.ZodTypeAny, {
    targetType?: "template";
    rawDescription?: string;
    name?: string;
    description?: string;
    allowOverwrite?: boolean;
    prompt?: string;
}, {
    targetType?: "template";
    rawDescription?: string;
    name?: string;
    description?: string;
    allowOverwrite?: unknown;
    prompt?: string;
}>]>;
export declare function describeGatewayExtendedTool(toolName: string): {
    displayName: string;
    kind: 'skill' | 'tool';
    executionMode?: string;
    executionLabel?: string;
} | null;
export type BindableAgentTool = Tool | DynamicTool | StructuredTool;
export declare function loadGatewayExtendedTools(gatewayUrl: string, apiToken: string, userId?: string, options?: {
    plannerModel?: any;
    availableTools?: BindableAgentTool[];
}): Promise<DynamicTool[]>;
export declare function buildConfirmedToolInputString(args: unknown): string;
export declare function invokeExtendedSkillWithConfirmed(gatewayUrl: string, apiToken: string, userId: string | undefined, toolName: string, toolArguments: unknown, options: {
    plannerModel: any;
    availableTools: BindableAgentTool[];
}): Promise<string>;
export declare class JavaSkillGeneratorTool extends DynamicStructuredTool<typeof skillGeneratorToolInputSchema> {
    private readonly gatewayUrl;
    private readonly apiToken;
    private readonly userId?;
    constructor(gatewayUrl: string, apiToken: string, userId?: string);
}
export declare class JavaSshTool extends DynamicStructuredTool<typeof sshExecutorToolInputSchema> {
    constructor(gatewayUrl: string, apiToken: string, userId?: string);
}
export declare class JavaComputeTool extends DynamicStructuredTool<typeof computeToolInputSchema> {
    constructor(gatewayUrl: string, apiToken: string);
}
export declare class JavaLinuxScriptTool extends DynamicStructuredTool<typeof linuxScriptToolInputSchema> {
    constructor(gatewayUrl: string, apiToken: string);
}
export declare class JavaServerLookupTool extends DynamicStructuredTool<typeof serverLookupToolInputSchema> {
    constructor(gatewayUrl: string, apiToken: string, userId?: string);
}
export declare class JavaApiTool extends DynamicStructuredTool<typeof apiCallerToolInputSchema> {
    constructor(gatewayUrl: string, apiToken: string);
}
export {};
