import {readFile,writeFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const cwd=fileURLToPath(new URL('../',import.meta.url));
const platform=process.argv[2];
if(!['ios','android'].includes(platform))throw new Error('Specify ios or android');
const cap=path.join(cwd,'node_modules','@capacitor','cli','bin','capacitor');
const run=(...args)=>execFileSync(process.execPath,[cap,...args],{cwd,stdio:'inherit'});
let exists=true;
try{await access(path.join(cwd,platform));}catch{exists=false;}
if(!exists)run('add',platform);
if(platform==='ios'){
 const file=path.join(cwd,'ios/App/App/Info.plist');
 let xml=await readFile(file,'utf8');
 if(!xml.includes('<key>NSLocationWhenInUseUsageDescription</key>')){
  if(!/<\/dict>\s*<\/plist>/.test(xml))throw new Error('Unexpected Info.plist structure');
  xml=xml.replace(/<\/dict>\s*<\/plist>/,'<key>NSLocationWhenInUseUsageDescription</key>\n<string>MILE uses your location during a run you start to measure route, distance and pace.</string>\n</dict>\n</plist>');
  await writeFile(file,xml);
 }
}else{
 const file=path.join(cwd,'android/app/src/main/AndroidManifest.xml');
 let xml=await readFile(file,'utf8');
 for(const permission of ['ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION']){
  if(!xml.includes('android.permission.'+permission)){
   if(!xml.includes('</manifest>'))throw new Error('Unexpected manifest structure');
   xml=xml.replace('</manifest>','    <uses-permission android:name="android.permission.'+permission+'" />\n</manifest>');
  }
 }
 await writeFile(file,xml);
}
execFileSync('python3',[path.join(cwd,'scripts','brand.py'),platform],{cwd,stdio:'inherit'});
run('sync',platform);
