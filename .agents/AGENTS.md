# StockWatch — Agent Rules

## MANDATORY FIRST ACTION
**Before ANY code change, analysis, or response**, you MUST read the project context file:
```
GEMINI.md (at project root)
```
This file contains the complete project structure, tech stack, routing map, design system,
critical rules, and change recipes. It is the single source of truth.

## MANDATORY LAST ACTION
**After ANY code change** (new file, modified file, new route, new component, new dependency,
config change, structural change), you MUST update `GEMINI.md` to reflect the change:
- Update the file map (Section 3) if files were added/removed/renamed
- Update the routing map (Section 4) if routes were added/changed
- Update the tech stack (Section 2) if dependencies were added/removed
- Update the design system (Section 6) if styling tokens were changed
- Update the environment variables (Section 8) if env vars were added/changed
- Add an entry to the Changelog (Section 12) with today's date and summary

## Critical Rules Summary
1. **Category Sync**: `bseCategories.js` (frontend) ↔ `alertCategories.js` (backend) must be identical
2. **No Direct External API Calls**: Never call BSE/NSE/KFintech from frontend — always proxy through backend
3. **Fail-Safe Prefs**: If Firestore fails when fetching prefs → throw error, never default to empty
4. **Array Immutability**: Always `[...data].sort()` — never `data.sort()` in React
5. **Tailwind Tokens**: Use `bg-surface`, `text-textPrimary` — never hardcode colors
6. **Auth Required**: Every new API route needs `verifyToken` middleware
7. **Store Pattern**: Firestore/MongoDB ops go through `lib/*Store.js` — never import directly in routes
8. **API Client**: Frontend must use `apiClient.js` for all backend calls
9. **Update GEMINI.md**: After every structural change, update the master context file

## Styling
- Use Tailwind CSS with custom tokens from `tailwind.config.js`
- Use CSS variables from `index.css` for light/dark mode support
- Icons: `lucide-react` only
- Animations: Framer Motion
- Fonts: Inter (body), Space Grotesk (display), JetBrains Mono (code)

## Module Systems
- Frontend: ES Modules (`import`/`export`)
- Backend: CommonJS (`require`/`module.exports`)
