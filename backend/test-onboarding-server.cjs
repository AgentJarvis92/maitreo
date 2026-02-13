/**
 * Simple test server for onboarding endpoint (no database required)
 * Usage: node test-onboarding-server.js
 */

const http = require('http');

const PORT = 3001;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS request (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'healthy', 
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Onboarding endpoint
  if (url.pathname === '/onboarding' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        console.log('\n🎉 New onboarding submission:');
        console.log('  Restaurant Name:', data.name);
        console.log('  Address:', data.address);
        console.log('  Phone:', data.phone);
        console.log('  Email:', data.email);
        console.log('  Timestamp:', new Date().toISOString());
        console.log('---');

        // Validate
        if (!data.name || !data.address || !data.phone || !data.email) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            message: 'All fields are required'
          }));
          return;
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            message: 'Invalid email address'
          }));
          return;
        }

        // Success response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          message: 'Welcome to Maitreo! Check your email for next steps.',
          restaurantId: 'test-' + Date.now()
        }));

      } catch (error) {
        console.error('Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          message: 'Server error'
        }));
      }
    });
    
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`\n🚀 Test Onboarding Server Running`);
  console.log(`   Port: ${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  http://localhost:${PORT}/health`);
  console.log(`     POST http://localhost:${PORT}/onboarding`);
  console.log(`\n📝 Ready to receive onboarding submissions!\n`);
});
