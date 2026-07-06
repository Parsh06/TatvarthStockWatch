require('dotenv').config();
const axios = require('axios');

async function getCategories() {
  const url = 'https://api.bseindia.com/BseIndiaAPI/api/AnnSubCategoryGetData/w';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': '*/*',
    'Origin': 'https://www.bseindia.com',
    'Referer': 'https://www.bseindia.com/'
  };
  
  try {
    const res = await axios.get(url, { headers });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (e) {
    console.error(e.message);
  }
}
getCategories();
