export function userMessage(message:string):string {
 const known:Record<string,string>={
  PREPARATION_NAME_INVALID:'No se cambió la preparación. Escribe un nombre que no esté vacío ni repetido; las mayúsculas y los espacios exteriores no distinguen nombres.',
  PREPARATION_CONFIGURATION_INVALID:'No se aplicó la configuración. El margen imprimible debe ser un número igual o mayor que 0. Se conserva la configuración anterior.',
  PREPARATION_SELECTION_INVALID:'Selecciona al menos una pieza. No se aplicó el cambio.',
 };
 if(known[message])return known[message];
 if(message.startsWith('PRODUCTION_INVALID: '))return message.slice('PRODUCTION_INVALID: '.length);
 return message;
}
