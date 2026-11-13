// Loads Code.gs into a sandbox so the pure functions can be tested in Node.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function load() {
  const code = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const context = { console };
  vm.runInNewContext(code, context, { filename: 'Code.gs' });
  return context;
}

module.exports = { load };
