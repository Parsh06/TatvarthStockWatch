const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const str1 = '// ── OPEN: BSE script search ───────────────────────────────────────────────────';
const str2 = '// ── Portfolio storage (local mode) ────────────────────────────────────────────';
const str3 = '// ── OPEN: BSE corporate events calendar ──────────────────────────────────────';
const str4 = '// ── OPEN: BSE top gainers / losers (market-wide, 5-min cache) ────────────────';

const p1 = code.indexOf(str1);
const p2 = code.indexOf(str2);
const p3 = code.indexOf(str3);
const p4 = code.indexOf(str4);

if(p1 > -1 && p2 > -1 && p3 > -1 && p4 > -1) {
  let newCode = code.substring(0, p1) + 
                'app.use("/api/bse", require("./routes/bseRoutes")(verifyToken));\n' + 
                'app.get("/api/search/scripts", (req, res) => res.redirect(`/api/bse/search?q=${encodeURIComponent(req.query.q || "")}`));\n\n' +
                code.substring(p2, p3) + 
                code.substring(p4);
  fs.writeFileSync('server.js', newCode);
  console.log('Successfully replaced code blocks in server.js');
} else {
  console.log('Error: Could not find all markers.', {p1, p2, p3, p4});
}
