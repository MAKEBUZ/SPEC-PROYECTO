import { it,expect } from 'vitest';
import { printLayout } from '../../packages/print/src/layout.js';
import {AlgebraicContext} from '../../packages/geometry/src/algebraic.js';
import {rational} from '../../packages/geometry/src/numeric.js';
it('uses algebraic extents at page boundaries even when doubles cannot distinguish them',()=>{
 const field=new AlgebraicContext(),epsilon=field.fromRational(rational(1n,2n**60n)),boundary=field.number(5590),height=field.number(2146);
 const input={mode:'tiled' as const,paper:'A4' as const,margin:10,width:5590,height:2146};
 expect(printLayout(input,{field,width:field.sub(boundary,epsilon),height}).pageCount).toBe(250);
 expect(printLayout(input,{field,width:boundary,height}).pageCount).toBe(250);
 expect(()=>printLayout(input,{field,width:field.add(boundary,epsilon),height})).toThrow('PAGE_LIMIT_EXCEEDED');
});
it('tiles A4 at 1:1 with exactly 10 mm overlap and counts both auxiliary pages',()=>{
  const result=printLayout({mode:'tiled',paper:'A4',margin:10,width:370,height:277});expect(result.mode).toBe('tiled');if(result.mode!=='tiled')throw new Error();
  expect(result.pageCount).toBe(4);expect(result.rows).toBe(1);expect(result.columns).toBe(2);expect(result.tiles.map(t=>t.x)).toEqual([0,180]);expect(result.tiles[0]).toMatchObject({row:1,column:1,width:190,height:277});expect(result.overlap).toBe(10);
});
it('accepts exactly 250 pages including auxiliary material and rejects the next tile',()=>{
  expect(printLayout({mode:'tiled',paper:'A4',margin:10,width:5590,height:2146}).pageCount).toBe(250);
  expect(()=>printLayout({mode:'tiled',paper:'A4',margin:10,width:5590+2**-30,height:2146})).toThrow('PAGE_LIMIT_EXCEEDED');
});
it('uses Letter dimensions and rejects margins that cannot fit the calibration square',()=>{
  const result=printLayout({mode:'tiled',paper:'Letter',margin:10,width:100,height:100});expect(result).toMatchObject({pageWidth:215.9,pageHeight:279.4,pageCount:3});
  expect(()=>printLayout({mode:'tiled',paper:'A4',margin:56,width:10,height:10})).toThrow('PRINTABLE_MARGIN_INVALID');
  expect(()=>printLayout({mode:'tiled',paper:'A4',margin:-1,width:10,height:10})).toThrow();
});
it('extends large-format paper with a separate lower auxiliary strip without rescaling pieces',()=>{
  const result=printLayout({mode:'large',paper:'A4',margin:10,width:10000,height:10000});expect(result.mode).toBe('large');if(result.mode!=='large')throw new Error();expect(result).toMatchObject({pageWidth:10020,pageHeight:10160,pieceOrigin:{x:10,y:10},auxiliary:{x:10,y:10010,height:140},scale:1});
  expect(()=>printLayout({mode:'large',paper:'A4',margin:10,width:10001,height:1})).toThrow('COMPOSITION_LIMIT_EXCEEDED');
});
it.each(['A4','Letter'] as const)('covers the entire composition in row order with viable %s margins',paper=>{
  for(const margin of [0,10,25,55])for(const [width,height] of [[1,1],[100,100],[380,520],[1000,900]]){
    const result=printLayout({mode:'tiled',paper,margin,width:width!,height:height!});
    if(result.mode!=='tiled')throw Error();
    expect(result.pageCount).toBe(result.tiles.length+2);
    const last=result.tiles.at(-1)!;
    expect(last.x+last.width).toBeGreaterThanOrEqual(width!);
    expect(last.y+last.height).toBeGreaterThanOrEqual(height!);
    for(const [index,tile] of result.tiles.entries()){
      expect(tile.page).toBe(index+3);
      expect(tile.row).toBe(Math.floor(index/result.columns)+1);
      expect(tile.column).toBe(index%result.columns+1);
      expect(tile.paperOrigin).toEqual({x:margin,y:margin});
      expect(tile.width+2*margin).toBeCloseTo(result.pageWidth,10);
      expect(tile.height+2*margin).toBeCloseTo(result.pageHeight,10);
      if(tile.column>1)expect(result.tiles[index-1]!.x+tile.width-tile.x).toBeCloseTo(10,10);
      if(tile.row>1)expect(result.tiles[index-result.columns]!.y+tile.height-tile.y).toBeCloseTo(10,10);
    }
  }
});
it('accepts the calibration boundary and keeps auxiliary content outside even tiny pieces',()=>{
  const boundary=printLayout({mode:'tiled',paper:'A4',margin:55,width:100,height:100});
  expect(boundary.pageCount).toBe(3);
  const large=printLayout({mode:'large',paper:'Letter',margin:0,width:0.001,height:0.001});
  if(large.mode!=='large')throw Error();
  expect(large.pageWidth).toBe(100);expect(large.auxiliary.y).toBe(0.001);
  expect(large.auxiliary.y+large.auxiliary.height).toBe(large.pageHeight);
});
it.each([NaN,Infinity,-Infinity,-1,0])('rejects invalid dimensions %s before allocating pages',width=>{
  expect(()=>printLayout({mode:'tiled',paper:'A4',margin:10,width,height:100})).toThrow();
});
