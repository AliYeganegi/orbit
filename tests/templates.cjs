// Compiles every Vue template in web/app.js and fails on any error. Templates are compiled at runtime from JS
// template literals, so a stray apostrophe ('It's') breaks a whole screen without any syntax error in app.js.
// Usage: PW=<path to playwright> node tests/templates.cjs [url]
const { chromium } = require(process.env.PW ? process.env.PW + '/playwright' : 'playwright');
const fs = require('node:fs');
const src = fs.readFileSync(require('node:path').join(__dirname, '../web/app.js'), 'utf8');
const templates = [];
for (let i = src.indexOf('template: `'); i >= 0; i = src.indexOf('template: `', i + 1)) {
  let j = i + 11;
  while (j < src.length && !(src[j] === '`' && src[j - 1] !== '\\')) j++;
  const line = src.slice(0, i).split('\n').length;
  templates.push({ line, body: eval('`' + src.slice(i + 11, j) + '`') });
}
for (let i = src.indexOf("template: '"); i >= 0; i = src.indexOf("template: '", i + 1)) {
  const line = src.slice(0, i).split('\n').length, end = src.indexOf("',\n", i);
  templates.push({ line, body: eval(src.slice(i + 10, end + 1)) });
}
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const p = await b.newPage();
  await p.goto(process.argv[2] || 'http://127.0.0.1:8766/vue.js');
  await p.addScriptTag({ url: (process.argv[2] || 'http://127.0.0.1:8766/') .replace(/vue\.js$/, '') + 'vue.js' }).catch(() => {});
  const bad = await p.evaluate(list => list.map(t => {
    const errs = [];
    try { Vue.compile(t.body, { onError: e => errs.push(e.message), onWarn: () => {} }); } catch (e) { errs.push(e.message); }
    return errs.length ? { line: t.line, errs } : null;
  }).filter(Boolean), templates);
  await b.close();
  if (bad.length) { console.error('FAIL ' + bad.map(x => 'app.js:' + x.line + ' ' + x.errs.join('; ')).join('\n')); process.exit(1); }
  console.log('✓ ' + templates.length + ' templates compile');
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
