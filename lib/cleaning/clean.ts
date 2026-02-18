import { ColumnType, type AuditEntry, type ChangeLogEntry, type CleanResult, type DataRow, type PipelineRecipe, type ValidationIssue } from "./types";

const EMPTY_TOKENS = new Set([
  "",
  "na",
  "n/a",
  "n.a",
  "null",
  "nil",
  "none",
  "nan",
  "tbd",
  "nill",
  "-",
  "--",
]);

function slugHeader(h: string) {
  const raw = (h ?? "").toString().trim();
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "col";
}

function uniqHeaders(headers: string[]) {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const s = slugHeader(h);
    const n = seen.get(s) ?? 0;
    seen.set(s, n + 1);
    return n === 0 ? s : `${s}_${n + 1}`;
  });
}

function isEmpty(v: any) {
  if (v === null || v === undefined) return true;
  if (typeof v !== "string") return false;
  const t = normalizeWhitespace(v).toLowerCase();
  return EMPTY_TOKENS.has(t);
}

function normalizeWhitespace(s: string) {
  return (s ?? "")
    .toString()
    .normalize("NFKC")
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCaseText(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}

function normalizeCityName(value: any): string | null {
  if (isEmpty(value)) return null;
  const t = normalizeWhitespace(String(value)).toLowerCase();
  const map: Record<string, string> = {
    isb: "Islamabad",
    isl: "Islamabad",
    i8: "Islamabad",
    lhr: "Lahore",
    khi: "Karachi",
    rwp: "Rawalpindi",
  };
  if (map[t]) return map[t];
  return titleCaseText(t);
}

function normalizePaymentMethod(value: any): string | null {
  if (isEmpty(value)) return null;
  const t = normalizeWhitespace(String(value)).toLowerCase();
  if (!t) return null;
  if (/(^|\s)cash($|\s)/.test(t)) return "Cash";
  if (/^card$|credit|debit/.test(t)) return "Card";
  if (/bank\s*trans|bank\s*transfer|wire|iban/.test(t)) return "Bank Transfer";
  const cleaned = t.replace(/[-_]/g, " ").trim();
  return titleCaseText(cleaned);
}


function normalizeProduct(value: any): string | null {
  if (isEmpty(value)) return null;
  const raw = normalizeWhitespace(String(value));
  const t = raw.toLowerCase();

  const exactMap: Record<string, string> = {
    laptop: "Laptop",
    notebook: "Laptop",
    keyboard: "Keyboard",
    "키보드": "Keyboard",
    mouse: "Mouse",
    headphones: "Headphones",
    headphone: "Headphones",
    "헤드폰": "Headphones",
    phone: "Phone",
    mobile: "Phone",
    smartphone: "Phone",
    "휴대폰": "Phone",
  };

  if (exactMap[t]) return exactMap[t];

  if (/laptop|notebook/.test(t)) return "Laptop";
  if (/key\s*board|keyboard/.test(t)) return "Keyboard";
  if (/mouse/.test(t)) return "Mouse";
  if (/head\s*phone|headset|ear\s*phone/.test(t)) return "Headphones";
  if (/phone|mobile|smart\s*phone|cell\s*phone/.test(t)) return "Phone";

  // If it's not a recognizable authentic product, blank it.
  return null;
}

function normalizeCurrencyCode(value: any): string | null {
  if (isEmpty(value)) return null;
  const t = normalizeWhitespace(String(value)).toLowerCase();
  if (!t) return null;

  if (/\b(pkr|pak(istani)?\s+rupee)\b|₨|\brs\.?\b/.test(t)) return "PKR";
  if (/\b(usd|us\s*dollar|dollars?)\b|\$/.test(t)) return "USD";
  if (/\b(eur|euro|euros)\b|€/.test(t)) return "EUR";
  if (/\b(gbp|pound|pounds|sterling)\b|£/.test(t)) return "GBP";
  if (/\b(jpy|yen)\b|¥/.test(t)) return "JPY";

  return t.toUpperCase();
}


function normalizePhone(value: any): string | null {
  if (isEmpty(value)) return null;
  const raw = normalizeWhitespace(String(value));
  if (!raw) return null;

  const digits = raw.replace(/\D+/g, "");
  let local = digits;

  // +92XXXXXXXXXX or 92XXXXXXXXXX -> 0XXXXXXXXXX
  if (local.length === 12 && local.startsWith("92")) {
    local = `0${local.slice(2)}`;
  }

  // 0092XXXXXXXXXX -> 0XXXXXXXXXX
  if (local.length === 14 && local.startsWith("0092")) {
    local = `0${local.slice(4)}`;
  }

  // 3XXXXXXXXX -> 03XXXXXXXXX (missing leading zero)
  if (local.length === 10 && local.startsWith("3")) {
    local = `0${local}`;
  }

  // Final strict format: 03XXXXXXXXX
  if (!/^03\d{9}$/.test(local)) return null;
  return local;
}

function trackChange(changeLog: ChangeLogEntry[], rowIndex: number, column: string, rule: string, before: any, after: any, message?: string) {
  if (before === after) return;
  if (before == null && after == null) return;
  changeLog.push({ rowIndex, column, rule, before, after, message });
}

function tryNumber(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const t = normalizeWhitespace(v);
  if (!t) return null;
  if (EMPTY_TOKENS.has(t.toLowerCase())) return null;

  const accounting = /^\((.*)\)$/.exec(t);
  const signed = accounting ? `-${accounting[1]}` : t;
  const cleaned = signed
    .replace(/\b(usd|pkr|eur|gbp|inr|rs\.?|aed)\b/gi, "")
    .replace(/[$€£₨]/g, "")
    .replace(/\/?-$/g, "")
    .replace(/[,%\s]+/g, "")
    .trim();

  const m = cleaned.match(/^-?\d+(\.\d+)?$/);
  if (!m) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function trySatisfactionScore(v: any): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;

  const t = normalizeWhitespace(v).toLowerCase();
  if (!t || EMPTY_TOKENS.has(t)) return null;

  const numeric = tryNumber(t);
  if (numeric !== null) return numeric;

  const exact: Record<string, number> = {
    zero: 0,
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    "very poor": 1,
    poor: 2,
    fair: 3,
    average: 3,
    neutral: 3,
    good: 4,
    excellent: 5,
    satisfied: 4,
    dissatisfied: 2,
    "very satisfied": 5,
    "very dissatisfied": 1,
  };
  if (exact[t] !== undefined) return exact[t];

  if (/\b(very\s+)?satisfied\b|\bexcellent\b|\boutstanding\b/.test(t)) return 5;
  if (/\bgood\b/.test(t)) return 4;
  if (/\baverage\b|\bneutral\b|\bok\b|\bfair\b/.test(t)) return 3;
  if (/\bdissatisfied\b|\bpoor\b|\bbad\b/.test(t)) return 2;
  if (/\bvery\s+(poor|bad|dissatisfied)\b|\bterrible\b/.test(t)) return 1;
  if (/\bzero\b|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bfive\b/.test(t)) {
    const words: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5 };
    for (const [word, score] of Object.entries(words)) {
      if (new RegExp(`\\b${word}\\b`).test(t)) return score;
    }
  }

  return null;
}

