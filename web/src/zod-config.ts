import { z } from "zod";

// Imported first by main.tsx, before any schema exists: zod would otherwise probe
// `new Function` to compile faster parsers, and the CSP forbids eval (M9).
z.config({ jitless: true });
