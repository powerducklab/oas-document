import { describe, it, expect } from 'vitest';
import { generate, registerBuiltins } from '@powerduck/openapi-codegen';
import { a2aCodegenInput } from '../../src/core/a2a';
registerBuiltins();
describe('A2A code examples', () => {
  it.each(['1.0', '0.3'])('uses the actual endpoint, version and JSON-RPC body (%s)', version => {
    const raw = { 'x-protocol': 'a2a', 'x-a2a': {version, endpoint:'https://agent.example/rpc?tenant=demo'}, responses:{'200':{description:'OK'}} };
    const document:any={openapi:'3.2.0',info:{title:'Agent',version:'1'},paths:{'/logical':{post:raw}}};
    const before=JSON.stringify(document);
    const input=a2aCodegenInput(document,{raw,path:'/logical',method:'post'} as any, '');
    const curl=generate({...input,language:'shell',client:'curl'});
    expect(curl).toContain('https://agent.example/rpc');
    expect(curl).toContain('tenant=demo');
    expect(curl).toContain('A2A-Version');
    expect(curl).toContain('Content-Type: application/json');
    expect(curl).toContain(version === '0.3' ? 'message/send' : 'SendMessage');
    expect(curl).toContain(version === '0.3' ? 'user' : 'ROLE_USER');
    expect(JSON.stringify(document)).toBe(before);
  });
  it('uses the saved request example to determine streaming',()=>{
    const raw={'x-a2a':{endpoint:'http://localhost:9999/',example:{jsonrpc:'2.0',id:'r',method:'SubscribeToTask',params:{id:'task'}}}};
    const input=a2aCodegenInput({} as any,{raw,path:'/a2a',method:'post'} as any);
    expect(JSON.stringify(input.document)).toContain('text/event-stream');
  });
  it('does not misrepresent unsupported bindings as HTTP',()=>{
    expect(()=>a2aCodegenInput({} as any,{raw:{'x-a2a':{binding:'GRPC'}},path:'/a2a',method:'post'} as any)).toThrow('native gRPC');
  });
});

it('REST projection uses task path/query without a JSON-RPC envelope',()=>{
 const operation:any={path:'/a2a',method:'post',raw:{'x-protocol':'a2a','x-a2a':{version:'1.0',binding:'HTTP+JSON',endpoint:'https://agent.test/rest',method:'GetTask',example:{id:'a/b',historyLength:0}}}};
 const input=a2aCodegenInput({} as any,operation);
 expect(input.path).toBe('/rest/tasks/a%2Fb'); expect(input.method).toBe('get');
 expect((input.document.paths as any)[input.path].get.requestBody).toBeUndefined();
 expect((input.document.paths as any)[input.path].get.parameters).toContainEqual(expect.objectContaining({name:'historyLength',example:'0'}));
});

import {a2aHttpRequest} from '../../src/core/a2a';
it.each([
 ['SendMessage','POST','/message:send',{}],
 ['SendStreamingMessage','POST','/message:stream',{}],
 ['GetTask','GET','/tasks/task',{id:'task'}],
 ['CancelTask','POST','/tasks/task:cancel',{id:'task'}],
 ['SubscribeToTask','POST','/tasks/task:subscribe',{id:'task'}],
 ['ListTasks','GET','/tasks',{}],
 ['GetExtendedAgentCard','GET','/extendedAgentCard',{}],
 ['CreateTaskPushNotificationConfig','POST','/tasks/task/pushNotificationConfigs',{taskId:'task'}],
 ['ListTaskPushNotificationConfigs','GET','/tasks/task/pushNotificationConfigs',{taskId:'task'}],
 ['GetTaskPushNotificationConfig','GET','/tasks/task/pushNotificationConfigs/config',{taskId:'task',id:'config'}],
 ['DeleteTaskPushNotificationConfig','DELETE','/tasks/task/pushNotificationConfigs/config',{taskId:'task',id:'config'}],
])('projects %s without losing its mount or tenant', (method,verb,suffix,body)=>{
 const request=a2aHttpRequest('https://agent.test/mount/',{...body,tenant:'a/b'},{version:'1.0',binding:'HTTP+JSON',method});
 expect(request.method).toBe(verb);expect(request.url).toBe('https://agent.test/mount/a%2Fb'+suffix);
 if(verb==='GET'||verb==='DELETE')expect(request.body).toBeUndefined();
});
it('keeps false/zero query fields and rejects missing resource IDs or ambiguous base URLs',()=>{
 const request=a2aHttpRequest('https://agent.test',{pageSize:0,includeArtifacts:false},{binding:'HTTP+JSON',method:'ListTasks'});
 expect(request.url).toContain('pageSize=0');expect(request.url).toContain('includeArtifacts=false');
 expect(()=>a2aHttpRequest('https://agent.test',{}, {binding:'HTTP+JSON',method:'GetTask'})).toThrow('requires id');
 expect(()=>a2aHttpRequest('https://agent.test?x=y',{}, {binding:'HTTP+JSON',method:'ListTasks'})).toThrow('query');
});
