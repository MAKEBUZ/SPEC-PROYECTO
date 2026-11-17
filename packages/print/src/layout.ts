import { fromNumber,rational,subtract,divide,compare,add,multiply } from '../../geometry/src/numeric.js';
import type {AlgebraicContext,Exact} from '../../geometry/src/algebraic.js';
interface ExactExtent {field:AlgebraicContext;width:Exact;height:Exact}
interface LayoutInput {mode:'large'|'tiled';paper:'A4'|'Letter';margin:number;width:number;height:number}
/** Layout in physical millimetres. Geometry validation must precede this
 * module; no scaling or shape repair occurs here. Exact rational division
 * avoids losing a required extra tile through floating-point rounding. */
export function printLayout(input:LayoutInput,extent?:ExactExtent){
  const {width,height,margin}=input;
  if(![width,height,margin].every(Number.isFinite)||width<=0||height<=0||margin<0||!['large','tiled'].includes(input.mode)||!['A4','Letter'].includes(input.paper))throw new Error('PRINTABLE_MARGIN_INVALID');
  if(extent){for(const value of [extent.width,extent.height]){if(extent.field.sign(value)<=0)throw Error('PRINTABLE_MARGIN_INVALID');if(extent.field.compare(value,extent.field.number(10000))>0)throw Error('COMPOSITION_LIMIT_EXCEEDED');}}
  else if(width>10000||height>10000)throw new Error('COMPOSITION_LIMIT_EXCEEDED');
  if(input.mode==='large'){
    const pageWidth=Math.max(width,100)+2*margin,pageHeight=height+140+2*margin;
    if(!Number.isFinite(pageWidth)||!Number.isFinite(pageHeight))throw new Error('PRINTABLE_MARGIN_INVALID');
    return {mode:'large' as const,scale:1 as const,pageCount:1,pageWidth,pageHeight,pieceOrigin:{x:margin,y:margin},auxiliary:{x:margin,y:margin+height,width:Math.max(width,100),height:140},calibration:{size:100}};
  }
  const pageWidth=input.paper==='A4'?210:215.9,pageHeight=input.paper==='A4'?297:279.4,printableWidth=pageWidth-2*margin,printableHeight=pageHeight-2*margin,overlap=10;
  if(printableWidth<100||printableHeight<100)throw new Error('PRINTABLE_MARGIN_INVALID');
  const count=(size:number,usable:number,exact?:Exact)=>{
    if(extent&&exact){
      // Never round the algebraic extent before deciding whether another tile
      // is required. 248 is the largest possible axis with two auxiliary pages.
      const step=subtract(fromNumber(usable),rational(10n));
      for(let n=1;n<=248;n++){const covered=add(fromNumber(usable),multiply(rational(BigInt(n-1)),step));if(extent.field.compare(exact,extent.field.fromRational(covered))<=0)return n;}
      throw Error('PAGE_LIMIT_EXCEEDED');
    }
    if(compare(fromNumber(size),fromNumber(usable))<=0)return 1;
    const n=divide(subtract(fromNumber(size),rational(10n)),subtract(fromNumber(usable),rational(10n)));return Number((n.n+n.d-1n)/n.d);
  };
  const columns=count(width,printableWidth,extent?.width),rows=count(height,printableHeight,extent?.height),pageCount=columns*rows+2;
  if(pageCount>250)throw new Error('PAGE_LIMIT_EXCEEDED');
  const tiles=Array.from({length:rows*columns},(_,i)=>{const row=Math.floor(i/columns),column=i%columns;return {page:i+3,row:row+1,column:column+1,x:column*(printableWidth-overlap),y:row*(printableHeight-overlap),width:printableWidth,height:printableHeight,paperOrigin:{x:margin,y:margin}};});
  return {mode:'tiled' as const,scale:1 as const,pageCount,pageWidth,pageHeight,rows,columns,overlap,calibrationPage:1,assemblyPage:2,calibration:{size:100},tiles};
}
