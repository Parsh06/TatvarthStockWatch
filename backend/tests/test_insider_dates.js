const { bseGet } = require('../lib/apiClients');

async function testInsiderDateFormats() {
  console.log('Testing Isdefault=1 (latest default)...');
  const d1 = await bseGet('/getCorp_Regulation_ng/w', { scripCode: '', Regulation: '', fromDT: '', ToDate: '', Isdefault: 1 });
  console.log('Isdefault=1 table count:', d1?.Table?.length);

  console.log('Testing fromDT=20260921, ToDate=20260927, Isdefault=2 (YYYYMMDD)...');
  const d2 = await bseGet('/getCorp_Regulation_ng/w', { scripCode: '', Regulation: '', fromDT: '20260921', ToDate: '20260927', Isdefault: 2 });
  console.log('YYYYMMDD count:', d2?.Table?.length);

  console.log('Testing fromDT=21/09/2026, ToDate=27/09/2026, Isdefault=2 (DD/MM/YYYY)...');
  const d3 = await bseGet('/getCorp_Regulation_ng/w', { scripCode: '', Regulation: '', fromDT: '21/09/2026', ToDate: '27/09/2026', Isdefault: 2 });
  console.log('DD/MM/YYYY count:', d3?.Table?.length);

  console.log('Testing fromDT=2026-09-21, ToDate=2026-09-27, Isdefault=2 (YYYY-MM-DD)...');
  const d4 = await bseGet('/getCorp_Regulation_ng/w', { scripCode: '', Regulation: '', fromDT: '2026-09-21', ToDate: '2026-09-27', Isdefault: 2 });
  console.log('YYYY-MM-DD count:', d4?.Table?.length);
}

testInsiderDateFormats();
