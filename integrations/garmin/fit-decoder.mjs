import {normalizedLaps,MAX_BYTES} from './fit-contract.mjs';
export function decodeActivity(bytes,expectedStart,sdk){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<14||bytes.byteLength>MAX_BYTES)throw Error('FIT_SIZE_INVALID');
 const decoder=new sdk.Decoder(sdk.Stream.fromArrayBuffer(bytes.slice().buffer));
 if(!decoder.isFIT()||!decoder.checkIntegrity())throw Error('FIT_INTEGRITY_INVALID');
 const {messages,errors}=decoder.read();
 if(!messages||!Array.isArray(errors)||errors.length)throw Error('FIT_DECODE_FAILED');
 return normalizedLaps(messages,expectedStart);
}
