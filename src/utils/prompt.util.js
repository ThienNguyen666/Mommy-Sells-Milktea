const fs = require('fs');
const path = require('path');

function getPersona() {
  const filePath = path.join(__dirname, '../prompt/persona.txt');
  return fs.readFileSync(filePath, 'utf-8');
}

module.exports = { getPersona };