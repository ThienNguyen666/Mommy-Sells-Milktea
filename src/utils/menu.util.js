const { readCSV } = require('./csv.util');

let cachedMenu = null;

async function getMenu() {
  if (cachedMenu) return cachedMenu;

  const data = await readCSV('../src/Menu.csv');

  cachedMenu = data
    .filter(item => item.available === 'true')
    .map(item => ({
      name: item.name.toLowerCase(),
      priceM: Number(item.price_m),
      priceL: Number(item.price_l),
      category: item.category,
    }));

  return cachedMenu;
}

// Dùng trong tests để reset cache
function resetMenuCache() {
  cachedMenu = null;
}

module.exports = { getMenu, resetMenuCache };