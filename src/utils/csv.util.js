const csv = require('csvtojson');
const path = require('path');

async function readCSV(filePath) {
  const fullPath = path.join(__dirname, '..', filePath);
  return await csv().fromFile(fullPath);
}

module.exports = { readCSV };