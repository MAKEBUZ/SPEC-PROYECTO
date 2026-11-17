let identifier:string|undefined;
/** Per running browsing context, deliberately not copied through sessionStorage. */
export function clientContextId(){return identifier??=crypto.randomUUID();}
