import type {ForgeConfig} from '@electron-forge/shared-types';

/** Local Windows x64 distribution. Publishing and paid signing are not configured. */
const config:ForgeConfig={
 packagerConfig:{name:'PATRONAJE',executableName:'PATRONAJE',asar:false},
 rebuildConfig:{},
 makers:[{name:'@electron-forge/maker-squirrel',platforms:['win32'],config:{name:'PATRONAJE',authors:'PATRONAJE',description:'CAD de patronaje digital',setupExe:'PATRONAJE-Setup.exe',noMsi:true}}],
 publishers:[],
};
export default config;
