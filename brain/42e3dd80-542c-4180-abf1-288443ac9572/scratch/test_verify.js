const axios = require('axios');

const NSE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const NSE_HEADERS = {
  'User-Agent': NSE_UA,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

async function test() {
  try {
    console.log('Fetching symbols to get cookies...');
    const symRes = await axios.get('https://www.nseindia.com/api/ipo-bid-master', {
      headers: NSE_HEADERS,
      timeout: 10000
    });
    
    const setCookies = symRes.headers['set-cookie'];
    console.log('set-cookie headers from symbols:', setCookies);
    const cookies = setCookies ? setCookies.map(c => c.split(';')[0]).join('; ') : '';
    console.log('Parsed cookies:', cookies);

    console.log('Verifying with cookies from symbols...');
    const res = await axios.post('https://www.nseindia.com/api/ipo-bid-verification-details', {
      symbol: 'DHOOTTRANS',
      pan: 'COAPJ9504C',
      appNo: ''
    }, {
      headers: {
        ...NSE_HEADERS,
        'Content-Type': 'application/json',
        'Referer': 'https://www.nseindia.com/products/dynaContent/equities/ipos/ipo_bid_details.jsp',
        'Cookie': cookies
      },
      timeout: 10000
    });
    console.log('Response status:', res.status);
    console.log('Data:', res.data);
  } catch (err) {
    console.error('Error occurred:', err.message);
    if (err.response) {
      console.error('Response status:', err.response.status);
      console.error('Response data:', err.response.data);
    }
  }
}

test();
