'use strict';

const {
  MODEL_CASCADE,
  safeParseJson,
  normalizeAnalysisOutput,
} = require('../lib/aiSummarizer');

async function runAiSummarizerTests() {
  console.log('Testing AI Summarizer 5-Tier Cascade & JSON Schema Normalizer...\n');
  let passed = 0;
  let failed = 0;

  function assert(desc, cond) {
    if (cond) {
      console.log(`  ✅ ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ ${desc}`);
      failed++;
    }
  }

  // 1. Verify Model Cascade Tiers
  assert('5-tier model cascade is defined', Array.isArray(MODEL_CASCADE) && MODEL_CASCADE.length === 5);
  assert('Tier 1 is gemini-2.5-flash', MODEL_CASCADE[0] === 'gemini-2.5-flash');
  assert('Tier 2 is gemini-2.0-flash', MODEL_CASCADE[1] === 'gemini-2.0-flash');
  assert('Tier 3 is gemini-1.5-flash', MODEL_CASCADE[2] === 'gemini-1.5-flash');
  assert('Tier 4 is gemini-3.1-flash-lite', MODEL_CASCADE[3] === 'gemini-3.1-flash-lite');
  assert('Tier 5 is gemini-3.5-flash-lite', MODEL_CASCADE[4] === 'gemini-3.5-flash-lite');

  // 2. Test safeParseJson
  const plainJson = '{"sentiment": "Positive", "importance": "High"}';
  const parsedPlain = safeParseJson(plainJson);
  assert('Parses plain JSON correctly', parsedPlain && parsedPlain.sentiment === 'Positive');

  const markdownJson = '```json\n{"sentiment": "Neutral", "importance": "Medium"}\n```';
  const parsedMarkdown = safeParseJson(markdownJson);
  assert('Strips ```json markdown code fences', parsedMarkdown && parsedMarkdown.sentiment === 'Neutral');

  const textWrappedJson = 'Here is the analysis:\n{"sentiment": "Negative", "importance": "High"}\nEnd of analysis.';
  const parsedWrapped = safeParseJson(textWrappedJson);
  assert('Extracts embedded JSON from surrounding text', parsedWrapped && parsedWrapped.sentiment === 'Negative');

  // 3. Test normalizeAnalysisOutput
  const incompleteOutput = {
    executiveSummary: 'Company reported 25% revenue growth.',
    sentiment: 'Positive',
  };
  const normalized = normalizeAnalysisOutput(incompleteOutput);
  assert('Normalizer preserves provided executive summary', normalized.executiveSummary.includes('25% revenue growth'));
  assert('Normalizer defaults announcementCategory when missing', normalized.announcementCategory === 'General Updates');
  assert('Normalizer defaults importance when missing', normalized.importance === 'Medium');
  assert('Normalizer initializes keyHighlights array', Array.isArray(normalized.keyHighlights));
  assert('Normalizer initializes financials object with applicable: false', normalized.financials.applicable === false);
  assert('Normalizer initializes forwardLooking object with applicable: false', normalized.forwardLooking.applicable === false);

  console.log(`\nAI Summarizer tests completed: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
  process.exit(0);
}

runAiSummarizerTests();
