import { LuGlobe, LuRadio, LuArrowLeftRight, LuNetwork } from "react-icons/lu";
import { GrGraphQl } from "react-icons/gr";
import { VscMcp } from "react-icons/vsc";
import type { IconType } from "react-icons";
import type { OasOperation } from "../../core/types";
export function protocolName(raw: Record<string, unknown>):string {
 for(const name of ["websocket","grpc","graphql","mcp"]) if(raw[`x-${name}`])return name;
 return typeof raw["x-protocol"]==="string"?raw["x-protocol"]:"http";
}
// Keep protocol identities aligned with the Debug navigator.
const protocolVisuals: Record<string, { icon: IconType; color: string }> = {
 http: { icon: LuGlobe, color: "var(--color-info)" },
 sse: { icon: LuRadio, color: "var(--color-teal)" },
 websocket: { icon: LuArrowLeftRight, color: "var(--color-warning)" },
 graphql: { icon: GrGraphQl, color: "var(--color-graphql)" },
 grpc: { icon: LuNetwork, color: "var(--color-accent-blue)" },
 mcp: { icon: VscMcp, color: "var(--color-secret)" },
};
export function ProtocolGlyph({protocol}:{protocol:string}) {
 const {icon: Icon, color} = protocolVisuals[protocol] ?? protocolVisuals.http;
 return <span title={protocol.toUpperCase()} aria-label={protocol.toUpperCase()} style={{display:"inline-flex",width:20,minWidth:20,flexShrink:0,alignItems:"center",justifyContent:"center",color}}><Icon size={16} aria-hidden="true"/></span>;
}
export function ProtocolDetails({operation}:{operation:OasOperation}) {
 const raw=operation.raw as Record<string,any>;
 const protocol=protocolName(raw), config=raw[`x-${protocol}`]||{};
 if(protocol==="http")return null;
 const messages=Array.isArray(config.messages)?config.messages.slice(0,100):[];
 const code=(value:unknown)=> typeof value==="string"?value.slice(0,65536):JSON.stringify(value,null,2)?.slice(0,65536);
 return <section className="pde-oas-protocol-details"><h3><ProtocolGlyph protocol={protocol}/> {protocol === "grpc" ? "Service definition" : protocol === "websocket" ? "Connection and messages" : protocol === "graphql" ? "GraphQL operation" : protocol === "mcp" ? "MCP server" : "Event stream"}</h3>
 {protocol==="websocket"&&<><code>{String(config.url||operation.path)}</code>{messages.map((message:any,index:number)=><details key={String(message?.id||index)} open={index===0}><summary>{String(message?.name||`Message ${index+1}`)} <small>{String(message?.type||"text")}</small></summary><div className="pde-oas-message-pair"><div><h4>Message</h4><pre>{code(message?.body||"")}</pre></div><div><h4>Response example</h4><pre>{code(message?.response||"No response example saved.")}</pre></div></div></details>)}{!messages.length&&<p>No saved message examples.</p>}</>}
 {protocol==="grpc"&&<><code>{String(config.address||"")}</code><dl><dt>Service</dt><dd>{String(config.service||"Not configured")}</dd><dt>Method</dt><dd>{String(config.method||"Not configured")}</dd><dt>Call type</dt><dd>{String(config.kind||config.callKind||"unary").replace(/_/g," ")}</dd><dt>Definition</dt><dd>{config.reflection?"Server reflection":"Protocol Buffers"}</dd></dl></>}
 {protocol==="graphql"&&<><code>{String(config.endpoint||operation.path)}</code><pre>{code(config.query||"Query not defined.")}</pre>{config.variables&&<pre>{code(config.variables)}</pre>}</>}
 {protocol==="mcp"&&<><dl><dt>Transport</dt><dd>{String(config.transport||"Streamable HTTP")}</dd><dt>Server</dt><dd><code>{String(config.endpoint||"")}</code></dd><dt>Method</dt><dd>{String(config.method||"tools/list")}</dd></dl>{config.params&&<pre>{code(config.params)}</pre>}</>}
 {protocol==="sse"&&<p>Server-sent events · text/event-stream</p>}
 </section>;
}
