import { NextResponse } from "next/server";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { cleanDataset, buildRecipe, recipeToPython } from "@/lib/cleaning/clean";
import type { DataRow } from "@/lib/cleaning/types";

export const runtime = "nodejs";

function asTextDecoder(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const win1252 = new TextDecoder("windows-1252").decode(bytes);

  const score = (s: string) => {
    const repl = (s.match(/�/g) || []).length;
    const mojibake = (s.match(/Ã|Â|â€|â€™|â€œ|ï»¿/g) || []).length;
    return repl + mojibake;
  };

  const chosen = score(win1252) < score(utf8) ? win1252 : utf8;
  return chosen.replace(/^\uFEFF/, "");
}

function makeCsv(columns: string[], rows: DataRow[]) {
  return Papa.unparse(rows, { columns });
}

function makeXlsx(columns: string[], rows: DataRow[]) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: columns });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "cleaned");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file uploaded." }, { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const ab = await file.arrayBuffer();

  let columns: string[] = [];
  let rows: DataRow[] = [];

  try {
    if (ext === "csv") {
      const text = asTextDecoder(ab);
      const parsed = Papa.parse<DataRow>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
      columns = (parsed.meta.fields || []).map(String);
      rows = (parsed.data || []) as DataRow[];
    } else if (ext === "xlsx" || ext === "xls") {
      const wb = XLSX.read(ab, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json<DataRow>(ws, { defval: null });
      rows = json;
      // collect columns preserving encounter order
      const set: string[] = [];
      for (const r of rows) {
        for (const k of Object.keys(r)) if (!set.includes(k)) set.push(k);
      }
      columns = set;
    } else {
      return NextResponse.json({ ok: false, error: "Unsupported file. Upload CSV or Excel." }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: "Failed to parse file." }, { status: 400 });
  }

  const result = cleanDataset(columns, rows);
  const recipe = buildRecipe(result);
  const py = recipeToPython(recipe);

  const csv = makeCsv(result.columns, result.rows);
  const xlsxB64 = makeXlsx(result.columns, result.rows);

  return NextResponse.json({
    ok: true,
    summary: {
      rowsIn: rows.length,
      rowsOut: result.rows.length,
      cols: result.columns.length,
      issues: result.issues.length,
    },
    result,
    exports: {
      cleanedCsv: csv,
      cleanedXlsxBase64: xlsxB64,
      recipe,
      python: py,
    },
  });
}
