export interface OperationScope {kind:string;id:string}
/** Membership is a dependency on a project, not an exclusive lock on all its
 * children. Two publications in different patterns remain independent. */
export function scopesConflict(left:readonly OperationScope[],right:readonly OperationScope[]):boolean {
 return left.some(a=>right.some(b=>{
  if(a.kind==='account'||b.kind==='account')return true;
  if(a.id!==b.id)return false;
  if(a.kind==='project-member'&&b.kind==='project-member')return false;
  return a.kind===b.kind||a.kind==='project'&&b.kind==='project-member'||a.kind==='project-member'&&b.kind==='project';
 }));
}
