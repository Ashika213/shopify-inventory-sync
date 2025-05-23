const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post('/sync-inventory', async (req, res) => {
  try {
    const { sku, quantity, source } = req.body;

    if (!sku || quantity === undefined || !source) {
      return res.status(400).json({ error: 'Missing sku, quantity, or source' });
    }

    const targetStore = source === 'NAMI' ? 'EZBIKE' : 'NAMI';
    const config = getStoreConfig(targetStore);

    const products = await axios.get(`https://${config.store}/admin/api/2024-01/products.json?limit=250`, {
      headers: { 'X-Shopify-Access-Token': config.token }
    });

    let matchedVariant = null;
    for (const product of products.data.products) {
      matchedVariant = product.variants.find(v => v.sku === sku);
      if (matchedVariant) break;
    }

    if (!matchedVariant) {
      return res.status(404).json({ error: `SKU ${sku} not found in ${targetStore}` });
    }

    const locations = await axios.get(`https://${config.store}/admin/api/2024-01/locations.json`, {
      headers: { 'X-Shopify-Access-Token': config.token }
    });

    const locationId = locations.data.locations[0].id;

    await axios.post(`https://${config.store}/admin/api/2024-01/inventory_levels/set.json`, {
      location_id: locationId,
      inventory_item_id: matchedVariant.inventory_item_id,
      available: quantity
    }, {
      headers: {
        'X-Shopify-Access-Token': config.token,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[${source} ➜ ${targetStore}] SKU ${sku} synced to ${quantity}`);
    res.status(200).json({ message: 'Inventory synced' });

  } catch (error) {
    console.error('Sync error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function getStoreConfig(store) {
  if (store === 'NAMI') {
    return {
      store: process.env.NAMI_SHOP,
      token: process.env.NAMI_TOKEN
    };
  } else if (store === 'EZBIKE') {
    return {
      store: process.env.EZBIKE_SHOP,
      token: process.env.EZBIKE_TOKEN
    };
  }
}

// Optional route for browser testing
app.get('/', (req, res) => {
    res.send('Inventory Sync Middleware is running');
  });

app.listen(PORT, () => console.log(`Inventory sync middleware running on port ${PORT}`));
