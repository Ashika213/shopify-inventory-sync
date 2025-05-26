// Load environment variables
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Define store configurations
const stores = {
  EZBIKE: {
    store: process.env.EZBIKE_SHOP,
    token: process.env.EZBIKE_TOKEN
  },
  NAMI: {
    store: process.env.NAMI_SHOP,
    token: process.env.NAMI_TOKEN
  },
  SEGWAY: {
    store: process.env.SEGWAY_SHOP,
    token: process.env.SEGWAY_TOKEN
  }
};

app.post('/sync-inventory', async (req, res) => {
  try {
    const { sku, quantity, source } = req.body;
    if (!sku || quantity === undefined || !source || !stores[source]) {
      return res.status(400).json({ error: 'Missing or invalid sku, quantity, or source' });
    }

    const targetStores = Object.keys(stores).filter(store => store !== source);

    for (const target of targetStores) {
      const config = stores[target];
      const products = await axios.get(`https://${config.store}/admin/api/2024-01/products.json?limit=250`, {
        headers: { 'X-Shopify-Access-Token': config.token }
      });

      let matchedVariant = null;
      for (const product of products.data.products) {
        matchedVariant = product.variants.find(v => v.sku === sku);
        if (matchedVariant) break;
      }

      if (!matchedVariant) {
        console.log(`SKU ${sku} NOT found in ${config.store}`);
        continue;
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

      console.log(`[${source} ➜ ${target}] SKU ${sku} synced to ${quantity}`);
    }

    res.status(200).json({ message: 'Inventory sync attempted to all target stores' });
  } catch (error) {
    console.error('Sync error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', (req, res) => {
  res.send('Inventory Sync Middleware is running');
});

app.listen(PORT, () => {
  console.log(`Inventory sync middleware running on port ${PORT}`);
});