function tryBoolean(v: any): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(t)) return true;
  if (["false", "no", "n", "0"].includes(t)) return false;
  return null;
}

function tryDate(v: any): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();

  if (typeof v === "number" && Number.isFinite(v) && v > 20000 && v < 90000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const ms = excelEpoch + Math.trunc(v) * 24 * 60 * 60 * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  if (typeof v !== "string") return null;
  const t = normalizeWhitespace(v);
  if (!t) return null;
  if (EMPTY_TOKENS.has(t.toLowerCase())) return null;

  const isValidYmd = (yy: number, mm: number, dd: number) => {
    if (yy < 1900 || yy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
    const d = new Date(Date.UTC(yy, mm - 1, dd));
    return d.getUTCFullYear() === yy && d.getUTCMonth() === mm - 1 && d.getUTCDate() === dd;
  };

  const ymd = t.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (ymd) {
    const yy = Number(ymd[1]);
    const mm = Number(ymd[2]);
    const dd = Number(ymd[3]);
    if (isValidYmd(yy, mm, dd)) return new Date(Date.UTC(yy, mm - 1, dd)).toISOString();
    return null;
  }

  const m = t.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const p1 = Number(m[1]);
    const p2 = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const dayFirst = p1 > 12;
    const dd = dayFirst ? p1 : p2;
    const mm = dayFirst ? p2 : p1;
    if (isValidYmd(yy, mm, dd)) return new Date(Date.UTC(yy, mm - 1, dd)).toISOString();
    return null;
  }

  const iso = Date.parse(t);
  if (!Number.isNaN(iso)) return new Date(iso).toISOString();

  return null;
}

