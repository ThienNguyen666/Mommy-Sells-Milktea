const fs = require('fs');

function saveOrder(order) {
  let data = [];

  try {
    data = JSON.parse(fs.readFileSync('./data/orders.json'));
  } catch {}

  data.push(order);

  fs.writeFileSync('./data/orders.json', JSON.stringify(data, null, 2));
}

module.exports = { saveOrder };