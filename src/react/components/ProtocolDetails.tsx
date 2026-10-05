import type { ReactNode } from "react";
import { LuGlobe, LuRadio, LuArrowLeftRight, LuNetwork } from "react-icons/lu";
import { GrGraphQl } from "react-icons/gr";
import { VscMcp } from "react-icons/vsc";
import type { IconType } from "react-icons";
import type { OasOperation } from "../../core/types";
export function protocolName(raw: Record<string, unknown>):string {
 if (typeof raw["x-protocol"] === "string" && ["http", "sse", "websocket", "graphql", "grpc", "mcp", "a2a"].includes(raw["x-protocol"])) return raw["x-protocol"];
 for(const name of ["websocket","grpc","graphql","mcp","a2a"]) if(raw[`x-${name}`])return name;
 const responses = raw.responses;
 if (responses && typeof responses === "object") {
   for (const response of Object.values(responses)) {
     const content = response && typeof response === "object" ? (response as Record<string, unknown>).content : undefined;
     if (content && typeof content === "object" && Object.keys(content).some(type => type.split(";")[0].trim().toLowerCase() === "text/event-stream")) return "sse";
   }
 }
 return "http";
}
// Keep protocol identities aligned with the Debug navigator.
const protocolVisuals: Record<string, { icon: IconType; color: string }> = {
 http: { icon: LuGlobe, color: "var(--color-info)" },
 sse: { icon: LuRadio, color: "var(--color-teal)" },
 websocket: { icon: LuArrowLeftRight, color: "var(--color-warning)" },
 graphql: { icon: GrGraphQl, color: "var(--color-graphql)" },
 grpc: { icon: LuNetwork, color: "var(--color-accent-blue)" },
 a2a: { icon: LuNetwork, color: "var(--color-teal)" },
 mcp: { icon: VscMcp, color: "var(--color-secret)" },
};
export function ProtocolGlyph({protocol}:{protocol:string}) {
 const {icon: Icon, color} = protocolVisuals[protocol] ?? protocolVisuals.http;
 return <span title={protocol.toUpperCase()} aria-label={protocol.toUpperCase()} style={{display:"inline-flex",width:20,minWidth:20,flexShrink:0,alignItems:"center",justifyContent:"center",color}}><Icon size={16} aria-hidden="true"/></span>;
}
type RecordValue = Record<string, any>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
function Example({ title, value }: { title: string; value: unknown }) {
 if (value === undefined || value === null || value === "") return null;
 return <details open><summary>{title}</summary><pre>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre></details>;
}
export function ProtocolDetails({operation, renderSchema}:{operation:OasOperation; renderSchema:(schema:any)=>ReactNode}) {
 const raw=operation.raw as RecordValue;
 const protocol=protocolName(raw), config=record(raw[`x-${protocol}`]);
 if(protocol==="http")return null;
 const messages=Array.isArray(config.messages)?config.messages:[];
 const request = config.variablesSchema ?? config.argumentsSchema ?? config.requestSchema ?? config.inputSchema;
 const eventMedia = Object.values(record(raw.responses)).map((value) => record(record(record(value).content)["text/event-stream"])).find((media) => media.itemSchema !== undefined || media.schema !== undefined);
 const response = config.responseSchema ?? config.outputSchema ?? eventMedia?.itemSchema ?? eventMedia?.schema;
 const contract = (title:string, schema:unknown) => <section className="pde-oas-section"><h4>{title}</h4>{schema !== undefined ? renderSchema(schema) : <p className="pde-oas-contract-empty">Not documented. Define the fields, required values and examples in the specification.</p>}</section>;
 return <section className="pde-oas-protocol-details"><h3><ProtocolGlyph protocol={protocol}/> {protocol === "grpc" ? "Service definition" : protocol === "websocket" ? "Connection and messages" : protocol === "graphql" ? "GraphQL operation" : protocol === "a2a" ? "A2A agent" : protocol === "mcp" ? "MCP server" : "Event stream"}</h3>
 {protocol==="websocket"&&<><code>{String(config.url||operation.path)}</code><p>Bidirectional connection. Client messages and server messages have separate contracts; captured examples do not define required fields.</p>{config.subprotocols && <Example title="Subprotocols" value={config.subprotocols}/>}</>}
 {protocol==="grpc"&&<><code>{String(config.address||operation.path)}</code><dl><dt>Service</dt><dd>{String(config.service||"Not configured")}</dd><dt>Method</dt><dd>{String(config.method||"Not configured")}</dd><dt>Call type</dt><dd>{String(config.kind||config.callKind||"unary").replace(/_/g," ")}</dd><dt>Definition</dt><dd>{config.reflection?"Server reflection":"Protocol Buffers"}</dd></dl><Example title="Protocol Buffers definition" value={config.proto || config.protoText}/></>}
 {protocol==="graphql"&&<><code>{String(config.endpoint||operation.path)}</code><Example title="Operation" value={config.query}/><Example title="Variables example" value={config.variables}/><p>Responses may contain data, errors, or both. HTTP success does not imply GraphQL success.</p></>}
 {protocol==="a2a"&&<><dl><dt>Version</dt><dd>{String(config.version||"1.0")}</dd><dt>Binding</dt><dd>{String(config.binding||"JSONRPC")}</dd><dt>Endpoint</dt><dd><code>{String(config.endpoint||operation.path)}</code></dd><dt>Method</dt><dd>{String(config.method||"SendMessage")}</dd><dt>Agent Card URL</dt><dd><code>{String(config.agentCardUrl||"Not configured")}</code></dd></dl><p>Agent-to-agent messages, tasks and artifacts. An HTTP success may contain a JSON-RPC error. Stream disconnect does not cancel the remote task.</p><Example title="Agent Card" value={config.agentCard}/><Example title="Request example" value={config.example}/></>}
 {protocol==="mcp"&&<><dl><dt>Transport</dt><dd>{String(config.transport||"Streamable HTTP")}</dd><dt>Server</dt><dd><code>{String(config.endpoint||config.command||operation.path)}</code></dd><dt>Method</dt><dd>{String(config.method||"tools/list")}</dd></dl><Example title="Arguments / parameters example" value={config.arguments ?? config.params}/></>}
 {protocol==="sse"&&<p>Server-sent events · text/event-stream · server → client. Event payloads are described below; the request parameters configure the stream.</p>}
 {<div className="pde-oas-contracts">
 {contract(protocol==="websocket"?"Client → server message fields":protocol==="graphql"?"Variables schema":"Request schema", request)}
 {contract(protocol==="websocket"?"Server → client message fields":protocol==="graphql"?"Result schema":protocol==="sse"?"Event payload schema":"Response schema", response)}
 </div>}
 {messages.map((value:unknown,index:number)=>{const message=record(value);return <details key={String(message.id||index)} open={index===0}><summary>{String(message.name||`Message ${index+1}`)} <small>{String(message.type||"text")}</small></summary>
 {message.description && <p>{String(message.description)}</p>}
 {message.requestSchema !== undefined && contract("Message request schema", message.requestSchema)}
 {message.responseSchema !== undefined && contract("Message response schema", message.responseSchema)}
 <Example title="Sent message example" value={message.body}/><Example title="Received message example" value={message.response}/>
 </details>})}
 </section>;
}