function formatDateForOutput(isoOrDate: string): string {
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate;
  const day = d.getUTCDate();
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function inferType(values: any[]): ColumnType {
  const nonEmpty = values.filter((v) => !isEmpty(v)).slice(0, 250);
  if (nonEmpty.length === 0) return "unknown";

  let nNum = 0, nDate = 0, nBool = 0;
  for (const v of nonEmpty) {
    if (tryBoolean(v) !== null) nBool += 1;
    if (tryNumber(v) !== null) nNum += 1;
    if (tryDate(v) !== null) nDate += 1;
  }
  const frac = (n: number) => n / nonEmpty.length;

  // Order matters: boolean tends to be "yes/no", number tends to be strict, date is permissive
  if (frac(nBool) >= 0.9) return "boolean";
  if (frac(nNum) >= 0.8) return "number";
  if (frac(nDate) >= 0.8) return "date";
  return "string";
}

function applyTypes(rows: DataRow[], types: Record<string, ColumnType>, audit: AuditEntry[]) {
  let changed = 0;
  const out = rows.map((r) => {
    const nr: DataRow = { ...r };
    for (const [k, t] of Object.entries(types)) {
      const v = nr[k];
      if (isEmpty(v)) { nr[k] = null; continue; }
      if (t === "number") {
        const n = tryNumber(v);
        if (n !== null && n !== v) { nr[k] = n; changed += 1; }
      } else if (t === "boolean") {
        const b = tryBoolean(v);
        if (b !== null && b !== v) { nr[k] = b; changed += 1; }
      } else if (t === "date") {
        const d = tryDate(v);
        if (d !== null && d !== v) { nr[k] = d; changed += 1; }
      } else if (t === "string" && typeof v === "string") {
        const s = normalizeWhitespace(v);
        if (s !== v) { nr[k] = s; changed += 1; }
      }
    }
    return nr;
  });

  audit.push({ step: "Type casting + string normalization", changedCells: changed });
  return out;
}

function applyProRules(rows: DataRow[], columns: string[], changeLog: ChangeLogEntry[], audit: AuditEntry[]): { rows: DataRow[]; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const emailCols = columns.filter((c) => /email/i.test(c));
  const phoneCols = columns.filter((c) => /phone|mobile|contact/i.test(c));
  const cityCols = columns.filter((c) => /city/i.test(c));
  const productCols = columns.filter((c) => /product|item_name|item/i.test(c));
  const categoryCols = columns.filter((c) => /category/i.test(c));
  const statusCols = columns.filter((c) => /status/i.test(c));
  const notesCols = columns.filter((c) => /(^|_)(note|notes|remark|remarks|comment|comments)($|_)/i.test(c));
  const satisfactionCols = columns.filter((c) => /satisfaction|rating/i.test(c));
  const customerNameCols = columns.filter((c) => /customer_?name|client_?name|name/i.test(c));
  const dateCols = columns.filter((c) => /date|time/i.test(c));
  const currencyCols = columns.filter((c) => /currency/i.test(c));
  const paymentCols = columns.filter((c) => /payment/i.test(c));
  const orderIdCols = columns.filter((c) => /(^|_)order_?id$/i.test(c));
  const qtyCols = columns.filter((c) => /(^|_)qty$|quantity/i.test(c));
  const unitPriceCols = columns.filter((c) => /unit_?price|price/i.test(c));
  const totalCols = columns.filter((c) => /total_?amount|total/i.test(c));
  const discountCols = columns.filter((c) => /discount|discount_?percent|disc_?pct/i.test(c));
  const numericCols = columns.filter((c) => /(^|_)qty$|quantity|unit_?price|total_?amount|discount|amount|cost|rate/i.test(c));
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  let changed = 0;

  const out = rows.map((row, rowIndex) => {
    const next: DataRow = { ...row };

    for (const c of columns) {
      if (typeof next[c] === "string") {
        const before = next[c];
        const after = normalizeWhitespace(before);
        if (before !== after) {
          next[c] = after;
          changed += 1;
          trackChange(changeLog, rowIndex, c, "trim_whitespace", before, after, "Trimmed and normalized whitespace.");
        }
        if (isEmpty(next[c])) {
          trackChange(changeLog, rowIndex, c, "empty_to_null", next[c], null, "Standardized empty token to null.");
          next[c] = null;
          changed += 1;
        }
      }
    }

    for (const c of cityCols) {
      if (isEmpty(next[c])) continue;
      const before = next[c];
      const after = normalizeCityName(before);
      if (before !== after) {
        next[c] = after;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "case_city", before, after, "Standardized city casing.");
      }
    }

    for (const c of productCols) {
      const before = next[c];
      if (isEmpty(before)) continue;
      const normalized = normalizeProduct(before);
      if (normalized === null) {
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_product_blank", before, null, "Unrecognized/non-authentic product value replaced with blank.");
        issues.push({ rowIndex, column: c, rule: "product", value: before, message: "Unrecognized product value. Replaced with blank." });
      } else if (before !== normalized) {
        next[c] = normalized;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_product", before, normalized, "Normalized/translated product value to canonical form.");
      }
    }

    for (const c of customerNameCols) {
      if (typeof next[c] !== "string") continue;
      const before = next[c];
      const after = titleCaseText(before);
      if (before !== after) {
        next[c] = after;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_customer_name", before, after, "Standardized customer name casing.");
      }
    }

    for (const c of categoryCols) {
      if (typeof next[c] !== "string") continue;
      const before = next[c];
      const after = titleCaseText(before);
      if (before !== after) {
        next[c] = after;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "case_category", before, after, "Standardized category casing.");
      }
    }

    for (const c of statusCols) {
      if (typeof next[c] !== "string") continue;
      const before = next[c];
      const raw = normalizeWhitespace(before).toLowerCase();
      const statusMap: Record<string, string> = {
        pending: "Pending",
        paid: "Paid",
        cancelled: "Cancelled",
        canceled: "Cancelled",
      };
      const after = statusMap[raw] ?? titleCaseText(raw);
      if (before !== after) {
        next[c] = after;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "case_status", before, after, "Standardized status casing.");
      }
    }

    for (const c of notesCols) {
      if (typeof next[c] !== "string") continue;
      const before = next[c];
      const after = titleCaseText(before);
      if (before !== after) {
        next[c] = after;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_notes", before, after, "Standardized notes casing.");
      }
    }

    for (const c of orderIdCols) {
      const v = next[c];
      if (isEmpty(v)) continue;
      const before = String(v);
      const cleaned = normalizeWhitespace(before).replace(/[^A-Za-z0-9]/g, "");
      if (!cleaned) {
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_order_id_blank", before, null, "Order ID had no valid alphanumeric characters after cleanup.");
        issues.push({ rowIndex, column: c, rule: "order_id", value: before, message: "Invalid order ID. Replaced with blank." });
      } else if (before !== cleaned) {
        const canonical = /^\d+$/.test(cleaned) ? Number(cleaned) : cleaned.toUpperCase();
        next[c] = canonical;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_order_id", before, canonical, "Removed special characters and standardized order ID format.");
      } else if (/^\d+$/.test(cleaned) && typeof next[c] !== "number") {
        const canonical = Number(cleaned);
        next[c] = canonical;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_order_id_type", before, canonical, "Standardized numeric order ID type.");
      }
    }

    for (const c of paymentCols) {
      const before = next[c];
      const normalized = normalizePaymentMethod(before);
      if (before !== normalized) {
        next[c] = normalized;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_payment", before, normalized, "Standardized payment method.");
      }
    }

    for (const c of emailCols) {
      const v = next[c];
      if (isEmpty(v)) continue;
      const before = String(v);
      const lowered = normalizeWhitespace(before).toLowerCase();
      if (!emailRe.test(lowered)) {
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_email_blank", before, null, "Invalid email replaced with blank.");
        issues.push({ rowIndex, column: c, rule: "email", value: before, message: "Invalid email format. Replaced with blank." });
      } else if (before !== lowered) {
        next[c] = lowered;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_email", before, lowered, "Normalized email casing.");
      }
    }

    for (const c of phoneCols) {
      const v = next[c];
      if (isEmpty(v)) continue;
      const before = String(v);
      const normalized = normalizePhone(before);
      if (normalized === null) {
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_phone_blank", before, null, "Invalid phone replaced with blank.");
        issues.push({ rowIndex, column: c, rule: "phone", value: before, message: "Invalid phone format. Replaced with blank." });
      } else if (before !== normalized) {
        next[c] = normalized;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_phone", before, normalized, "Normalized phone digits and optional + prefix.");
      }
    }

    for (const c of dateCols) {
      const v = next[c];
      if (isEmpty(v)) continue;
      const before = v;
      const parsed = tryDate(v);
      if (parsed === null) {
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_date_blank", before, null, "Invalid date replaced with blank.");
        issues.push({ rowIndex, column: c, rule: "date", value: before, message: "Invalid date value. Replaced with blank." });
      } else {
        const formatted = formatDateForOutput(parsed);
        if (before === formatted) continue;
        next[c] = formatted;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_date", before, formatted, "Parsed date to D/M/YYYY format.");
      }
    }

    for (const c of numericCols) {
      const v = next[c];
      if (isEmpty(v)) continue;
      const before = v;
      const n = tryNumber(v);
      if (n === null) {
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_number_blank", before, null, "Invalid numeric value replaced with blank.");
        issues.push({ rowIndex, column: c, rule: "number", value: before, message: "Invalid numeric value. Replaced with blank." });
      } else if (before !== n) {
        next[c] = n;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "coerce_number", before, n, "Coerced value to numeric.");
      }
    }

    for (const c of qtyCols) {
      const v = next[c];
      if (isEmpty(v)) continue;
      const qty = typeof v === "number" ? v : tryNumber(v);
      if (qty === null) continue;

      if (qty < 0) {
        const before = next[c];
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_quantity_negative", before, null, "Negative quantity replaced with blank.");
        issues.push({ rowIndex, column: c, rule: "quantity", value: before, message: "Quantity cannot be negative. Replaced with blank." });
      } else if (qty > 50) {
        const before = next[c];
        next[c] = 50;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "cap_quantity_max", before, 50, "Quantity capped at maximum allowed value (50).");
        issues.push({ rowIndex, column: c, rule: "quantity", value: before, message: "Quantity exceeded 50. Capped to 50." });
      }
    }

    for (const c of unitPriceCols) {
      const v = next[c];
      if (isEmpty(v)) continue;
      const price = typeof v === "number" ? v : tryNumber(v);
      if (price === null) continue;

      if (price < 0) {
        const before = next[c];
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_price_negative", before, null, "Negative price replaced with blank.");
        issues.push({ rowIndex, column: c, rule: "price", value: before, message: "Price cannot be negative. Replaced with blank." });
      }
    }

    for (const c of currencyCols) {
      const before = next[c];
      const normalized = normalizeCurrencyCode(before);
      if (before !== normalized) {
        next[c] = normalized;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "normalize_currency", before, normalized, "Standardized currency code or converted symbol to code.");
      }
    }

    for (const c of discountCols) {
      const v = next[c];
      if (isEmpty(v)) continue;
      const discount = typeof v === "number" ? v : tryNumber(v);
      if (discount === null) continue;

      if (discount < 0) {
        const before = next[c];
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_discount_negative", before, null, "Negative discount replaced with blank.");
        issues.push({ rowIndex, column: c, rule: "discount", value: before, message: "Discount cannot be negative. Replaced with blank." });
      } else if (discount > 90) {
        const before = next[c];
        const formatted = "90%";
        next[c] = formatted;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "cap_discount_max", before, formatted, "Discount capped at 90%.");
        issues.push({ rowIndex, column: c, rule: "discount", value: before, message: "Discount exceeded 90%. Capped to 90." });
      } else {
        const before = next[c];
        const formatted = `${discount}%`;
        if (before !== formatted) {
          next[c] = formatted;
          changed += 1;
          trackChange(changeLog, rowIndex, c, "format_discount_percent", before, formatted, "Added % symbol to discount.");
        }
      }
    }

    for (const c of satisfactionCols) {
      const v = next[c];
      if (isEmpty(v)) continue;
      const score = trySatisfactionScore(v);
      if (score === null) {
        const before = next[c];
        next[c] = null;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "invalid_satisfaction_blank", before, null, "Unrecognized satisfaction value replaced with blank.");
        issues.push({ rowIndex, column: c, rule: "satisfaction", value: before, message: "Satisfaction must be numeric (0 to 5). Unrecognized text replaced with blank." });
        continue;
      }

      if (score < 0) {
        const before = next[c];
        next[c] = 0;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "min_satisfaction", before, 0, "Satisfaction floored to 0.");
        issues.push({ rowIndex, column: c, rule: "satisfaction", value: before, message: "Satisfaction cannot be below 0. Set to 0." });
      } else if (score > 5) {
        const before = next[c];
        next[c] = 5;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "max_satisfaction", before, 5, "Satisfaction capped at 5.");
        issues.push({ rowIndex, column: c, rule: "satisfaction", value: before, message: "Satisfaction cannot exceed 5. Capped to 5." });
      } else if (typeof next[c] !== "number") {
        const before = next[c];
        next[c] = score;
        changed += 1;
        trackChange(changeLog, rowIndex, c, "coerce_satisfaction", before, score, "Coerced satisfaction to number.");
      }
    }

    const qtyCol = qtyCols[0];
    const unitCol = unitPriceCols.find((c) => /unit_?price/i.test(c)) ?? unitPriceCols[0];
    const totalCol = totalCols.find((c) => /total_?amount/i.test(c)) ?? totalCols[0];
    if (qtyCol && unitCol && totalCol) {
      const qty = typeof next[qtyCol] === "number" ? next[qtyCol] : tryNumber(next[qtyCol]);
      const unit = typeof next[unitCol] === "number" ? next[unitCol] : tryNumber(next[unitCol]);
      if (qty !== null && qty >= 0 && unit !== null && unit >= 0) {
        const computed = Number((qty * unit).toFixed(2));
        const before = next[totalCol];
        if (before !== computed) {
          next[totalCol] = computed;
          changed += 1;
          if (before === null || before === undefined) {
            trackChange(changeLog, rowIndex, totalCol, "compute_total", before, computed, `Computed ${totalCol} = ${qtyCol} × ${unitCol}.`);
          } else {
            trackChange(changeLog, rowIndex, totalCol, "fix_total_mismatch", before, computed, `Corrected ${totalCol} to ${qtyCol} × ${unitCol}.`);
            issues.push({ rowIndex, column: totalCol, rule: "total_mismatch", value: before, message: `Replaced incorrect total with correct calculation: ${qtyCol} × ${unitCol}.` });
          }
        }
      } else {
        const before = next[totalCol];
        if (before !== null && before !== undefined) {
          next[totalCol] = null;
          changed += 1;
          trackChange(changeLog, rowIndex, totalCol, "blank_total_missing_inputs", before, null, `Blanked ${totalCol} because ${qtyCol} or ${unitCol} is missing/invalid.`);
          issues.push({ rowIndex, column: totalCol, rule: "total_missing_inputs", value: before, message: `Total blanked: missing or invalid quantity or unit price.` });
        }
      }
    }

    return next;
  });

  audit.push({ step: "Pro cleaning rules", changedCells: changed, notes: ["Applied casing, contact, date, numeric, currency normalization, and optional total fixes."] });
  audit.push({ step: "Row-level change log", notes: [`${changeLog.length} cell-level changes recorded.`] });
  return { rows: out, issues };
}

