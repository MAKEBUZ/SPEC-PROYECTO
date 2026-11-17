import { rational, fromNumber, compare as compareRational } from './numeric.js';
import type { Rational, Sign } from './numeric.js';
import { RootField, rationals, isolateRoots, PolynomialError } from './polynomials.js';
import type { OrderedField, Root } from './polynomials.js';
import { OffsetCalculationError } from './joins.js';

type Raw=Rational|Raw[];
export interface Exact {readonly level:number;readonly raw:Raw;readonly owner:AlgebraicContext}
const rat=(v:Raw):Rational=>{if(Array.isArray(v))throw new OffsetCalculationError('ALGEBRAIC_REPRESENTATION');return v;};
const coefficients=(v:Raw):Raw[]=>{if(!Array.isArray(v))throw new OffsetCalculationError('ALGEBRAIC_REPRESENTATION');return v;};
const base:OrderedField<Raw>={rationalBase:true,zero:rationals.zero,one:rationals.one,fromRational:q=>q,
  add:(a,b)=>rationals.add(rat(a),rat(b)),sub:(a,b)=>rationals.sub(rat(a),rat(b)),
  mul:(a,b)=>rationals.mul(rat(a),rat(b)),div:(a,b)=>rationals.div(rat(a),rat(b)),sign:a=>rationals.sign(rat(a))};
function integerSqrt(n:bigint):bigint {
  if(n<2n)return n;let x=1n<<BigInt(Math.ceil(n.toString(2).length/2));
  while(true){const next=(x+n/x)/2n;if(next>=x)return x;x=next;}
}
/** A shared tower of exact real algebraic extensions. Values retain their
 * creation level, so adding a radical never invalidates previously built points.
 * This is derived working state, not part of the document serialization. */
