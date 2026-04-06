const http = require('http');

const testApi = (path) => {
    return new Promise((resolve) => {
        http.get('http://localhost:5000' + path, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, data });
            });
        }).on('error', (err) => resolve({ status: 'ERROR', error: err.message }));
    });
};

async function run() {
    console.log("Testing API Endpoints:");
    const products = await testApi('/api/products');
    console.log('[GET /api/products] -> HTTP', products.status);
    if(products.status !== 200) console.log('RESPONSE:', products.data);

    const stats = await testApi('/api/products/stats');
    console.log('[GET /api/products/stats] -> HTTP', stats.status);
    if(stats.status !== 200) console.log('RESPONSE:', stats.data);

    const orders = await testApi('/api/orders');
    console.log('[GET /api/orders] -> HTTP', orders.status);
    if(orders.status !== 200 && orders.status !== 401) console.log('RESPONSE:', orders.data);
    
    process.exit(0);
}
run();
