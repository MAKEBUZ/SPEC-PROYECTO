import {useEffect,useState,type ReactNode} from 'react';
export function Icon({name}:{name:string}){
 const paths:Record<string,string>={cad:'M4 19 8 5l12 3-3 12Z M8 5l9 15M4 19l16-11',print:'M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7Z',account:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-3a8 8 0 0 1 16 0v3',recovery:'M4 7v5h5M4 12a8 8 0 1 1 3 6M12 7v5l3 2',publication:'M7 17H5a4 4 0 0 1-1-8 8 8 0 0 1 15-1 5 5 0 0 1 0 9h-2M12 20V11m-4 4 4-4 4 4',moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11',sun:'M12 3v2m0 14v2M3 12h2m14 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0'};
 return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]??paths.help}/></svg>;
}
export function ThemeSwitch(){
 const [dark,setDark]=useState(()=>{try{return localStorage.getItem('patron.theme')==='dark';}catch{return false;}});
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';try{localStorage.setItem('patron.theme',dark?'dark':'light');}catch{/* A storage failure must not block the interface. */}},[dark]);
 return <button className="theme-switch" aria-label="Modo oscuro" aria-pressed={dark} onClick={()=>setDark(!dark)} title="Cambia la apariencia; el tablero de dibujo permanece claro."><Icon name={dark?'sun':'moon'}/><span>{dark?'Modo claro':'Modo oscuro'}</span></button>;
}
export function ToolGroup({title,description,children,open=false}:{title:string;description:string;children:ReactNode;open?:boolean}){
 return <details className="tool-group" open={open}><summary>{title}<span aria-hidden="true">＋</span></summary><p className="group-description">{description}</p><div className="group-content">{children}</div></details>;
}
export const formHelp:Record<string,string>={
 draw:'Cada línea es un punto X,Y en milímetros. Añade «,curva» para un tramo curvo. Después puedes cerrar el contorno y ajustar sus puntos.',
 grid:'La cuadrícula te orienta. Los ajustes atraen el punto al arrastrarlo; escribir coordenadas exactas conserva los valores que introduces.',
 view:'Solo cambia cómo ves el tablero. El zoom y las unidades no cambian el tamaño real de la pieza.',
 point:'Coloca un vértice en coordenadas exactas. Los puntos se numeran desde 0: consulta la tabla de coordenadas.',
 shiftPoint:'Suma estas distancias a un punto. Positivo: derecha/abajo. Negativo: izquierda/arriba.',
 insert:'Añade un punto en el tramo indicado y lo coloca en X,Y. La numeración de los tramos empieza en 0.',
 removePoint:'Elimina el punto y los tramos que lo tocan. El contorno puede quedar abierto; puedes recuperar el cambio con Deshacer.',
 handle:'Ajusta la forma de una curva moviendo su tirador de inicio o fin. Usa un tramo curvo, no una recta.',
 move:'Desplaza toda la pieza en el documento. ΔX es horizontal y ΔY vertical; un valor negativo mueve en sentido contrario.',
 rotate:'Gira toda la pieza alrededor del centro X,Y que indiques. Las medidas de la pieza se conservan.',
 reflect:'Refleja la pieza respecto de la recta que une los dos puntos del eje. Puedes deshacer el resultado.',
 properties:'Estos datos se incluyen en el PDF. Nombre, talla, cantidad entera positiva y una línea de hilo válida son obligatorios para exportar.',
 margin:'Añade un margen uniforme sin cambiar el contorno base. Usa 0 o más milímetros; deja el campo vacío para quitarlo.',
 corner:'Elige el vértice y cómo unir el margen en esa esquina. Cada esquina puede ser esquinada o redondeada.',
 'preparation-create':'Crea una colocación de impresión independiente. Ponle un nombre y selecciona al menos una pieza.',
 'preparation-rename':'Cambia solo el nombre de esta preparación. Debe ser único, sin distinguir mayúsculas ni espacios exteriores.',
 'preparation-duplicate':'Copia piezas, colocación y papel. La nueva preparación se edita por separado de la original.',
 'preparation-delete':'Elimina solo esta preparación, no tus piezas. Puedes deshacer durante la sesión actual.',
 'preparation-selection':'Estas son las piezas que incluirá el PDF. Aplica la selección antes de exportar; no puedes dejarla vacía.',
 'preparation-config':'Hojas A4/Carta divide el patrón para montarlo. Gran formato crea una sola página. El margen imprimible es espacio libre junto al borde del papel.',
};
