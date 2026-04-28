require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env')
});

const { parseOrder } = require('../src/services/ai.service');
const { getMenu } = require('../src/utils/menu.util');

describe("AI Integration Test", () => {

  test("Parse basic order", async () => {
    const menu = await getMenu();

    const res = await parseOrder(
      "2 trà sữa trân châu đen size L",
      menu
    );

    expect(res.items.length).toBeGreaterThan(0);
  });

  test("Handle typo input", async () => {
    const menu = await getMenu();

    const res = await parseOrder(
      "2 tra sua tran chau den",
      menu
    );

    expect(res.items.length).toBeGreaterThan(0);
  });

}, 20000);