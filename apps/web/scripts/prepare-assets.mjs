import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url),root=process.cwd();
await fs.mkdir(path.join(root,'public/ocr/core'),{recursive:true});
await fs.mkdir(path.join(root,'public/ocr/lang'),{recursive:true});
for(const name of ['tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-relaxedsimd-lstm.wasm.js'])await fs.copyFile(require.resolve('tesseract.js-core/'+name),path.join(root,'public/ocr/core',name));
await fs.copyFile(require.resolve('tesseract.js/dist/worker.min.js'),path.join(root,'public/ocr/worker.min.js'));
await fs.copyFile(require.resolve('pdfjs-dist/build/pdf.worker.min.mjs'),path.join(root,'public/pdf.worker.min.mjs'));
const hashes=JSON.parse(await fs.readFile(new URL('./ocr-hashes.json',import.meta.url),'utf8'));
for(const lang of ['spa','eng']){
 const file=path.join(root,'public/ocr/lang',lang+'.traineddata.gz');let bytes;try{bytes=await fs.readFile(file);}catch{const res=await fetch(`https://tessdata.projectnaptha.com/4.0.0/${lang}.traineddata.gz`);if(!res.ok)throw new Error('OCR asset download failed');bytes=Buffer.from(await res.arrayBuffer());}
 if(createHash('sha256').update(bytes).digest('hex')!==hashes[lang])throw new Error('OCR asset checksum mismatch');await fs.writeFile(file,bytes);
}
console.log('Local OCR and PDF assets prepared.');
