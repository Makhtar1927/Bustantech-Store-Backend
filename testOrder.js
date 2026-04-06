require('dotenv').config();
const db = require('./config/db');
const orderController = require('./controllers/orderController');
const run = async () => {
    const req = {
      body: {
        customer_name: "Test", customer_phone: "777", customer_address: "Dakar", payment_method: "WhatsApp", total_amount: 1000,
        items: [ { id: 1, quantity: 1 } ]
      },
      app: { get: () => null }
    };
    const res = {
      status: (code) => ({ json: (data) => console.log('STATUS', code, JSON.stringify(data)) })
    };
    await orderController.createOrder(req, res);
    process.exit(0);
};
run();
