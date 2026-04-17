require('dotenv').config({
  path : require('path').resolve(__dirname, '../.env')
});

const readline = require('readline');
const { handleMessage } = require('./services/order.service');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const chatId = "test-user";

function ask() {
  rl.question("Bạn: ", async (input) => {
    const reply = await handleMessage(chatId, input);
    console.log("Mẹ:", reply);
    ask();
  });
}

ask();