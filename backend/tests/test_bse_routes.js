const express = require('express');
const { bseGet, getBseCookies } = require('../lib/apiClients');
const bseRoutesFactory = require('../routes/bseRoutes');
const spurtStore = require('../lib/spurtStore');

// Mock verifyToken for testing
const mockVerifyToken = (req, res, next) => {
  req.uid = 'test-uid';
  req.user = { email: 'test@example.com' };
  next();
};

const app = express();
app.use(express.json());
app.use('/api/bse', bseRoutesFactory(mockVerifyToken));

async function runTests() {
  console.log('=== RUNNING BSE API ROUTE TESTS ===\n');

  // Helper for internal express routing test
  const testRoute = (path) => new Promise((resolve, reject) => {
    const http = require('http');
    const server = app.listen(0, async () => {
      const port = server.address().port;
      try {
        const axios = require('axios');
        const res = await axios.get(`http://127.0.0.1:${port}${path}`);
        server.close();
        resolve(res.data);
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });

  // 1. Test /movers
  try {
    console.log('1. Testing /api/bse/movers...');
    const movers = await testRoute('/api/bse/movers?limit=5');
    console.log('   Gainers:', movers.gainers?.length, 'Sample:', movers.gainers?.[0]?.company, movers.gainers?.[0]?.pctChange + '%');
    console.log('   Losers:', movers.losers?.length, 'Sample:', movers.losers?.[0]?.company, movers.losers?.[0]?.pctChange + '%');
  } catch (e) {
    console.error('   ❌ Movers error:', e.message);
  }

  // 2. Test /search
  try {
    console.log('\n2. Testing /api/bse/search...');
    const search = await testRoute('/api/bse/search?q=RELIANCE');
    console.log('   Results count:', search.length, 'Sample:', search[0]);
  } catch (e) {
    console.error('   ❌ Search error:', e.message);
  }

  // 3. Test /board-meetings
  try {
    console.log('\n3. Testing /api/bse/board-meetings...');
    const bm = await testRoute('/api/bse/board-meetings?fromDT=20/09/2026&ToDt=27/09/2026');
    console.log('   Board meetings count:', bm.Corp_fetch_BoardMeeting_Table1?.length, 'Sample:', bm.Corp_fetch_BoardMeeting_Table1?.[0]?.Long_Name);
  } catch (e) {
    console.error('   ❌ Board meetings error:', e.message);
  }

  // 4. Test /agm-updates
  try {
    console.log('\n4. Testing /api/bse/agm-updates...');
    const agm = await testRoute('/api/bse/agm-updates?fromDT=20260920&ToDt=20260927');
    console.log('   AGM updates count:', agm.Table?.length, 'Sample:', agm.Table?.[0]?.Long_Name);
  } catch (e) {
    console.error('   ❌ AGM updates error:', e.message);
  }

  // 5. Test /gainers-losers
  try {
    console.log('\n5. Testing /api/bse/gainers-losers...');
    const gl = await testRoute('/api/bse/gainers-losers?GLtype=gainer&IndxGrp=AllMkt&IndxGrpval=AllMkt&orderby=all');
    console.log('   Gainers count:', gl.Table?.length, 'Sample:', gl.Table?.[0]?.scripname, gl.Table?.[0]?.change_percent + '%');
  } catch (e) {
    console.error('   ❌ Gainers/Losers error:', e.message);
  }

  // 6. Test /deals (Bulk/Block)
  try {
    console.log('\n6. Testing /api/bse/deals...');
    const deals = await testRoute('/api/bse/deals?from=20260925&to=20260925&dealType=both');
    console.log('   Deals count:', deals.deals?.length, 'Sample:', deals.deals?.[0]?.scripname, deals.deals?.[0]?.dealType, deals.deals?.[0]?.clientName);
  } catch (e) {
    console.error('   ❌ Deals error:', e.message);
  }

  // 7. Test /calendar
  try {
    console.log('\n7. Testing /api/bse/calendar...');
    const cal = await testRoute('/api/bse/calendar?from=20260901&to=20260930');
    console.log('   Calendar events count:', cal.events?.length, 'Sample:', cal.events?.[0]?.company, cal.events?.[0]?.category);
  } catch (e) {
    console.error('   ❌ Calendar error:', e.message);
  }

  // 8. Test /insider
  try {
    console.log('\n8. Testing /api/bse/insider...');
    const insider = await testRoute('/api/bse/insider');
    console.log('   Insider trades count:', insider.insiderTrades?.length, 'Sample:', insider.insiderTrades?.[0]?.companyName, insider.insiderTrades?.[0]?.promoterName);
  } catch (e) {
    console.error('   ❌ Insider error:', e.message);
  }

  // 9. Test Volume Spurt Store
  try {
    console.log('\n9. Testing spurtStore.getOrFetchSpurt()...');
    const spurt = await spurtStore.getOrFetchSpurt(true);
    console.log('   Spurt count:', spurt.stocks?.length, 'Sample:', spurt.stocks?.[0]?.company, 'Multiple:', spurt.stocks?.[0]?.volMultiple);
  } catch (e) {
    console.error('   ❌ Spurt error:', e.message);
  }

  console.log('\n=== ALL TESTS COMPLETED ===');
}

runTests();
