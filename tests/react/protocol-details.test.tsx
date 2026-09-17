import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProtocolDetails } from "../../src/react/components/ProtocolDetails";
import { parseOperations } from "../../src/core";

describe("protocol message documentation", () => {
  it("keeps named messages and response examples paired, rendering content as text", () => {
    const operation = parseOperations({ openapi: "3.2.0", info: {title:"WS",version:"1"}, paths:{"/ws":{get:{responses:{},"x-websocket":{url:"ws://localhost",messages:[{id:"a",name:"Greeting",type:"text",body:"hello",response:"<script>alert(1)</script>"},{id:"b",name:"Ping",body:"ping"}]}}}}})[0];
    const {container} = render(<ProtocolDetails operation={operation}/>);
    expect(screen.getByText("Greeting")).toBeTruthy();
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelectorAll("details")).toHaveLength(2);
    expect(screen.getByText("No response example saved.")).toBeTruthy();
  });
});
