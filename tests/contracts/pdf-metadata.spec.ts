import {it,expect} from 'vitest';
import {DTO} from '../../packages/contracts/src/http-dto.js';
it('requires finite positive page dimensions, scale 1:1 and one to 250 pages',()=>{
 const valid={exportProfileId:'patronaje-pdf-1',scale:1,pages:[{widthMm:210,heightMm:297}]};expect(DTO.PdfMeasurement.parse(valid)).toEqual(valid);
 for(const invalid of [{...valid,scale:2},{...valid,pages:[]},{...valid,pages:Array.from({length:251},()=>valid.pages[0])},{...valid,pages:[{widthMm:0,heightMm:297}]},{...valid,pages:[{widthMm:Infinity,heightMm:297}]}])expect(()=>DTO.PdfMeasurement.parse(invalid)).toThrow();
 expect(DTO.PdfMeasurement.parse({...valid,pages:Array.from({length:250},()=>valid.pages[0])}).pages).toHaveLength(250);
});
