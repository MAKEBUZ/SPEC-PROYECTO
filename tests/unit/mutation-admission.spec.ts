import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mutationScopes,resourceMutationQuery,admissionRejection} from '../../packages/document/src/operations/mutation-admission.js';
import {scopesConflict} from '../../packages/document/src/operations/scopes.js';
it('T061 uses the exact reviewed project children and rejects a changed scope',()=>{
 const id=randomUUID(),child=randomUUID(),account=randomUUID(),body={resourceId:id,scopeRevision:'a'.repeat(64)};
 const view={kind:'project',id,action:'trash',scopeRevision:body.scopeRevision,resources:[{kind:'project',id,name:'Project',state:'active',revision:'1'},{kind:'pattern',id:child,name:'Piece',state:'active',revision:'1'}],versions:0,files:0,bytes:0,blockers:[]};
 const scopes=mutationScopes(account,'trashProject',body,view);expect(scopes).toEqual([{kind:'project',id},{kind:'pattern',id:child}]);
 expect(scopesConflict(scopes,[{kind:'pattern',id:child}])).toBe(true);expect(scopesConflict(scopes,[{kind:'pattern',id:randomUUID()}])).toBe(false);
 expect(()=>mutationScopes(account,'trashProject',body,{...view,scopeRevision:'b'.repeat(64)})).toThrow('SCOPE_CHANGED');
 expect(resourceMutationQuery('updateProfile',{})).toBe(null);expect(mutationScopes(account,'updateProfile',{})).toEqual([{kind:'profile',id:account}]);
});
it('T061 does not classify storage failures or transport uncertainty as a safe preflight rejection',()=>{
 const id=randomUUID();expect(admissionRejection(Error('MUTATION_NOT_SENT'),id)?.status).toBe(409);
 expect(admissionRejection(Error('JOURNAL_SAVE_UNCONFIRMED'),id)).toBe(null);expect(admissionRejection(Error('network lost'),id)).toBe(null);
});
