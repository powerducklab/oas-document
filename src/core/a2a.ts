import type { OpenApiDocument, OasOperation } from './types';

/** Adapt the documented JSON-RPC binding to HTTP for code generation only. */
export function a2aCodegenInput(document: OpenApiDocument, operation: OasOperation, serverUrl?: string) {
  const raw = operation.raw as Record<string, any>;
  if (raw['x-protocol'] !== 'a2a' && !raw['x-a2a']) return { document, path: operation.path, method: operation.method, serverUrl };
  const config = raw['x-a2a'] ?? {};
  if (config.binding && !['JSONRPC','HTTP+JSON'].includes(config.binding)) throw new Error('Use the native gRPC example for this binding.');
  if (config.binding === 'HTTP+JSON' && config.version === '0.3') throw new Error('REST requires A2A 1.0.');
  const version = config.version ?? '1.0';
  if (version !== '1.0' && version !== '0.3') throw new Error('Unsupported A2A version');
  const endpoint = new URL(config.endpoint || operation.path, serverUrl || undefined);
  if (!['https:', 'http:'].includes(endpoint.protocol)) throw new Error('Invalid A2A endpoint');
  const method = config.method || (version === '0.3' ? 'message/send' : 'SendMessage');
  const send = ['SendMessage', 'SendStreamingMessage', 'message/send', 'message/stream'].includes(method);
  const task = ['GetTask', 'CancelTask', 'SubscribeToTask', 'tasks/get', 'tasks/cancel', 'tasks/resubscribe'].includes(method);
  const envelope = config.example ?? raw.requestBody?.content?.['application/json']?.example ?? {
    jsonrpc: '2.0', id: 'request-1', method,
    params: send ? { message: { messageId: 'message-1', role: version === '0.3' ? 'user' : 'ROLE_USER', parts: [version === '0.3' ? { kind: 'text', text: 'Hello' } : { text: 'Hello' }], ...(version === '0.3' ? { kind: 'message' } : {}) } } : task ? { id: 'task-id' } : {},
  };
  const example = config.binding === 'HTTP+JSON' ? (envelope.jsonrpc ? envelope.params : envelope) : envelope;
  const request = a2aHttpRequest(endpoint.toString(), example, config);
  const target = new URL(request.url);
  const streaming = ['SendStreamingMessage', 'SubscribeToTask', 'message/stream', 'tasks/resubscribe'].includes(config.binding === 'HTTP+JSON' ? method : example.method);
  const parameters = (raw.parameters ?? []).filter((p: any) => !(p.in === 'header' && ['accept', 'a2a-version', 'content-type'].includes(String(p.name).toLowerCase())));
  for (const [name, value] of [['Content-Type', 'application/json'], ['A2A-Version', version], ['Accept', streaming ? 'text/event-stream' : 'application/json']]) parameters.push({ name, in: 'header', required: true, schema: { type: 'string', default: value }, example: value });
  for (const [name, value] of target.searchParams) parameters.push({ name, in: 'query', schema: { type: 'string', default: value }, example: value });
  return {
    document: { ...document, paths: { [target.pathname]: { [request.method.toLowerCase()]: { ...raw, 'x-protocol': 'http', 'x-a2a': undefined, servers: [{ url: endpoint.origin }], parameters, requestBody: request.body === undefined ? undefined : { required: true, content: { 'application/json': { schema: { type: 'object' }, example:request.body } } } } } } } as OpenApiDocument,
    path: target.pathname, method: request.method.toLowerCase() as OasOperation['method'], serverUrl: endpoint.origin,
  };
}

/** HTTP binding projection. Path identifiers are encoded separately; the endpoint may contain a mount path. */
export function a2aHttpRequest(endpoint: string, body: any, config: Record<string, any>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid A2A request.");
  const url = new URL(endpoint);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Use an HTTP(S) endpoint without embedded credentials.");
  if (!config.binding || config.binding === "JSONRPC") return { url: url.toString(), method: "POST", body };
  if (config.binding !== "HTTP+JSON") throw new Error("gRPC requires the desktop transport.");
  if (url.search || url.hash) throw new Error("REST base endpoint must not contain a query or fragment.");
  const id = (key: string) => {
    if (typeof body[key] !== "string" || !body[key].trim()) throw new Error(`A2A ${config.method} requires ${key}.`);
    return encodeURIComponent(body[key]);
  };
  let path = "", method = "POST", payload: any = body;
  switch (config.method) {
    case "SendMessage": path = "/message:send"; break;
    case "SendStreamingMessage": path = "/message:stream"; break;
    case "GetTask": path = `/tasks/${id("id")}`; method = "GET"; break;
    case "ListTasks": path = "/tasks"; method = "GET"; break;
    case "CancelTask": path = `/tasks/${id("id")}:cancel`; payload = undefined; break;
    // The 1.0 HTTP binding (and official JS SDK) uses POST for subscription.
    case "SubscribeToTask": path = `/tasks/${id("id")}:subscribe`; payload = undefined; break;
    case "GetExtendedAgentCard": path = "/extendedAgentCard"; method = "GET"; break;
    case "CreateTaskPushNotificationConfig": path = `/tasks/${id("taskId")}/pushNotificationConfigs`; break;
    case "ListTaskPushNotificationConfigs": path = `/tasks/${id("taskId")}/pushNotificationConfigs`; method = "GET"; break;
    case "GetTaskPushNotificationConfig": case "DeleteTaskPushNotificationConfig":
      path = `/tasks/${id("taskId")}/pushNotificationConfigs/${id("id")}`;
      method = config.method.startsWith("Delete") ? "DELETE" : "GET"; break;
    default: throw new Error("Unsupported A2A REST method.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "") + (body.tenant ? "/" + encodeURIComponent(body.tenant) : "") + path;
  if (method === "GET") {
    const keys = config.method === "GetTask" ? ["historyLength"] : config.method === "ListTasks" ? ["contextId", "status", "pageSize", "pageToken", "historyLength", "statusTimestampAfter", "includeArtifacts"] : config.method === "ListTaskPushNotificationConfigs" ? ["pageSize", "pageToken"] : [];
    for (const key of keys) if (body[key] !== undefined) {
      if (!["string", "number", "boolean"].includes(typeof body[key])) throw new Error(`Invalid query parameter: ${key}`);
      url.searchParams.set(key, String(body[key]));
    }
  }
  return { url: url.toString(), method, body: ["GET", "DELETE"].includes(method) ? undefined : payload };
}