export class AlgebraicContext implements OrderedField<Exact> {
  private readonly fields:OrderedField<Raw>[]=[base];
  private readonly definitions:(Root<Raw>|null)[]=[null];
  private readonly imported=new WeakMap<AlgebraicContext,Map<number,Exact>>();
  private readonly radicals:{radicand:Exact;root:Exact}[]=[];
  private readonly rationalRoots=new Map<string,Exact[]>();
  readonly zero=this.fromRational(rational(0n));readonly one=this.fromRational(rational(1n));
  fromRational(q:Rational):Exact{return {level:0,raw:q,owner:this};}
  number(n:number):Exact{return this.fromRational(fromNumber(n));}
  private value(level:number,raw:Raw):Exact {
    while(level>0&&Array.isArray(raw)&&raw.length<=1){
      if(!raw.length)return this.zero;
      raw=raw[0]!;level--;
    }
    return {level,raw,owner:this};
  }
  private raw(v:Exact,level:number):Raw {
    if(v.owner!==this||v.level>level)throw new OffsetCalculationError('ALGEBRAIC_CONTEXT_MISMATCH');
    let result=v.raw;for(let i=v.level;i<level;i++)result=[result];return result;
  }
  private binary(a:Exact,b:Exact,op:'add'|'sub'|'mul'|'div'):Exact {
    const level=Math.max(a.level,b.level),f=this.fields[level]!;
    return this.value(level,f[op](this.raw(a,level),this.raw(b,level)));
  }
  add(a:Exact,b:Exact):Exact{return this.binary(a,b,'add');}
  sub(a:Exact,b:Exact):Exact{return this.binary(a,b,'sub');}
  mul(a:Exact,b:Exact):Exact{return this.binary(a,b,'mul');}
  div(a:Exact,b:Exact):Exact{return this.binary(a,b,'div');}
  sign(a:Exact):Sign {this.raw(a,a.level);return this.fields[a.level]!.sign(a.raw);}
  square(a:Exact):Exact{return this.mul(a,a);}
  compare(a:Exact,b:Exact):Sign{
    // Rational ordering needs cross multiplication, not a reduced difference
    // and its GCD. Preserve context checks on this fast exact path.
    if(a.level===0&&b.level===0)return compareRational(rat(this.raw(a,0)),rat(this.raw(b,0)));
    return this.sign(this.sub(a,b));
  }
  private adjoin(root:Root<Raw>):Exact {
    const extension=new RootField(this.fields.at(-1)!,root);
    const f:OrderedField<Raw>={zero:extension.zero,one:extension.one,fromRational:q=>extension.fromRational(q),
      add:(a,b)=>extension.add(coefficients(a),coefficients(b)),sub:(a,b)=>extension.sub(coefficients(a),coefficients(b)),
      mul:(a,b)=>extension.mul(coefficients(a),coefficients(b)),div:(a,b)=>extension.div(coefficients(a),coefficients(b)),sign:a=>extension.sign(coefficients(a))};
    this.fields.push(f);this.definitions.push(root);return this.value(this.fields.length-1,extension.generator);
  }
  sqrt(a:Exact):Exact {
    const sign=this.sign(a);if(sign<0)throw new OffsetCalculationError('NEGATIVE_RADICAND');if(!sign)return this.zero;
    if(a.level===0){const r=rat(a.raw),n=integerSqrt(r.n),d=integerSqrt(r.d);if(n*n===r.n&&d*d===r.d)return this.fromRational(rational(n,d));}
    for(const cached of this.radicals){
      if(a.level===0&&cached.radicand.level===0){
        const ratio=rationals.div(rat(a.raw),rat(cached.radicand.raw)),n=integerSqrt(ratio.n),d=integerSqrt(ratio.d);
        if(n*n===ratio.n&&d*d===ratio.d)return this.mul(cached.root,this.fromRational(rational(n,d)));
      }
      if(this.compare(a,cached.radicand)===0)return cached.root;
    }
    let upper=rational(1n);
    while(this.compare(a,this.fromRational(rationals.mul(upper,upper)))>0)upper=rationals.mul(upper,rational(2n));
    const level=this.fields.length-1,f=this.fields[level]!,v=this.raw(a,level);
    const root=isolateRoots([f.sub(f.zero,v),f.zero,f.one],rational(0n),upper,f)[0]!;
    const result=this.adjoin(root);this.radicals.push({radicand:a,root:result});return result;
  }
  /** Import only the algebraic generators actually used by a value. Pair
   * elimination can run independently of unrelated corner-normal radicals. */
  import(value:Exact):Exact {
    if(value.owner===this)return value;
    const source=value.owner;
    let variables=this.imported.get(source);if(!variables){variables=new Map();this.imported.set(source,variables);}
    const convert=(level:number,raw:Raw):Exact=>{
      if(level===0)return this.fromRational(rat(raw));
      const c=coefficients(raw);if(!c.length)return this.zero;if(c.length===1)return convert(level-1,c[0]!);
      let variable=variables!.get(level);
      if(!variable){
        const definition=source.definitions[level]!;
        if(!definition)throw new OffsetCalculationError('ALGEBRAIC_DEFINITION_MISSING');
        if(rationals.sign(rationals.sub(definition.lower,definition.upper))===0)variable=this.fromRational(definition.lower);
        else {
          const roots=this.roots(definition.polynomial.map(v=>convert(level-1,v)),definition.lower,definition.upper);
          const selected=roots.filter(r=>this.compare(r,this.fromRational(definition.lower))>0&&this.compare(r,this.fromRational(definition.upper))<0);
          if(selected.length!==1)throw new OffsetCalculationError('ALGEBRAIC_IMPORT_NOT_ISOLATED');variable=selected[0]!;
        }
        variables!.set(level,variable);
      }
      let result=this.zero;for(let i=c.length-1;i>=0;i--)result=this.add(this.mul(result,variable),convert(level-1,c[i]!));return result;
    };
    return convert(value.level,value.raw);
  }
  roots(p:readonly Exact[],lo=rational(0n),hi=rational(1n)):Exact[] {
    if(rationals.sign(rationals.sub(lo,hi))>0)throw new PolynomialError('INVALID_ROOT_INTERVAL');
    let degree=p.length-1;while(degree>=0&&this.sign(p[degree]!)===0)degree--;
    if(degree<0)throw new PolynomialError('ZERO_POLYNOMIAL');
    if(degree===0)return [];
    const inRange=(t:Exact)=>this.compare(t,this.fromRational(lo))>=0&&this.compare(t,this.fromRational(hi))<=0;
    if(degree===1){const root=this.div(this.sub(this.zero,p[0]!),p[1]!);return inRange(root)?[root]:[];}
    if(degree===2){
      // Reject roots outside the requested interval before adjoining a radical
      // to an existing tower. Nearly linear binary64 curves can otherwise add
      // huge, irrelevant quadratic roots to every later margin calculation.
      if(p.slice(0,3).every(c=>c.owner===this&&c.level===0)&&!isolateRoots(p.slice(0,3).map(c=>rat(c.raw)),lo,hi,rationals).length)return [];
      const a=p[2]!,b=p[1]!,c=p[0]!,disc=this.sub(this.square(b),this.mul(this.number(4),this.mul(a,c))),sign=this.sign(disc);
      if(sign<0)return [];
      const d=this.sqrt(disc),den=this.mul(this.number(2),a),negativeB=this.sub(this.zero,b);
      const roots=[this.div(this.sub(negativeB,d),den)];if(sign)roots.push(this.div(this.add(negativeB,d),den));
      return roots.filter(inRange).sort((x,y)=>this.compare(x,y));
    }
    let key:string|undefined;
    if(p.length&&p.every(c=>c.owner===this&&c.level===0)){
      let n=p.length;while(n&&rationals.sign(rat(p[n-1]!.raw))===0)n--;
      if(n){const leading=rat(p[n-1]!.raw);key=`${lo.n}/${lo.d}:${hi.n}/${hi.d}:`+p.slice(0,n).map(c=>{const v=rationals.div(rat(c.raw),leading);return `${v.n}/${v.d}`;}).join(',');}
      if(key&&this.rationalRoots.has(key))return [...this.rationalRoots.get(key)!];
      if(key){
        const isolated=isolateRoots(p.slice(0,n).map(c=>rat(c.raw)),lo,hi,rationals);
        const values=isolated.map(root=>{
          if(rationals.sign(rationals.sub(root.lower,root.upper))===0)return this.fromRational(root.lower);
          const field=this.fields.at(-1)!;
          return this.adjoin({...root,polynomial:root.polynomial.map(c=>field.fromRational(c))});
        });
        this.rationalRoots.set(key,values);return [...values];
      }
    }
    const level=this.fields.length-1,f=this.fields[level]!,roots=isolateRoots(p.map(c=>this.raw(c,level)),lo,hi,f);
    const values=roots.map(root=>{
      if(rationals.sign(rationals.sub(root.lower,root.upper))===0)return this.fromRational(root.lower);
      const current=this.fields.length-1;
      const lifted=root.polynomial.map(c=>{let r=c;for(let i=level;i<current;i++)r=[r];return r;});
      return this.adjoin({...root,polynomial:lifted});
    });
    if(key)this.rationalRoots.set(key,values);return values;
  }
}
