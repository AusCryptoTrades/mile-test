import {readFile,writeFile,access,copyFile} from 'node:fs/promises';
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
 // Rebuild the local prototype from tracked sources; do not accumulate generated edits.
 const app=path.join(cwd,'ios/App/App');
 const delegate=path.join(app,'AppDelegate.swift');
 const begin='// MILE HEALTHKIT GENERATED BEGIN',end='// MILE HEALTHKIT GENERATED END';
 let swift=await readFile(delegate,'utf8');
 if(swift.includes(begin)){const a=swift.indexOf(begin),b=swift.indexOf(end,a);if(b<0)throw Error('Incomplete HealthKit block');swift=swift.slice(0,a)+swift.slice(b+end.length);}
 const plugin=(await Promise.all(['MILEHealthKitPlugin.swift','MILEHealthDetails.swift','MILEWorkoutKit.swift','MILESessionKeychain.swift'].map(name=>readFile(path.join(cwd,'healthkit',name),'utf8')))).join('\n');
 await writeFile(delegate,swift.trimEnd()+'\n\n'+begin+'\n'+plugin+'\nclass MILEBridgeViewController: CAPBridgeViewController {\n override func capacitorDidLoad() { bridge?.registerPluginInstance(MILEHealthKitPlugin()) }\n}\n'+end+'\n');
 const storyboard=path.join(app,'Base.lproj/Main.storyboard');
 let story=await readFile(storyboard,'utf8');
 if(!story.includes('customClass="MILEBridgeViewController"')){
  if(!story.includes('customClass="CAPBridgeViewController" customModule="Capacitor"'))throw Error('Unexpected Capacitor storyboard');
  story=story.replace('customClass="CAPBridgeViewController" customModule="Capacitor"','customClass="MILEBridgeViewController" customModule="App" customModuleProvider="target"');
  await writeFile(storyboard,story);
 }
 xml=await readFile(file,'utf8');
 if(!xml.includes('<key>NSHealthShareUsageDescription</key>')){
  xml=xml.replace(/<\/dict>\s*<\/plist>/,'<key>NSHealthShareUsageDescription</key>\n<string>MILE reads workouts to show your training history. With separate permission, it can also read heart rate, routes, running dynamics, sleep and recovery observations for private coaching.</string>\n</dict>\n</plist>');
  await writeFile(file,xml);
 }
 await writeFile(path.join(app,'MILEHealthKit.entitlements'),'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>com.apple.developer.healthkit</key><true/><key>com.apple.developer.healthkit.background-delivery</key><true/></dict></plist>\n');
 const pbx=path.join(cwd,'ios/App/App.xcodeproj/project.pbxproj');
 let project=await readFile(pbx,'utf8');
 if(!project.includes('CODE_SIGN_ENTITLEMENTS = App/MILEHealthKit.entitlements;')){
  const anchor=/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g;
  const matches=project.match(anchor)||[];if(matches.length!==2)throw Error('Unexpected app build configurations');
  project=project.replace(anchor,m=>m+'\n\t\t\t\tCODE_SIGN_ENTITLEMENTS = App/MILEHealthKit.entitlements;');
  await writeFile(pbx,project);
 }
 await copyFile(path.join(cwd,'healthkit/PrivacyInfo.xcprivacy'),path.join(app,'PrivacyInfo.xcprivacy'));
 if(!project.includes('PrivacyInfo.xcprivacy in Resources')){
  const fileID='A92200000000000000000001',buildID='A92200000000000000000002';
  const sections=[
   ['/* Begin PBXFileReference section */',fileID+' /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = App/PrivacyInfo.xcprivacy; sourceTree = SOURCE_ROOT; };'],
   ['/* Begin PBXBuildFile section */',buildID+' /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = '+fileID+'; };'],
  ];
  for(const [anchor,entry] of sections){if(!project.includes(anchor))throw Error('Missing privacy manifest project section');project=project.replace(anchor,anchor+'\n\t\t'+entry);}
  const resources=/(isa = PBXResourcesBuildPhase;[\s\S]*?files = \()/;
  if(!resources.test(project))throw Error('Missing app resources phase');
  project=project.replace(resources,(_match)=>_match+'\n\t\t\t\t'+buildID+' /* PrivacyInfo.xcprivacy in Resources */,');
 }
 const bundle=process.env.MILE_IOS_BUNDLE_ID;
 if(bundle){
  if(!/^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+){2,}$/.test(bundle))throw Error('Invalid iOS bundle identifier');
  project=project.replace(/PRODUCT_BUNDLE_IDENTIFIER = [^;]+;/g,'PRODUCT_BUNDLE_IDENTIFIER = '+bundle+';');
 }
 await writeFile(pbx,project);
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
