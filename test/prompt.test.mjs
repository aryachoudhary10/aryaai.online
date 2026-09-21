import { parseVariants } from "../lib/prompt.js";
const cases = [
  ['clean json', '["One rewrite.","Two rewrite.","Three rewrite."]'],
  ['fenced',     '```json\n["Alpha","Beta","Gamma"]\n```'],
  ['preamble',   'Here are three rewrites:\n["Alpha","Beta","Gamma"]'],
  ['numbered',   '1. First version\n2. Second version\n3. Third version'],
  ['bulleted',   '- First\n- Second\n- Third'],
  ['dupes',      '["Same thing","same   THING","Different"]'],
  ['overflow',   '["a","b","c","d","e"]'],
  ['garbage',    'I cannot help with that.'],
  ['empty',      ''],
];
let fail = 0;
for (const [name, input] of cases) {
  const out = parseVariants(input);
  console.log(String(name).padEnd(10), '->', JSON.stringify(out));
  if (name !== 'empty' && name !== 'garbage' && out.length === 0) { fail++; console.log('   FAIL: expected results'); }
}
const d = parseVariants('["Same thing","same   THING","Different"]');
if (d.length !== 2) { fail++; console.log('FAIL dedupe:', d); }
const o = parseVariants('["a","b","c","d","e"]');
if (o.length !== 3) { fail++; console.log('FAIL cap:', o); }
console.log(fail ? `\n${fail} FAILURES` : '\nall pass');
