const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');
const config = require('../src/config');

async function exportData() {
  const client = new MongoClient(config.mongo.uri);
  try {
    await client.connect();
    const db = client.db(config.mongo.dbName);
    
    const collections = ['propertyfinder_raw', 'bayut_raw', 'dubizzle_raw', 'targeted_results'];
    const outputDir = path.join(__dirname, '../data/static');
    
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const colName of collections) {
      const data = await db.collection(colName).find({}).toArray();
      fs.writeFileSync(
        path.join(outputDir, `${colName}.json`),
        JSON.stringify(data, null, 2)
      );
      console.log(`Exported ${data.length} docs from ${colName}`);
    }
  } catch (err) {
    console.error('Export failed:', err);
  } finally {
    await client.close();
  }
}

exportData();