function dedupeRows(rows: DataRow[], columns: string[], audit: AuditEntry[]) {
  const seen = new Set<string>();
  const out: DataRow[] = [];
  let removed = 0;

  for (const r of rows) {
    const key = JSON.stringify(columns.map((c) => r[c] ?? null));
    if (seen.has(key)) { removed += 1; continue; }
    seen.add(key);
    out.push(r);
  }
  if (removed) audit.push({ step: "Removed duplicate rows", affectedRows: removed });
  return out;
}

function validate(rows: DataRow[], columns: string[], types: Record<string, ColumnType>, audit: AuditEntry[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const colLower = columns.map((c) => c.toLowerCase());

  const likelyIdCols = columns.filter((c) => /(^id$|_id$|sku$|product_id$)/i.test(c));
  const emailCols = columns.filter((c) => /email/i.test(c));
  const urlCols = columns.filter((c) => /url/i.test(c));
  const priceCols = columns.filter((c) => /(price|amount|cost|total)/i.test(c));
  const dateCols = columns.filter((c) => /date|time/i.test(c));

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

  // Uniqueness checks (only if low missing)
  for (const c of likelyIdCols) {
    const vals = rows.map((r) => r[c]).filter((v) => !isEmpty(v));
    const missingFrac = 1 - vals.length / Math.max(1, rows.length);
    if (missingFrac < 0.6 && vals.length > 0) {
      const uniq = new Set(vals.map(String));
      if (uniq.size !== vals.length) {
        issues.push({ rowIndex: -1, column: c, rule: "unique", value: null, message: "Column looks like an identifier but contains duplicates." });
      }
    }
  }

  rows.forEach((r, i) => {
    // email format
    for (const c of emailCols) {
      const v = r[c];
      if (isEmpty(v)) continue;
      const s = String(v).trim();
      if (!emailRe.test(s)) {
        issues.push({ rowIndex: i, column: c, rule: "email", value: v, message: "Invalid email format." });
      }
    }
    // url format
    for (const c of urlCols) {
      const v = r[c];
      if (isEmpty(v)) continue;
      const s = String(v).trim();
      if (!/^https?:\/\//i.test(s)) {
        issues.push({ rowIndex: i, column: c, rule: "url", value: v, message: "URL should start with http(s)://." });
      }
    }
    // non-negative prices
    for (const c of priceCols) {
      const v = r[c];
      if (isEmpty(v)) continue;
      const n = typeof v === "number" ? v : tryNumber(String(v));
      if (n === null) continue;
      if (n < 0) issues.push({ rowIndex: i, column: c, rule: "non_negative", value: v, message: "Price/amount should be non-negative." });
    }

    for (const c of dateCols) {
      const v = r[c];
      if (isEmpty(v)) continue;
      const d = tryDate(v);
      if (d === null) {
        issues.push({ rowIndex: i, column: c, rule: "date", value: v, message: "Invalid date format/value." });
      }
    }
  });

  // Basic outlier flagging for numeric cols (soft warning)
  const numCols = columns.filter((c) => types[c] === "number");
  for (const c of numCols) {
    const vals = rows.map((r) => r[c]).filter((v) => typeof v === "number" && Number.isFinite(v)) as number[];
    if (vals.length < 20) continue;
    const sorted = [...vals].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    const outliers = vals.filter((v) => v < lo || v > hi).length;
    if (outliers) {
      audit.push({ step: "Outlier scan (IQR)", detail: c, notes: [`${outliers} potential outliers flagged (not removed).`] });
    }
  }

  if (issues.length) audit.push({ step: "Validation", notes: [`${issues.length} issues detected (download audit for details).`] });
  else audit.push({ step: "Validation", notes: ["No obvious issues detected by the default rules."] });

  return issues;
}

export function cleanDataset(inputColumns: string[], inputRows: DataRow[]) : CleanResult {
  const audit: AuditEntry[] = [];
  const changeLog: ChangeLogEntry[] = [];

  const columns = uniqHeaders(inputColumns);
  if (columns.join("|") !== inputColumns.map(slugHeader).map((h, idx) => idx===0? h: h).join("|")) {
    audit.push({ step: "Normalized headers", notes: ["Lowercased, removed symbols, replaced spaces with underscores."] });
  }

  // Re-map row keys to normalized headers
  const mappedRows: DataRow[] = inputRows.map((r) => {
    const nr: DataRow = {};
    inputColumns.forEach((orig, i) => {
      const key = columns[i];
      nr[key] = r[orig];
    });
    return nr;
  });

  // Empty strings -> null
  let emptied = 0;
  const nulled = mappedRows.map((r) => {
    const nr: DataRow = { ...r };
    for (const c of columns) {
      const v = nr[c];
      if (typeof v === "string") {
        const s = normalizeWhitespace(v);
        if (s !== v) emptied += 1;
        nr[c] = s;
      }
      if (isEmpty(nr[c])) { nr[c] = null; emptied += 1; }
    }
    return nr;
  });
  audit.push({ step: "Standardized blanks", changedCells: emptied, notes: ["Trimmed whitespace and converted empty cells to null."] });

  // infer types
  const inferredTypes: Record<string, ColumnType> = {};
  for (const c of columns) {
    inferredTypes[c] = inferType(nulled.map((r) => r[c]));
    if (/(^|_)(unit_)?price$|amount|cost|total|qty|quantity|discount|rate/i.test(c) && inferredTypes[c] === "string") {
      inferredTypes[c] = "number";
    }
    if (/(^|_)(order_)?date$|timestamp|created_at|updated_at/i.test(c) && inferredTypes[c] === "string") {
      inferredTypes[c] = "date";
    }
  }
  audit.push({ step: "Inferred column types", notes: Object.entries(inferredTypes).slice(0, 10).map(([c,t]) => `${c}: ${t}`) });

  const typed = applyTypes(nulled, inferredTypes, audit);
  const pro = applyProRules(typed, columns, changeLog, audit);
  const deduped = dedupeRows(pro.rows, columns, audit);
  const issues = [...pro.issues, ...validate(deduped, columns, inferredTypes, audit)];

  return { columns, rows: deduped, inferredTypes, audit, changeLog, issues };
}

export function buildRecipe(result: CleanResult): PipelineRecipe {
  return {
    version: "1.0",
    createdAt: new Date().toISOString(),
    inferredTypes: result.inferredTypes,
    steps: [
      { id: "normalize_headers" },
      { id: "standardize_blanks" },
      { id: "infer_types" },
      { id: "cast_types" },
      { id: "pro_clean_rules" },
      { id: "dedupe_rows" },
      { id: "validate_default_rules" },
      { id: "outlier_scan_iqr" },
    ],
  };
}

export function recipeToPython(recipe: PipelineRecipe) {
  const lines: string[] = [];
  lines.push("import pandas as pd");
  lines.push("");
  lines.push("# Data Cleaning Studio — exported pipeline");
  lines.push("# Usage: df = pd.read_csv('input.csv'); df = apply_pipeline(df)");
  lines.push("");
  lines.push("def apply_pipeline(df: pd.DataFrame) -> pd.DataFrame:");
  lines.push("    # normalize headers");
  lines.push("    df = df.copy()");
  lines.push("    df.columns = [str(c).strip().lower() for c in df.columns]");
  lines.push("    df.columns = [__slug(c) for c in df.columns]");
  lines.push("    # blanks -> NaN");
  lines.push("    df = df.replace(r'^\s*$', pd.NA, regex=True)");
  lines.push("    # type casts");
  lines.push("    for col, t in __TYPES.items():");
  lines.push("        if col not in df.columns: continue");
  lines.push("        if t == 'number':");
  lines.push("            df[col] = pd.to_numeric(df[col].astype(str).str.replace(',', '').str.replace('Rs.', '', regex=False), errors='coerce')");
  lines.push("        elif t == 'boolean':");
  lines.push("            df[col] = df[col].astype(str).str.lower().map({'true':True,'yes':True,'y':True,'1':True,'false':False,'no':False,'n':False,'0':False})");
  lines.push("        elif t == 'date':");
  lines.push("            df[col] = pd.to_datetime(df[col], errors='coerce', utc=True)");
  lines.push("        else:");
  lines.push("            df[col] = df[col].astype(str).str.replace(r'\s+', ' ', regex=True).str.strip()");
  lines.push("    # drop exact duplicate rows");
  lines.push("    df = df.drop_duplicates()")
  lines.push("    return df")
  lines.push("")
  lines.push("def __slug(s: str) -> str:")
  lines.push("    import re")
  lines.push("    s = (s or '').strip().lower()")
  lines.push("    s = re.sub(r'[^a-z0-9]+', '_', s)")
  lines.push("    s = re.sub(r'^_+|_+$', '', s)")
  lines.push("    return s or 'col'")
  lines.push("")
  lines.push(`__TYPES = ${JSON.stringify(recipe.inferredTypes, null, 4)}`);
  return lines.join("\n");
}
