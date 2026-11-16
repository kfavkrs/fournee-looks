import { readFileSync } from 'node:fs'; import vm from 'node:vm';
const root=process.env.FOURNEE_HOME || new URL("../../fournee/", import.meta.url).pathname;
const sb={console}; sb.window=sb; sb.globalThis=sb; vm.createContext(sb);
for (const f of ['frosting/dist/tokens.js', 'frosting/src/readability.js', 'frosting/src/gallery.js', 'fontdant/dist/type-tokens.js', 'fontdant/dist/library.js', 'fontdant/src/fontface.js', 'fontdant/src/typecheck.js', 'kitchen/src/store.js', 'kitchen/src/recipe.js', 'kitchen/src/standards.js', 'kitchen/src/pass.js']) vm.runInContext(readFileSync(root+f,'utf8'),sb,{filename:f});
const {KitchenPass:P,KitchenRecipe:R,FrostingTokens:FT}=sb;
// usage: node tools/check.mjs [look-slug | path/to/recipe.json]   (default: plum-crumb)
const arg=process.argv[2]&&!/[\/.]/.test(process.argv[2])?new URL('../looks/'+process.argv[2]+'/recipe.json', import.meta.url).pathname:process.argv[2];
const rec=JSON.parse(readFileSync(arg||new URL('../looks/plum-crumb/recipe.json', import.meta.url).pathname,'utf8'));
const res=P.run(R.clean(rec,{colors:FT.light,scheme:'Light'}));
for (const lvl of ['hard','warn']) for (const x of P.failing(res,lvl)) {const d=res.results.find(r=>r.id===x)||{}; console.log(lvl.toUpperCase(), x, JSON.stringify(d).slice(0,450));}
console.log('done');
