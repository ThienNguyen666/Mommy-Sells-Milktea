require('dotenv').config();
const express = require('express');
const payosWebhookRoute = require('./routes/payos.webhook.route');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/', payosWebhookRoute);

const port = process.env.PORT || 4300;
app.listen(port, () => {
  console.log(`Server listening on ${port}`);
});

module.exports = app;