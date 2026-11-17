// Narrow declarations for the Three.js surface used by the CAD renderer.
declare module 'three' {
  export class Vector3 {constructor(x?:number,y?:number,z?:number);}
  export class BufferGeometry {setFromPoints(points:Vector3[]):this;dispose():void;}
  export class LineBasicMaterial {constructor(parameters:{color:number});dispose():void;}
  export class Line {constructor(geometry:BufferGeometry,material:LineBasicMaterial);}
  export class Scene {add(object:Line):void;}
  export class OrthographicCamera {constructor(left:number,right:number,top:number,bottom:number,near:number,far:number);position:{z:number};}
  export class WebGLRenderer {constructor(parameters:{canvas:HTMLCanvasElement;antialias:boolean});setSize(width:number,height:number,updateStyle?:boolean):void;setClearColor(color:number):void;render(scene:Scene,camera:OrthographicCamera):void;dispose():void;}
}
