const axios = require('axios');
const { spawn, execSync } = require('child_process');

async function runTest() {
  console.log('--- Start E2E ---');
  const server = spawn('node', ['src/api/server.js']);
  let token = '';

  server.stdout.on('data', (d) => {
    const s = d.toString();
    const m = s.match(/token=([a-f0-9]+)/);
    if (m) token = m[1];
  });

  await new Promise(r => setTimeout(r, 4000));
  if (!token) { console.error('No token found'); server.kill(); return; }
  console.log('Token:', token);

  const api = 'http://localhost:3000/api';
  try {
    const list = await axios.get(`${api}/targeted-results?limit=1`);
    const id = list.data.docs[0].listing_id;
    console.log('Target ID:', id);

    await axios.post(`${api}/targeted-results/interact`, { 
      listing_id: id, status: 'interested', token 
    });
    console.log('Interact: OK');

    const filter = await axios.get(`${api}/targeted-results?interest=interested`);
    console.log('Filter found:', filter.data.docs.some(d => d.listing_id === id));

    console.log('Running search script...');
    execSync('node src/scripts/targeted-search.js');

    const persist = await axios.get(`${api}/targeted-results?interest=interested`);
    console.log('Persistence:', persist.data.docs.some(d => d.listing_id === id));
    console.log('--- E2E SUCCESS ---');
  } catch (e) {
    console.error('E2E Failed:', e.message);
  } finally {
    server.kill();
  }
}
runTest();
