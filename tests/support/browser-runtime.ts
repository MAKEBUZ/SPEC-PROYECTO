import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {release} from 'node:os';
import type {Browser} from '@playwright/test';
export function browserExecutable(){
 const selected=process.env.PATRON_TEST_BROWSER??'edge';
 if(!['edge','chrome'].includes(selected))throw Error('Unsupported test browser');
 const candidates=selected==='chrome'?['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']:['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
 const path=candidates.find(existsSync);if(!path)throw Error('Missing local browser: '+selected);return path;
}
export async function recordBrowser(browser:Browser,suite:string){
 await mkdir('.local/validation',{recursive:true});await writeFile(`.local/validation/browser-${process.env.PATRON_TEST_BROWSER??'edge'}-${suite}.json`,JSON.stringify({suite,browser:process.env.PATRON_TEST_BROWSER??'edge',version:browser.version(),executable:browserExecutable(),os:release(),architecture:process.arch,date:new Date().toISOString(),physicalMobile:false},null,2));
}
