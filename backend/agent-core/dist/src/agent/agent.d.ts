import type { SkillManager } from "../skills/skill.manager";
export declare class AgentFactory {
    static createAgent(gatewayUrl: string, apiToken: string, openAiApiKey: string, config?: {
        modelName?: string;
        baseUrl?: string;
        callbacks?: any[];
    }, skillManager?: SkillManager, userId?: string): Promise<import("@langchain/langgraph").CompiledStateGraph<import("@langchain/langgraph").StateType<{
        tasks_status: import("@langchain/langgraph").BaseChannel<import("./tasks-state").TasksStatusMap, import("./tasks-state").TasksStatusMap | import("@langchain/langgraph").OverwriteValue<import("./tasks-state").TasksStatusMap>, unknown>;
        messages: import("@langchain/langgraph").BaseChannel<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], import("@langchain/langgraph").OverwriteValue<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]> | import("@langchain/langgraph").Messages, unknown>;
    }>, import("@langchain/langgraph").UpdateType<{
        tasks_status: import("@langchain/langgraph").BaseChannel<import("./tasks-state").TasksStatusMap, import("./tasks-state").TasksStatusMap | import("@langchain/langgraph").OverwriteValue<import("./tasks-state").TasksStatusMap>, unknown>;
        messages: import("@langchain/langgraph").BaseChannel<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], import("@langchain/langgraph").OverwriteValue<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]> | import("@langchain/langgraph").Messages, unknown>;
    }>, any, {
        messages: import("@langchain/langgraph").BaseChannel<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], import("@langchain/langgraph").OverwriteValue<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]> | import("@langchain/langgraph").Messages, unknown>;
    } & {
        tasks_status: import("@langchain/langgraph").BaseChannel<import("./tasks-state").TasksStatusMap, import("./tasks-state").TasksStatusMap | import("@langchain/langgraph").OverwriteValue<import("./tasks-state").TasksStatusMap>, unknown>;
        messages: import("@langchain/langgraph").BaseChannel<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], import("@langchain/langgraph").OverwriteValue<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]> | import("@langchain/langgraph").Messages, unknown>;
    }, {
        messages: import("@langchain/langgraph").BaseChannel<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], import("@langchain/langgraph").OverwriteValue<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]> | import("@langchain/langgraph").Messages, unknown>;
        structuredResponse: {
            (annotation: import("@langchain/langgraph").SingleReducer<Record<string, any>, Record<string, any>>): import("@langchain/langgraph").BaseChannel<Record<string, any>, Record<string, any> | import("@langchain/langgraph").OverwriteValue<Record<string, any>>, unknown>;
            (): import("@langchain/langgraph").LastValue<Record<string, any>>;
            Root: <S extends import("@langchain/langgraph").StateDefinition>(sd: S) => import("@langchain/langgraph").AnnotationRoot<S>;
        };
    } & {
        tasks_status: import("@langchain/langgraph").BaseChannel<import("./tasks-state").TasksStatusMap, import("./tasks-state").TasksStatusMap | import("@langchain/langgraph").OverwriteValue<import("./tasks-state").TasksStatusMap>, unknown>;
        messages: import("@langchain/langgraph").BaseChannel<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[], import("@langchain/langgraph").OverwriteValue<import("@langchain/core/messages").BaseMessage<import("@langchain/core/messages").MessageStructure<import("@langchain/core/messages").MessageToolSet>, import("@langchain/core/messages").MessageType>[]> | import("@langchain/langgraph").Messages, unknown>;
    }, import("@langchain/langgraph").StateDefinition, unknown, unknown, unknown>>;
}
