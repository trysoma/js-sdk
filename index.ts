import * as grpc from "@grpc/grpc-js";
import type * as types from "@a2a-js/sdk"
import { agentExecutorDefinition, type IAgentExecutor } from "./grpc/proto/agent_executor.grpc-server";
import type { StreamResponse } from "./grpc/proto/a2a";
import type * as proto from "./grpc/proto/agent_executor";
import * as protoA2a from "./grpc/proto/a2a";
import type { Struct } from "./grpc/proto/google/protobuf/struct";
import { DefaultExecutionEventBus } from "@a2a-js/sdk";
import type { AgentExecutionEvent } from "@a2a-js/sdk/build/src/server/events/execution_event_bus";
import { convertToInternalExecutionRequest } from "./grpc/to_internal";
import { convertEventToGrpc } from "./grpc/to_grpc";


interface ServerOptions {
    agentExecutor: types.AgentExecutor
}


export const createServer = (opts: ServerOptions)=> {
    const server = new grpc.Server();
    const grpcService: IAgentExecutor ={
        execute:  (call: grpc.ServerWritableStream<proto.AgentExecutorRequest, protoA2a.StreamResponse>): void=> {
            const request = call.request;
            let eventBus = new DefaultExecutionEventBus();

            const params = convertToInternalExecutionRequest(request)

            const eventHandler = (event: AgentExecutionEvent)=> {
                console.log('I should be writing this event back to server now...')
                console.log(event)
                call.write(
                    convertEventToGrpc(event)
                )
            }
            eventBus.addListener("event", eventHandler)

            call.on('end', () => {
                eventBus.removeListener("event", eventHandler);
            });

            call.on('error', () => {
                eventBus.removeListener("event", eventHandler);
            });

            opts.agentExecutor.execute(params, eventBus)


        }
    }
    server.addService(agentExecutorDefinition, grpcService);
    
    if(process.env.PORT == null) {
        throw new Error('PORT must be set')
    }

    let port = process.env.PORT

    server.bindAsync(
        `0.0.0.0:${port}`,
        grpc.ServerCredentials.createInsecure(),
        (err, port) => {
            if (err) {
                console.error("Failed to bind server:", err);
                return;
            }
            console.log(`A2A gRPC server listening on port ${port}`);
        },
    );
}