// Load environment variables from .env file
require('dotenv').config();

// Import necessary modules
const express = require('express');
const axios = require('axios');

// Initialize Express application
const app = express();
app.use(express.json());

// Validate required environment variables
const requiredEnvVars = ['EZBIKE_SHOP', 'EZBIKE_TOKEN', 'NAMI_SHOP', 'NAMI_TOKEN', 'PORT'];
requiredEnvVars.forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1); // Exit the application if a required variable is missing
  }
});

// Define port and store configurations
const PORT = process.env.PORT || 3000;

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

// Define routes
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
        product.variants.forEach(v => console.log(`Product: ${product.title}, Variant SKU: ${v.sku}`));
        matchedVariant = product.variants.find(v => v.sku?.trim().toLowerCase() === sku.trim().toLowerCase());
      if (matchedVariant) break;
    }

    if (!matchedVariant) {
        console.log(`SKU ${sku} NOT found in ${config.store}`);
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

// Optional route for browser testing
app.get('/', (req, res) => {
  res.send('Inventory Sync Middleware is running');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Inventory sync middleware running on port ${PORT}`);
});
