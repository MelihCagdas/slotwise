// Copies the planning and Jira-parsing functions from Code.gs into the
// extension, so both use exactly the same rules. Run: npm run sync
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const END_MARK = 'function jiraGet_(';

function planSource() {
  const code = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
  const end = code.indexOf(END_MARK);
  if (end === -1) throw new Error('Could not find the end of the planning code in Code.gs');
  return '// GENERATED from Code.gs by scripts/sync-plan.js. Do not edit; run `npm run sync`.\n' +
    code.slice(0, end).trimEnd() + '\n';
}

if (require.main === module) {
  fs.writeFileSync(path.join(root, 'extension', 'plan.js'), planSource());
  console.log('extension/plan.js updated');
}

module.exports = { planSource };
