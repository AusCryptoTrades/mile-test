import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
console.log('Current bundle identifier: '+config.appId);
console.log('Proposed release identifier: au.com.milefitness.training');
console.log('This workflow is a credential-free preflight only. No signed archive, upload, or public artifact is produced.');
