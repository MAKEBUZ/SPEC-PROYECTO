import type { DocumentActions } from './document-actions.js';
/** The actual scoped confirmation is a native dialog owned by main. */
export function DeleteLocalDocument({documents,disabled}:{documents:DocumentActions;disabled:boolean}){
  return <button disabled={disabled} onClick={()=>void documents.trash()}>Eliminar copia local</button>;
}
