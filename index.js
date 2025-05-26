// Load environment variables
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ strict: true })); // Ensures proper JSON parsing

const PORT = process.env.PORT || 3000;

// Define store configurations
const stores = {
  EZBIKE: {
    store: process.env.EZBIKE_SHOP,
    token: process.env.EZBIKE_TOKEN,
    locationName: 'EZbike Richmond Hill'
  },
  NAMI: {
    store: process.env.NAMI_SHOP,
    token: process.env.NAMI_TOKEN,
    locationName: 'Richmond Hill Store'
  },
  SEGWAY: {
    store: process.env.SEGWAY_SHOP,
    token: process.env.SEGWAY_TOKEN,
    locationName: '10 Brodie Drive #4'
  }
};

// Helper function to get all products (pagination)
async function getAllProducts(storeDomain, token) {
  let products = [];
  let endpoint = `https://${storeDomain}/admin/api/2024-01/products.json?limit=250`;
  let pageInfo = null;

  try {
    do {
      const response = await axios.get(endpoint, {
        headers: {
          'X-Shopify-Access-Token': token,
        }
      });

      products = products.concat(response.data.products);

      const linkHeader = response.headers.link;
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        pageInfo = match ? match[1] : null;
        endpoint = pageInfo;
      } else {
        pageInfo = null;
      }
    } while (pageInfo);
  } catch (err) {
    console.error('Failed to fetch products:', err.response?.data || err.message);
  }

  return products;
}

// POST endpoint to handle inventory sync
app.post('/sync-inventory', async (req, res) => {
  try {
    const { sku, quantity, source } = req.body;

    if (!sku || quantity === undefined || !source || !stores[source]) {
      return res.status(400).json({ error: 'Missing or invalid sku, quantity, or source' });
    }

    const targetStores = Object.keys(stores).filter(store => store !== source);

    for (const target of targetStores) {
      const config = stores[target];

      const products = await getAllProducts(config.store, config.token);

      let matchedVariant = null;

      for (const product of products) {
        matchedVariant = product.variants.find(
          v => v.sku?.toLowerCase() === sku.toLowerCase()
        );
        if (matchedVariant) break;
      }

      if (!matchedVariant) {
        console.log(`SKU ${sku} NOT found in ${config.store}`);
        continue;
      }

      // Get location ID (attempt to match by name)
      const locationsRes = await axios.get(`https://${config.store}/admin/api/2024-01/locations.json`, {
        headers: { 'X-Shopify-Access-Token': config.token }
      });

      const location = locationsRes.data.locations.find(
        loc => loc.name.toLowerCase() === config.locationName.toLowerCase()
      ) || locationsRes.data.locations[0];

      if (!location) {
        console.log(`Location not found for ${config.store}`);
        continue;
      }

      // Check if inventory tracking is enabled
      if (!matchedVariant.inventory_item_id) {
        console.log(`Variant for SKU ${sku} has no inventory item ID`);
        continue;
      }

      try {
        await axios.post(`https://${config.store}/admin/api/2024-01/inventory_levels/set.json`, {
          location_id: location.id,
          inventory_item_id: matchedVariant.inventory_item_id,
          available: quantity
        }, {
          headers: {
            'X-Shopify-Access-Token': config.token,
            'Content-Type': 'application/json'
          }
        });

        console.log(`[${source} ➜ ${target}] SKU ${sku} synced to quantity ${quantity}`);
      } catch (err) {
        if (err.response?.data?.errors?.includes("Inventory item does not have inventory tracking enabled")) {
          console.log(`Inventory not tracked for SKU ${sku} in ${target}`);
        } else {
          console.error(`Failed to sync SKU ${sku} to ${target}:`, err.response?.data || err.message);
        }
      }
    }

    res.status(200).json({ message: `Inventory sync attempted for SKU ${sku}` });
  } catch (error) {
    console.error('Sync error:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test route
app.get('/', (req, res) => {
  res.send('Inventory Sync Middleware is running');
});

// Start server
app.listen(PORT, () => {
  console.log(`Inventory sync middleware running on port ${PORT}`);
});
