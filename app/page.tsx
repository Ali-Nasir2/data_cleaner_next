"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { UploadCloud, Sparkles, Download, ShieldCheck, FileSpreadsheet, FileText, Wand2 } from "lucide-react";

type ApiResp = {
  ok: boolean;
  error?: string;
  summary?: { rowsIn: number; rowsOut: number; cols: number; issues: number };
  result?: any;
  exports?: {
    cleanedCsv: string;
    cleanedXlsxBase64: string;
    recipe: any;
    python: string;
  };
};

function downloadText(name: string, content: string, type="text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadBase64(name: string, b64: string, mime: string) {
  const byteChars = atob(b64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<ApiResp | null>(null);

  const canRun = !!file && !busy;

  const title = "Data Cleaning Studio";
  const subtitle = "Clean + transform + validate, then export a reproducible pipeline";

  async function run() {
    if (!file) return;
    setBusy(true);
    setResp(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const r = await fetch("/api/clean", { method: "POST", body: fd });
      const j = (await r.json()) as ApiResp;
      setResp(j);
    } catch (e: any) {
      setResp({ ok: false, error: "Request failed. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const previewRows = useMemo(() => {
    const rows = resp?.result?.rows ?? [];
    return rows.slice(0, 10);
  }, [resp]);

  const previewCols = useMemo(() => {
    const cols = resp?.result?.columns ?? [];
    return cols.slice(0, 8);
  }, [resp]);

  return (
    <div className="relative min-h-screen bg-grid noise">
      <div className="pointer-events-none absolute inset-0 bg-radial-fade" />
      <div className="mx-auto max-w-[1200px] px-4 py-10 relative">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs text-slate-600 shadow-soft">
              <Sparkles className="h-4 w-4 text-blue-600" />
              Bright Enterprise
            </div>
            <h1 className="mt-3 text-3xl md:text-4xl font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
            <p className="mt-2 text-slate-600 max-w-[72ch]">{subtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone="accent"><ShieldCheck className="h-3.5 w-3.5" /> Default validation</Badge>
            <Badge tone="ok"><Wand2 className="h-3.5 w-3.5" /> Smart cleaning</Badge>
          </div>
        </header>

        {/* Sample Dataset Section */}
        <Card className="mt-8 overflow-hidden border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <CardHeader className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Try with Sample Data</div>
              <div className="text-xs text-slate-500">Download our messy sample file to test the app</div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const a = document.createElement("a");
                a.href = "/dirty_orders_dataset.xlsx";
                a.download = "dirty_orders_dataset.xlsx";
                a.click();
              }}
            >
              <Download className="h-4 w-4" /> Download Sample
            </Button>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-amber-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge tone="warn">Dirty Data</Badge>
                <span className="text-xs text-slate-500">Sample orders dataset with quality issues</span>
              </div>
              
              <div className="mb-4 grid gap-2 sm:grid-cols-4">
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Total Rows</div>
                  <div className="mt-1 text-lg font-semibold text-slate-700">66</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Columns</div>
                  <div className="mt-1 text-lg font-semibold text-slate-700">17</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Issues Found</div>
                  <div className="mt-1 text-lg font-semibold text-amber-600">40+</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs text-slate-500">Issue Types</div>
                  <div className="mt-1 text-lg font-semibold text-amber-600">10+</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="text-xs font-semibold text-slate-700 mb-2">Data Preview (Issues Highlighted):</div>
                <div className="min-w-[900px] rounded-lg border border-slate-200 bg-white text-xs">
                  <table className="w-full">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-2 py-2 text-left font-semibold text-slate-700">Order ID</th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-700">Customer</th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-700">Email</th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-700">City</th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-700">Product</th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-700">Qty</th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-700">Total Amount</th>
                        <th className="px-2 py-2 text-left font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="bg-red-50">
                        <td className="px-2 py-2">1000</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">   John Doe</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">sara.khan@gmail.com</td>
                        <td className="px-2 py-2">Lahore</td>
                        <td className="px-2 py-2">laptop</td>
                        <td className="px-2 py-2">2</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">(empty)</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">pending </td>
                      </tr>
                      <tr className="bg-red-50">
                        <td className="px-2 py-2">1001</td>
                        <td className="px-2 py-2">m usman</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">ALI@EXAMPLE.COM</td>
                        <td className="px-2 py-2">Lahore</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">키보드</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">-1</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">$-4999.00</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">pending </td>
                      </tr>
                      <tr className="bg-red-50">
                        <td className="px-2 py-2">1002</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">ALI NASIR</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">sara.khan@gmail,com</td>
                        <td className="px-2 py-2 text-red-500 font-semibold"> lahore</td>
                        <td className="px-2 py-2">Keyboard</td>
                        <td className="px-2 py-2">2</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">(empty)</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">(empty)</td>
                      </tr>
                      <tr className="bg-red-50">
                        <td className="px-2 py-2">1003</td>
                        <td className="px-2 py-2">Sara Khan</td>
                        <td className="px-2 py-2">sara.khan@gmail.com</td>
                        <td className="px-2 py-2">Karachi</td>
                        <td className="px-2 py-2">laptop</td>
                        <td className="px-2 py-2">5</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">999995/-</td>
                        <td className="px-2 py-2">paid</td>
                      </tr>
                      <tr className="bg-red-50">
                        <td className="px-2 py-2">1005</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">ayesha </td>
                        <td className="px-2 py-2 text-red-500 font-semibold">fatima@@mail.com</td>
                        <td className="px-2 py-2">Rawalpindi</td>
                        <td className="px-2 py-2">Headphones</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">-1</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">-0.00</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">pending </td>
                      </tr>
                      <tr className="bg-red-50">
                        <td className="px-2 py-2">1008</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">ayesha </td>
                        <td className="px-2 py-2 text-red-500 font-semibold">(empty)</td>
                        <td className="px-2 py-2">Lahore</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">mouse </td>
                        <td className="px-2 py-2 text-red-500 font-semibold">999</td>
                        <td className="px-2 py-2 text-red-500 font-semibold">tbd</td>
                        <td className="px-2 py-2">paid</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  <span className="font-semibold">Issues shown:</span> Leading/trailing whitespace, wrong emails (mixed customer/email), 
                  UPPERCASE inconsistency, comma in email (.com vs ,com), double @@ symbols, negative quantities, 
                  missing values, Korean characters (키보드), inconsistent amount formats ($-4999.00, 999995/-, tbd), 
                  trailing spaces in status
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1 overflow-hidden">
            <CardHeader className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Upload</div>
                <div className="text-xs text-slate-500">CSV or Excel (XLSX)</div>
              </div>
              <Badge>Local</Badge>
            </CardHeader>
            <CardContent>
              <label
                className={cn(
                  "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-gradient-to-b from-white to-slate-50 px-4 py-10 text-center transition hover:border-slate-300",
                )}
              >
                <UploadCloud className="h-8 w-8 text-slate-500 group-hover:text-slate-700" />
                <div className="text-sm font-medium text-slate-800">Drop a file or click to browse</div>
                <div className="text-xs text-slate-500">No database. Nothing is stored.</div>
                <input
                  className="hidden"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>

              {file ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{file.name}</div>
                      <div className="text-xs text-slate-500">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Remove</Button>
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex gap-2">
                <Button className="flex-1" disabled={!canRun} onClick={run}>
                  {busy ? "Cleaning…" : "Run Cleaning"}
                </Button>
                <Button
                  variant="secondary"
                  disabled={!file || busy}
                  onClick={() => {
                    setResp(null);
                    setFile(null);
                  }}
                >
                  Reset
                </Button>
              </div>

              <div className="mt-4 text-xs text-slate-500">
                Default rules: header normalization, blank standardization, type inference + casts, dedupe rows, validation (email/url/price/id), soft outlier scan.
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2 overflow-hidden">
            <CardHeader className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-900">Results</div>
                <div className="text-xs text-slate-500">Preview + exports + audit</div>
              </div>
              <div className="flex items-center gap-2">
                {resp?.summary ? (
                  <>
                    <Badge tone="muted">{resp.summary.rowsOut} rows</Badge>
                    <Badge tone={resp.summary.issues ? "warn" : "ok"}>
                      {resp.summary.issues ? `${resp.summary.issues} issues` : "No issues"}
                    </Badge>
                  </>
                ) : (
                  <Badge tone="muted">Waiting</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!resp ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600">
                  Upload a dataset on the left, then run cleaning. You’ll get:
                  <ul className="mt-2 list-disc pl-5 text-sm text-slate-600">
                    <li>A cleaned dataset (CSV + Excel)</li>
                    <li>A step-by-step audit log</li>
                    <li>A pipeline recipe (JSON) + a Python (pandas) export</li>
                  </ul>
                </div>
              ) : resp.ok ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Rows in</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">{resp.summary?.rowsIn ?? "-"}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Rows out</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">{resp.summary?.rowsOut ?? "-"}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Columns</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">{resp.summary?.cols ?? "-"}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="text-xs text-slate-500">Issues</div>
                      <div className="mt-1 text-xl font-semibold text-slate-900">{resp.summary?.issues ?? "-"}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => downloadBase64("cleaned.xlsx", resp.exports!.cleanedXlsxBase64, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
                    >
                      <FileSpreadsheet className="h-4 w-4" /> Cleaned Excel
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => downloadText("audit.json", JSON.stringify({
                        summary: resp.summary,
                        steps: resp.result.audit,
                        changeLog: resp.result.changeLog ?? [],
                        issues: resp.result.issues ?? [],
                      }, null, 2), "application/json")}
                    >
                      <FileText className="h-4 w-4" /> Audit Log
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => downloadText("pipeline.recipe.json", JSON.stringify(resp.exports!.recipe, null, 2), "application/json")}
                    >
                      <FileText className="h-4 w-4" /> Pipeline (JSON)
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => downloadText("pipeline.py", resp.exports!.python, "text/x-python")}
                    >
                      <FileText className="h-4 w-4" /> Pipeline (Python)
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">Preview</div>
                      <div className="text-xs text-slate-500">First 10 rows</div>
                    </div>
                    <div className="overflow-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            {previewCols.map((c) => (
                              <th key={c} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-600">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.map((r: any, idx: number) => (
                            <tr key={idx} className="border-t border-slate-100">
                              {previewCols.map((c) => (
                                <td key={c} className="whitespace-nowrap px-3 py-2 text-slate-700">
                                  {r?.[c] === null || r?.[c] === undefined ? "" : String(r[c]).slice(0, 80)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-sm font-semibold text-slate-900">Audit (high level)</div>
                    <ol className="mt-2 space-y-2">
                      {(resp.result.audit ?? []).map((a: any, i: number) => (
                        <li key={i} className="flex items-start gap-3">
                          <div className="mt-1 h-2 w-2 rounded-full bg-blue-600" />
                          <div className="min-w-0">
                            <div className="text-sm text-slate-800">{a.step}</div>
                            {a.detail ? <div className="text-xs text-slate-500">Column: {a.detail}</div> : null}
                            {a.notes?.length ? (
                              <ul className="mt-1 list-disc pl-5 text-xs text-slate-500">
                                {a.notes.slice(0, 3).map((n: string, j: number) => <li key={j}>{n}</li>)}
                              </ul>
                            ) : null}
                          </div>
                          {typeof a.affectedRows === "number" ? <Badge tone="muted">{a.affectedRows} rows</Badge> : null}
                          {typeof a.changedCells === "number" ? <Badge tone="muted">{a.changedCells} cells</Badge> : null}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
                  <div className="font-semibold">Error</div>
                  <div className="mt-1 text-sm">{resp.error ?? "Something went wrong."}</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
