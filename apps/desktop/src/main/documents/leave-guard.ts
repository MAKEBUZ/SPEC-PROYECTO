export type LeaveChoice='save'|'discard'|'cancel';
export interface LeaveContext {
  dirty():boolean;
  choose():Promise<LeaveChoice>;
  save():Promise<boolean>;
  leave():Promise<void>;
}
/** Used for normal close/new/open. A crash is handled by recovery instead. */
export class LeaveGuard {
  private busy=false;
  async run(context:LeaveContext):Promise<boolean>{
    if(this.busy)return false;this.busy=true;
    try{
      if(context.dirty()){
        const choice=await context.choose();if(choice==='cancel')return false;
        if(choice==='save'){
          try{if(!await context.save()||context.dirty())return false;}catch{return false;}
        }else if(choice!=='discard')return false;
      }
      await context.leave();return true;
    }finally{this.busy=false;}
  }
}
