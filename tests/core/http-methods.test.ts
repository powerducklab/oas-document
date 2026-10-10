import {it,expect} from 'vitest';
import {parseOperations} from '../../src/core/operations';
const operation = {responses:{'200':{description:'OK',content:{'application/json':{schema:{type:'object',properties:{id:{type:'string'}}}}}}}};
const spec: any = {openapi:'3.2.0',info:{title:'Methods',version:'1'},servers:[{url:'https://example.test'}],paths:{'/items':{trace:operation,query:operation,additionalOperations:{PROPFIND:operation,'CUSTOM-VERB':operation}}}};
const expected = ['trace','query','propfind','custom-verb'];
it('preserves QUERY, TRACE and custom operations across consumers',()=>{
expect(parseOperations(spec).map(op=>op.method)).toEqual(expected);
});
