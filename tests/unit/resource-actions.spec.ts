import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {parseAccountAction,parsePending} from '../../packages/contracts/src/account-actions.js';
import {resourceQuery,resourceRoute} from '../../packages/contracts/src/resource-actions.js';
it('binds resource routes to UUIDs and strips route parameters from the HTTP body',()=>{
 const resourceId=randomUUID(),operationId=randomUUID(),parsed=parseAccountAction({action:'purge',body:{resourceId,kind:'pattern',operationId,scopeRevision:'scope',confirmation:true,acknowledgePermanentLoss:true}});
 expect(parsed.route.path).toBe(`/trash/pattern/${resourceId}`);expect(parsed.body).toEqual({operationId,scopeRevision:'scope',confirmation:true,acknowledgePermanentLoss:true});
 expect(parsePending([{operationId,operationType:'purge',accountId:randomUUID()}])).toHaveLength(1);
});
it('rejects caller paths, account purges, missing acknowledgement and arbitrary query fields',()=>{
 for(const resourceId of ['../account','https://example.invalid',randomUUID()+'/files'])expect(()=>parseAccountAction({action:'restore',body:{resourceId,kind:'pattern',operationId:randomUUID(),expectedResourceRevision:'1',confirmation:true}})).toThrow();
 expect(()=>parseAccountAction({action:'purge',body:{resourceId:randomUUID(),kind:'account',operationId:randomUUID(),scopeRevision:'x',confirmation:true,acknowledgePermanentLoss:true}})).toThrow();
 expect(()=>parseAccountAction({action:'purge',body:{resourceId:randomUUID(),kind:'pattern',operationId:randomUUID(),scopeRevision:'x',confirmation:true}})).toThrow();
 expect(()=>resourceQuery('resourceScope',{kind:'account',id:randomUUID(),action:'delete-account'})).toThrow();
 expect(()=>resourceQuery('resourceList',{kind:'trash',path:'/account'})).toThrow();
});
it('encodes pagination and exposes restoration scope only through the fixed query route',()=>{
 expect(resourceQuery('resourceList',{kind:'trash',cursor:'a&kind=account'})).toBe('/trash?cursor=a%26kind%3Daccount');
 const id=randomUUID();expect(resourceQuery('resourceScope',{kind:'project',id,action:'restore'})).toBe(`/destructive-scope?kind=project&id=${id}&action=restore`);
 expect(resourceRoute('GET',resourceQuery('resourceScope',{kind:'project',id,action:'restore'}))).toBe(true);
 expect(resourceRoute('DELETE',`/trash/pattern/${id}`)).toBe(true);
 expect(resourceRoute('GET',resourceQuery('resourceList',{kind:'pattern',id,cursor:'abc.def'}))).toBe(true);
 expect(resourceRoute('GET',resourceQuery('resourceList',{kind:'project',cursor:'abc.def'}))).toBe(true);
 for(const path of ['/trash/../account','https://example.invalid/trash',`/trash/account/${id}`,`/trash/pattern/${id}?other=true`])expect(resourceRoute('DELETE',path)).toBe(false);
});
