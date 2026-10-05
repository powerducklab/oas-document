import { protocolName } from "../../src/react/components/ProtocolDetails";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProtocolDetails } from "../../src/react/components/ProtocolDetails";
import { parseOperations } from "../../src/core";

describe("protocol message documentation", () => {
  it("keeps named messages and response examples paired, rendering content as text", () => {
    const operation = parseOperations({ openapi: "3.2.0", info: {title:"WS",version:"1"}, paths:{"/ws":{get:{responses:{},"x-websocket":{url:"ws://localhost",messages:[{id:"a",name:"Greeting",type:"text",body:"hello",response:"<script>alert(1)</script>"},{id:"b",name:"Ping",body:"ping"}]}}}}})[0];
    const {container} = render(<ProtocolDetails operation={operation} renderSchema={(schema) => <pre>{JSON.stringify(schema)}</pre>}/>);
    expect(screen.getByText("Greeting")).toBeTruthy();
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelectorAll("details").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/Not documented/)).toHaveLength(2);
  });
});

it.each(["websocket", "graphql", "grpc", "mcp", "sse", "a2a"])("renders %s request and response contracts independently", (protocol) => {
 const raw = { responses: {}, "x-protocol": protocol, [`x-${protocol}`]: {
   requestSchema: { type: "object", properties: { inputField: { type: "string" } } },
   responseSchema: { type: "object", properties: { outputField: { type: "integer" } } },
 } };
 const operation = parseOperations({ openapi: "3.2.0", info: { title: "Contracts", version: "1" }, paths: { "/operation": { post: raw } } })[0];
 render(<ProtocolDetails operation={operation} renderSchema={schema => <pre>{JSON.stringify(schema)}</pre>}/>);
 expect(screen.getByText(/inputField/)).toBeTruthy();
 expect(screen.getByText(/outputField/)).toBeTruthy();
});

it("renders A2A version, method and agent metadata as text",()=>{
 const operation=parseOperations({openapi:"3.2.0",info:{title:"Agent",version:"1"},paths:{"/a2a":{post:{responses:{},"x-a2a":{version:"1.0",method:"GetTask",endpoint:"https://agent.example/rpc",agentCard:{name:"<script>unsafe</script>"}}}}}})[0];
 const {container}=render(<ProtocolDetails operation={operation} renderSchema={()=>null}/>);
 expect(screen.getByText("GetTask")).toBeTruthy();expect(screen.getByText("1.0")).toBeTruthy();expect(container.querySelector("script")).toBeNull();
});


it("detects SSE from response media types without serializing response schemas", () => {
  const schema = { description: "Example mentions text/event-stream", toJSON() { throw new Error("schema traversal"); } };
  expect(protocolName({ responses: { "200": { content: { "application/json": { schema } } } } })).toBe("http");
  expect(protocolName({ responses: { "200": { content: { "text/event-stream; charset=utf-8": { schema } } } } })).toBe("sse");
});
