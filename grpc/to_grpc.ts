import type * as types from "@a2a-js/sdk"
import type * as proto from "./proto/agent_executor";
import * as protoA2a from "./proto/a2a";
import type { Timestamp } from "./proto/google/protobuf/timestamp";
import type { Struct } from "./proto/google/protobuf/struct";


function objectToStruct(obj: any): Struct {
    // Convert plain object to protobuf Struct
    const fields: { [key: string]: any } = {};
    if (obj && typeof obj === "object") {
        for (const [key, value] of Object.entries(obj)) {
            fields[key] = objectToValue(value);
        }
    }
    return { fields };
}

function objectToValue(value: any): any {
    if (value === null || value === undefined) {
        return { kind: { oneofKind: "nullValue", nullValue: 0 } };
    }
    if (typeof value === "number") {
        return { kind: { oneofKind: "numberValue", numberValue: value } };
    }
    if (typeof value === "string") {
        return { kind: { oneofKind: "stringValue", stringValue: value } };
    }
    if (typeof value === "boolean") {
        return { kind: { oneofKind: "boolValue", boolValue: value } };
    }
    if (Array.isArray(value)) {
        return {
            kind: {
                oneofKind: "listValue",
                listValue: { values: value.map((v) => objectToValue(v)) },
            },
        };
    }
    if (typeof value === "object") {
        return {
            kind: {
                oneofKind: "structValue",
                structValue: objectToStruct(value),
            },
        };
    }
    return { kind: { oneofKind: "nullValue", nullValue: 0 } };
}

function dateToTimestamp(date: Date): Timestamp {
    const seconds = Math.floor(date.getTime() / 1000);
    const nanos = (date.getTime() % 1000) * 1000000;
    return { seconds: BigInt(seconds), nanos };
}


export function convertMessageToGrpc(message: types.Message): protoA2a.Message {
    return {
        messageId: message.messageId,
        contextId: message.contextId || "",
        taskId: message.taskId || "",
        role: message.role === "user" ? protoA2a.Role.USER : protoA2a.Role.AGENT,
        content: message.parts?.map((part) => convertPartToGrpc(part)) || [],
        metadata: message.metadata
            ? objectToStruct(message.metadata)
            : undefined,
        extensions: message.extensions || [],
    };
}

export function convertPartToGrpc(part: types.Part): protoA2a.Part {
    if (part.kind === "text") {
        const textPart = part as types.TextPart;
        return {
            part: {
                oneofKind: "text",
                text: textPart.text,
            },
        };
    } else if (part.kind === "file") {
        const filePart = part as types.FilePart;
        if ("uri" in filePart.file) {
            return {
                part: {
                    oneofKind: "file",
                    file: {
                        file: {
                            oneofKind: "fileWithUri",
                            fileWithUri: filePart.file.uri,
                        },
                        mimeType: filePart.file.mimeType || "",
                    },
                },
            };
        } else if ("bytes" in filePart.file) {
            return {
                part: {
                    oneofKind: "file",
                    file: {
                        file: {
                            oneofKind: "fileWithBytes",
                            fileWithBytes: Buffer.from(filePart.file.bytes, "base64"),
                        },
                        mimeType: filePart.file.mimeType || "",
                    },
                },
            };
        }
    } else if (part.kind === "data") {
        const dataPart = part as types.DataPart;
        return {
            part: {
                oneofKind: "data",
                data: {
                    data: objectToStruct(dataPart.data),
                },
            },
        };
    }

    throw new Error("Invalid part type");
}

export function convertTaskToGrpc(task: types.Task): protoA2a.Task {
    return {
        id: task.id,
        contextId: task.contextId,
        status: convertTaskStatusToGrpc(task.status),
        artifacts:
            task.artifacts?.map((artifact) =>
                convertArtifactToGrpc(artifact),
            ) || [],
        history: task.history?.map((msg) => convertMessageToGrpc(msg)) || [],
        metadata: task.metadata ? objectToStruct(task.metadata) : undefined,
    };
}

export function convertTaskStatusToGrpc(status: types.TaskStatus): protoA2a.TaskStatus {
    return {
        state: convertTaskStateToGrpc(status.state),
        update: status.message
            ? convertMessageToGrpc(status.message)
            : undefined,
        timestamp: status.timestamp
            ? dateToTimestamp(new Date(status.timestamp))
            : undefined,
    };
}

export function convertTaskStateToGrpc(state: types.TaskState): protoA2a.TaskState {
    const stateMap: Record<types.TaskState, protoA2a.TaskState> = {
        submitted: protoA2a.TaskState.SUBMITTED,
        working: protoA2a.TaskState.WORKING,
        "input-required": protoA2a.TaskState.INPUT_REQUIRED,
        completed: protoA2a.TaskState.COMPLETED,
        canceled: protoA2a.TaskState.CANCELLED,
        failed: protoA2a.TaskState.FAILED,
        rejected: protoA2a.TaskState.REJECTED,
        "auth-required": protoA2a.TaskState.AUTH_REQUIRED,
        unknown: protoA2a.TaskState.UNSPECIFIED,
    };
    return stateMap[state] || protoA2a.TaskState.UNSPECIFIED;
}

export function convertArtifactToGrpc(artifact: types.Artifact): protoA2a.Artifact {
    return {
        artifactId: artifact.artifactId,
        name: artifact.name || "",
        description: artifact.description || "",
        parts: artifact.parts?.map((part) => convertPartToGrpc(part)) || [],
        metadata: artifact.metadata
            ? objectToStruct(artifact.metadata)
            : undefined,
        extensions: artifact.extensions || [],
    };
}

export function convertEventToGrpc(
    event: types.Message | types.Task | types.TaskStatusUpdateEvent | types.TaskArtifactUpdateEvent,
): protoA2a.StreamResponse {
    if ("messageId" in event) {
        // It's a Message
        return {
            payload: {
                oneofKind: "msg",
                msg: convertMessageToGrpc(event as types.Message),
            },
        };
    } else if ("status" in event && "artifacts" in event) {
        // It's a Task
        return {
            payload: {
                oneofKind: "task",
                task: convertTaskToGrpc(event as types.Task),
            },
        };
    } else if ("status" in event) {
        // It's a TaskStatusUpdateEvent
        const statusEvent = event as types.TaskStatusUpdateEvent;
        return {
            payload: {
                oneofKind: "statusUpdate",
                statusUpdate: {
                    taskId: statusEvent.taskId,
                    contextId: statusEvent.contextId,
                    status: convertTaskStatusToGrpc(statusEvent.status),
                    final: statusEvent.final || false,
                    metadata: statusEvent.metadata
                        ? objectToStruct(statusEvent.metadata)
                        : undefined,
                },
            },
        };
    } else if ("artifact" in event) {
        // It's a TaskArtifactUpdateEvent
        const artifactEvent = event as types.TaskArtifactUpdateEvent;
        return {
            payload: {
                oneofKind: "artifactUpdate",
                artifactUpdate: {
                    taskId: artifactEvent.taskId,
                    contextId: artifactEvent.contextId,
                    artifact: convertArtifactToGrpc(artifactEvent.artifact),
                    append: artifactEvent.append || false,
                    lastChunk: artifactEvent.lastChunk || false,
                    metadata: artifactEvent.metadata
                        ? objectToStruct(artifactEvent.metadata)
                        : undefined,
                },
            },
        };
    }

    throw new Error("Unknown event type");
}