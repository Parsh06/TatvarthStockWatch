'use strict';

// Shared category mapping for backend notification filtering
const ALERT_CATEGORIES = {
  "Board Meeting": [
    "Board Meeting",
    "Committee Meeting",
    "Outcome of Board Meeting"
  ],
  "Result": [
    "Auditors Report",
    "Change in Accounting Year",
    "Financial Results",
    "Limited Review Report"
  ],
  "AGM/EGM": [
    "AGM",
    "Book Closure / AGM",
    "Court Convened Meeting",
    "EGM",
    "Postal Ballot"
  ],
  "Company Update": [
    "Announcement under Regulation 30",
    "Analysts/Institutional Investors Meet",
    "Closure of Trading Window",
    "Compliance Certificate",
    "Certificate",
    "Statement of Investor Complaint",
    "Shareholding pattern",
    "Disclosures",
    "Allotment of shares",
    "Annual Disclosure - Investor Complaints",
    "Annulment / Re-issue of forfeited shares",
    "Appointment of Chairman",
    "Appointment of Chairman and Managing Director",
    "Appointment of Chief Executive Officer (CEO)",
    "Appointment of Chief Financial Officer (CFO)",
    "Appointment of Company Secretary / Compliance Officer",
    "Appointment of Director",
    "Appointment of Interim Resolution Professional (IRP)",
    "Appointment of Managing Director",
    "Appointment of Managing Director & CEO",
    "Appointment of Statutory Auditor/s",
    "Approval of Resolution plan by Tribunal",
    "Arrangements (Sub-para 2-Para B)",
    "Award of Order / Receipt of Order",
    "Awarding of order(s)/contract(s) (Sub-para 4-Para B)",
    "Bagging/Receiving of orders/contracts (Sub-para 4-Para B)",
    "Board Meeting Adjourned",
    "Board Meeting Cancelled",
    "Board Meeting Deferred",
    "Board Meeting Postponed",
    "Board Meeting Rescheduled",
    "Buy back",
    "Cancellation of Dividend",
    "Capacity addition (Sub-para 3-Para B)",
    "Certificate under Reg. 74 (5) of SEBI (DP) Regulations, 2018",
    "Cessation",
    "Change in Auditors",
    "Change in Corporate Office Address",
    "Change in Directorate",
    "Change in Directors/ Key Managerial Personnel/ Auditor/ Compliance Officer/ Share Transfer Agent",
    "Change in Financial Year"
  ],
  "Corp. Action": [
    "Amalgamation / Merger / Demerger",
    "Bonds / Right issue",
    "Bonus",
    "Book Closure",
    "Capital Reduction",
    "Consolidation of Shares",
    "Dividend",
    "Record Date",
    "Sub-division / Stock Split"
  ],
  "Insider Trading / SAST": [
    "Closure of Trading Window",
    "Disclosures under Reg. 10(5) in respect of acquisition under Reg. 10(1)(a) of SEBI (SAST) Reg. 2011",
    "Disclosures under Reg. 10(5) in respect of acquisition under Reg. 10(4)(e) of SEBI (SAST) Reg. 2011",
    "Disclosures under Reg. 10(5) in respect of acquisition under Reg. 10(4)(f) of SEBI (SAST) Reg. 2011",
    "Disclosures under Reg. 10(6) of SEBI (SAST) Regulations, 2011",
    "Disclosures under Reg. 10(7) of SEBI (SAST) Regulations, 2011",
    "Disclosures under Reg. 18(6) of SEBI (SAST) Regulations, 2011",
    "Disclosures under Reg. 29(1) of SEBI (SAST) Regulations, 2011",
    "Disclosures under Reg. 29(2) of SEBI (SAST) Regulations, 2011",
    "Disclosures under Reg. 3(3) of SEBI (SAST) Regulations, 1997",
    "Disclosures under Reg. 31(1) and 31(2) of SEBI (SAST) Regulations, 2011",
    "Disclosures under Reg. 7(1) of SEBI (SAST) Regulations, 1997",
    "Disclosures under Reg. 7(1A) of SEBI (SAST) Regulations, 1997",
    "Disclosures under Reg. 7(2) read with Reg. 6(2) of SEBI (PIT) Regulations, 2015",
    "Disclosures under Reg. 7(3) of SEBI (SAST) Regulations, 1997",
    "Disclosures under Reg. 8A of SEBI (SAST) Regulations, 1997",
    "Disclosures under Reg.13(4) of SEBI (Prohibition of Insider Trading) Regulations, 1992",
    "Disclosures under Reg.13(4), 13(4A) of SEBI (Prohibition of Insider Trading) Regulations, 1992",
    "Disclosures under Reg.13(4),13(4A)and13(6) of SEBI (Prohibition of Insider Trading) Regulations,1992",
    "Disclosures under Reg.13(4A) of SEBI (Prohibition of Insider Trading) Regulations, 1992",
    "Disclosures under Reg.13(6) of SEBI (Prohibition of Insider Trading) Regulations, 1992"
  ],
  "New Listing": [
    "New Listing"
  ],
  "Integrated Filing": [
    "Integrated Filing (Financial)",
    "Integrated Filing (Governance)"
  ],
  "Others": [
    "57 (4) : Prior intimation to the beginning of the quarter",
    "57 (5) : intimation after the end of quarter",
    "Asset Liability Management (ALM) statement",
    "Business Responsibility and Sustainability Reporting (BRSR)",
    "Certificate from CEO/CFO",
    "Certificate under Reg. 54 (5) of SEBI (DP) Regulations, 1996",
    "Compliance under Regulation 52(6) of SEBI (LODR), 2015",
    "Details of Compliance officer and RTA of the Company",
    "Disclosure of divergence in the asset classification and provisioning by banks",
    "Disclosure under Reg. 31(4) of SEBI (SAST) Regulation, 2011",
    "Disclosures by listed entities of defaults on payment of interest/ repayment of principal amount for loans",
    "Disclosures by listed entities of defaults on payment of interest/ repayment of principal amount for unlisted",
    "Disclosures of reasons for encumbrance by promoter of listed companies under Reg. 31(1) read with Reg",
    "Format of the Annual Disclosure to be made by an entity identified as a Large Corporate",
    "Format of the Annual Disclosure to be made by an entity identified as a LC : Annexure B1",
    "Format of the Annual Disclosure to be made by an entity identified as a LC : Annexure B2",
    "Format of the Initial Disclosure to be made by an entity identified as a Large Corporate : Annexure A",
    "Half Yearly Communication - Debt Instruments",
    "Half Yearly Report (SEBI Circular No. CIR/IMD/DF-1/67/2017)",
    "Intimation of Repayment of Commercial Paper (CP)",
    "Mutual Fund Scheme Summary Document",
    "Outcome without intimation",
    "Quarterly Disclosures by listed entities of defaults on payment of interest/ repayment of principal amou",
    "Record Date/Book Closure as per Regulation (60)",
    "Reg 56- Documents and Intimation to Debenture Trustee",
    "Reg. 34 (1) Annual Report",
    "Reg. 39 (3) - Details of Loss of Certificate / Duplicate Certificate",
    "Reg. 50 (1) - Prior intimation about Board meeting under Regulation 50(1))",
    "Reg. 50 (1) - Prior intimation for Interest Payment / Redemption",
    "Reg. 50 (2) - Intimation to Exchange about Intention to raise Funds",
    "Reg. 50 (2) - Intimation to the Exchange about meeting under 50(2)",
    "Reg. 50 (3) - Board Meeting Intimation",
    "Reg. 51 (1), (2) - Price Sensitive information / disclosure of event / Information",
    "Reg. 52 (5) - Certificate from Debenture Trustee",
    "Reg. 52 (7) - Statement of Material Deviations in proceeds of issue of NCD / NCRP",
    "Reg. 52 - Declaration for Audit Report/s with Unmodified Opinion(s)",
    "Reg. 52 - Financial Result",
    "Reg. 52 - Statement of Impact on Audit Qualifications",
    "Reg. 53 - Annual Report",
    "Reg. 54 - Asset Cover details",
    "Reg. 55 - Credit Rating",
    "Reg. 57 (1) - Certificate of interest payment/Principal in case of NCD",
    "Reg. 57 (2) - Undertaking that documents & intimation submitted to Debenture trustee",
    "Reg. 59 - Prior approval from Stock Exchange for material modification in structure of NCD / NCRP",
    "Reg. 60 (2) - Record Date - interest /dividend / redemption /repayment",
    "Reg. 7 (2) - Prohibition of Insider Trading Regulations, 2015",
    "Reg. 7 (5) - Appointment / Change of RTA",
    "Regulation 61(4) - PCS Certificate for Transfer / Transmission / Transposition"
  ]
};

/**
 * Given a specific subcategory/category string from BSE/NSE,
 * resolves the parent group name (e.g. "Financial Results" -> "Result").
 * If no match is found, returns the original string or "Others".
 */
function resolveCategoryGroup(categoryStr) {
  if (!categoryStr) return "Others";
  const cat = categoryStr.trim();
  
  for (const [groupName, subcats] of Object.entries(ALERT_CATEGORIES)) {
    if (groupName.toLowerCase() === cat.toLowerCase()) return groupName;
    if (subcats.some(sub => sub.toLowerCase() === cat.toLowerCase())) {
      return groupName;
    }
  }
  
  return cat;
}

module.exports = {
  ALERT_CATEGORIES,
  resolveCategoryGroup
};
