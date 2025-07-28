import { agentExecutorDefinition, type IAgentExecutor } from "./proto/agent_executor.grpc-server";
import type { StreamResponse } from "./proto/a2a";
import type * as proto from "./proto/agent_executor";
import * as protoA2a from "./proto/a2a";
import type * as types from "@a2a-js/sdk"
import type { Struct } from "./proto/google/protobuf/struct";



export function structToObject(struct: Struct): any {
    // Convert protobuf Struct to plain object
    const result: any = {};
    if (struct.fields) {
        for (const [key, value] of Object.entries(struct.fields)) {
            result[key] = valueToObject(value);
        }
    }
    return result;
}

export function valueToObject(value: any): any {
    if (!value || !value.kind) return null;

    const kind = value.kind;
    if (!kind || !kind.oneofKind) return null;

    switch (kind.oneofKind) {
        case "nullValue":
            return null;
        case "numberValue":
            return kind.numberValue;
        case "stringValue":
            return kind.stringValue;
        case "boolValue":
            return kind.boolValue;
        case "structValue":
            return structToObject(kind.structValue);
        case "listValue":
            return (
                kind.listValue?.values?.map((v: any) => valueToObject(v)) || []
            );
        default:
            return null;
    }
}


export const convertFileToInternal = (val: protoA2a.FilePart): types.FileWithBytes | types.FileWithUri => {

    if (val.file.oneofKind === "fileWithUri") {
            return {
                uri: val.file.fileWithUri,
                mimeType: val.mimeType,
                // TODO: name not exposed in GRPC API
                name: undefined
            }
            
        } else if (val.file.oneofKind === "fileWithBytes") {
            return {
                bytes: Buffer.from(val.file.fileWithBytes).toString("base64"),
                mimeType: val.mimeType,
                // TODO: name not exposed in GRPC API
                name: undefined
            }
        }
        throw new Error("Invalid file part type");
}


export const convertPartToInternal = (val: protoA2a.Part): types.Part => {
    if(val.part.oneofKind == "text") {
        return {
            kind: "text",
            text: val.part.text
        }
    }
    else if(val.part.oneofKind == "file") {
        return {
            kind: "file",
            file: convertFileToInternal(val.part.file)
        }
    }
    else if(val.part.oneofKind == "data") {
        if(val.part.data.data == null) {
            throw new Error('val.part.data.data must be set')
        }
        return {
            kind: 'data',
            data: structToObject(val.part.data.data)

        }
    }
    else {
        throw new Error("oneOfKind must be text, file, data")
    }
}


export const convertRoleToInternal = (val: protoA2a.Role): "agent" | "user"=> {
    switch(val) {
        case protoA2a.Role.AGENT: {
            return "agent"
        }
        case protoA2a.Role.USER: {
            return "user"
        }
        default: {
            throw new Error("role must be specified.")
        }
    }
}


export const convertToInternalSendMessageRequest = (val: protoA2a.SendMessageRequest, referenceTaskIds?: string[]): types.Message => {
     if (val.request == null) {
        throw new Error('val.request is required')
    }

    return {
        contextId: val.request.contextId,
        extensions: val.request.extensions,
        kind: "message",
        messageId: val.request.messageId,
        metadata: val.request.metadata ? structToObject(val.request.metadata) : undefined,
        parts: val.request.content.map((part)=> convertPartToInternal(part)),
        // TODO: this seems wrong.
        referenceTaskIds: referenceTaskIds,
        role: convertRoleToInternal(val.request.role),
        taskId: val.request.taskId
        
    }
}


export const convertArtifactToInternal = (val: protoA2a.Artifact): types.Artifact => {
    return {
        artifactId: val.artifactId,
        description: val.description,
        extensions: val.extensions,
        metadata: val.metadata != null ? structToObject(val.metadata) : undefined,
        name: val.name,
        parts: val.parts.map((p)=> convertPartToInternal(p))
    }
}


export const convertMessageToInternal = (val: protoA2a.Message): types.Message => {
    return {
        contextId: val.contextId,
        extensions: val.extensions,
        kind: 'message',
        messageId: val.messageId,
        metadata: val.metadata ? structToObject(val.metadata) : undefined,
        parts: val.content.map((c)=> convertPartToInternal(c)),
        // TODO: GRPC API doesnt have reference task ID's
        referenceTaskIds: [],
        role: convertRoleToInternal(val.role),
        taskId: val.taskId


    }
}


export const convertTaskToInternal = (val: protoA2a.Task): types.Task => {

    if(val.status == null) { 
        throw new Error('val.status cant be null')
    }

    return {
        artifacts: val.artifacts.map((a)=> convertArtifactToInternal(a)),
        contextId: val.contextId,
        history: val.history.map((m)=> convertMessageToInternal(m)),
        id: val.id,
        kind: 'task',
        metadata: val.metadata != null ? structToObject(val.metadata) : undefined,
        status: convertTaskStatusToInternal(val.status)
    }
}


export const timestampToDate = ({ seconds, nanos }: { seconds: bigint; nanos: number }): Date => {
  const millis = Number(seconds) * 1000 + Math.floor(nanos / 1_000_000);
  return new Date(millis);
}


export const convertStateToInternal = (val: protoA2a.TaskState): types.TaskState => {
    switch(val) {
        case protoA2a.TaskState.AUTH_REQUIRED: {
            return 'auth-required'
        }
        case protoA2a.TaskState.CANCELLED: {
            return 'canceled'
        }
        case protoA2a.TaskState.COMPLETED: {
            return 'completed'
        }
        case protoA2a.TaskState.FAILED: {
            return 'failed'
        }
        case protoA2a.TaskState.REJECTED: {
            return 'rejected'
        }
        case protoA2a.TaskState.SUBMITTED: {
            return 'submitted'
        }
        case protoA2a.TaskState.UNSPECIFIED: {
            return 'unknown'
        }
        case protoA2a.TaskState.WORKING: {
            return 'working'
        }
        case protoA2a.TaskState.INPUT_REQUIRED: {
            return 'input-required'
        }
    }
}


export const convertTaskStatusToInternal = (val: protoA2a.TaskStatus): types.TaskStatus => {
    return {
        message: val.update != null ? convertMessageToInternal(val.update) : undefined,
        state: convertStateToInternal(val.state),
        timestamp: val.timestamp != null ? timestampToDate(val.timestamp).toISOString() : undefined
    }
}


export const convertToInternalExecutionRequest = (val: proto.AgentExecutorRequest): types.RequestContext => {
    if (val.request == null) {
        throw new Error('val.request is required')
    }

    // if (val.task == null) {
    //     throw new Error('val.task is required')
    // }


    return {
        userMessage: convertToInternalSendMessageRequest(val.request),
        taskId: val.taskId,
        contextId: val.contextId,
        referenceTasks: val.referenceTasks.map((task)=> convertTaskToInternal(task)),
        task: val.task != null ? convertTaskToInternal(val.task) : undefined
    }
}