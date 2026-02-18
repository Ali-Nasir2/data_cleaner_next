# Data Cleaning Studio (Next.js Fullstack, No-DB)

A bright enterprise-style data cleaning & transformation tool:
- Upload CSV / Excel
- Smart cleaning (headers, blanks, types, dedupe)
- Validation rules + issue list
- Step-by-step audit log
- Export cleaned CSV + cleaned Excel
- Export pipeline recipe (JSON) + Python (pandas) script

## Notes
- This is designed as a portfolio-friendly “version 2 (pro)” style app.
- Everything runs statelessly (no database). Files are processed in-memory.

## Deploy
- One repo on Vercel (Next.js fullstack). The cleaning runs in `/api/clean` on Node runtime.
