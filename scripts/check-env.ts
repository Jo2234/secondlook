import { loadEnv } from '../src/server/env.js';
const present = !!process.env.YOUCAM_API_KEY?.trim();
console.log(`YOUCAM_API_KEY: ${present ? 'set (length hidden)' : 'not set'}`);
try { const env = loadEnv(); console.log(`mode: ${env.mode}; buyerUpload: ${env.buyerUpload}`); }
catch { console.error('Environment invalid; check configured variable names and required values.'); process.exitCode = 2; }
