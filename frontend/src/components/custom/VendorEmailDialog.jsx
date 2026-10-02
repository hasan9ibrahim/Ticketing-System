import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Mail, RotateCcw, Trash2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SMS_ISSUE_TYPES, VOICE_ISSUE_TYPES } from "@/components/custom/IssueTypeSelect";
import {
  EMAIL_MODES,
  PRESET_OPS,
  blankRow,
  defaultLabels,
  parseSamples,
  statusOk,
  issueText,
  buildSubject,
  buildEmailHTML,
  cellPlaceholder,
} from "@/lib/vendorEmail";

const OPS_KEY = "noc-operators-v1";
const draftKey = (mode, ticket) => `vendor-email-draft-${mode}-${ticket?.id || ticket?.ticket_number || "new"}`;

function store(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
}
function load(k) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}

const ticketTrunks = (ticket) => {
  const trunks = (ticket?.vendor_trunks || []).map((v) => v.trunk).filter(Boolean);
  if (trunks.length) return trunks;
  return ticket?.vendor_trunk ? [ticket.vendor_trunk] : [];
};

function allOps() {
  const m = new Map(PRESET_OPS);
  (load(OPS_KEY) || []).forEach(([n, c]) => { if (!m.has(n)) m.set(n, c); });
  return m;
}
function lookupMcc(destination) {
  const n = (destination || "").trim().toLowerCase();
  if (!n) return "";
  for (const [name, code] of allOps()) if (name.toLowerCase() === n) return code;
  return "";
}
function rememberOp(destination, mcc) {
  const n = (destination || "").trim(), c = (mcc || "").trim();
  if (!n || !c || allOps().get(n) === c) return;
  const custom = (load(OPS_KEY) || []).filter(([x]) => x !== n);
  custom.push([n, c]);
  store(OPS_KEY, custom);
}

// Build the initial email fields from the ticket itself.
function fromTicket(mode, ticket) {
  const issues = [...(ticket?.issue_types || [])];
  let otherIssue = ticket?.issue_other || "";
  if (!issues.length && !otherIssue && ticket?.issue) otherIssue = ticket.issue;
  const faIdx = issues.indexOf("FAS");
  if (faIdx >= 0 && ticket?.fas_type) issues[faIdx] = `FAS (${ticket.fas_type})`;
  const destination = ticket?.destination || "";
  return {
    subject: "",
    subjectEdited: false,
    greeting: "Dear Partner,",
    destination,
    trunk: ticketTrunks(ticket)[0] || "",
    mccmnc: mode === "sms" ? lookupMcc(destination) : "",
    issues,
    otherIssue,
    note: "",
    closing: "Kindly check and update us ASAP.",
    rows: [],
    labels: defaultLabels(mode),
    showOpt: false,
  };
}

async function copyHTML(html, plain, node) {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([
        new window.ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch (e) { /* fall back to selection copy */ }
  try {
    const sel = window.getSelection(), range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
    const ok = document.execCommand("copy");
    sel.removeAllRanges();
    return ok;
  } catch (e) {
    return false;
  }
}

export default function VendorEmailDialog({ open, onOpenChange, ticket, ticketType = "sms" }) {
  const mode = ticketType === "voice" ? "voice" : "sms";
  const M = EMAIL_MODES[mode];
  const [d, setD] = useState(() => fromTicket(mode, ticket));
  const [paste, setPaste] = useState("");
  const [pasteMsg, setPasteMsg] = useState({ text: "", warn: false });
  // In-app confirmation instead of the browser's confirm() popup: { title, message, action, onConfirm }
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (title, message, action, onConfirm) => setConfirmState({ title, message, action, onConfirm });
  const paperRef = useRef(null);

  // Load a saved draft for this ticket (or start from the ticket fields) each time the dialog opens.
  useEffect(() => {
    if (!open || !ticket) return;
    const key = draftKey(mode, ticket);
    const base = fromTicket(mode, ticket);
    const saved = load(key);
    setD({ ...(saved ? { ...base, ...saved, labels: { ...base.labels, ...(saved.labels || {}) } } : base), _key: key });
    setPaste("");
    setPasteMsg({ text: "", warn: false });
  }, [open, ticket, mode]);

  // _key tags which ticket the state belongs to, so a stale draft is never saved under another ticket.
  useEffect(() => {
    if (open && d._key && d._key === draftKey(mode, ticket)) store(d._key, d);
  }, [d, open, mode, ticket]);

  const set = (patch) => setD((prev) => ({ ...prev, ...patch }));
  const trunks = useMemo(() => ticketTrunks(ticket), [ticket]);
  const issueOptions = useMemo(() => {
    const base = mode === "voice" ? VOICE_ISSUE_TYPES : SMS_ISSUE_TYPES;
    return [...base, ...d.issues.filter((i) => !base.includes(i))];
  }, [mode, d.issues]);

  const autoSubject = buildSubject(ticket?.ticket_number, d.destination, d.trunk);
  const subject = d.subjectEdited ? d.subject : autoSubject;
  const html = useMemo(() => buildEmailHTML(mode, d), [mode, d]);

  const toggleIssue = (i) =>
    set({ issues: d.issues.includes(i) ? d.issues.filter((x) => x !== i) : issueOptions.filter((x) => x === i || d.issues.includes(x)) });

  const addFromText = (text) => {
    const { rows, calc, labels } = parseSamples(mode, text);
    if (!rows.length) {
      setPasteMsg({ text: "Couldn't read any samples from that text. Check that each sample is on its own line.", warn: true });
      return false;
    }
    setD((prev) => ({ ...prev, rows: [...prev.rows, ...rows], labels: { ...prev.labels, ...labels } }));
    setPasteMsg({
      text:
        `Added ${rows.length} sample${rows.length > 1 ? "s" : ""}` +
        (calc ? `, delay calculated from DLR time for ${calc}` : "") +
        (labels.sender ? ", Sender column labelled SRC ADDR" : "") +
        ". Check the table below.",
      warn: false,
    });
    return true;
  };

  const updateCell = (i, k, v) => setD((prev) => ({ ...prev, rows: prev.rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)) }));
  const statusClass = (v) => {
    const ok = statusOk(mode, v);
    return ok === null ? "" : ok ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-red-600 dark:text-red-400 font-semibold";
  };

  const copySubject = async () => {
    try {
      await navigator.clipboard.writeText(subject);
      toast.success("Subject copied");
    } catch (e) {
      toast.error("Couldn't copy. Select the subject and press Ctrl+C.");
    }
  };

  const copyEmail = async () => {
    const missing = [];
    if (!d.destination.trim()) missing.push("destination");
    if (!d.trunk.trim()) missing.push("vendor trunk");
    if (mode === "sms" && !d.mccmnc.trim()) missing.push("MCC-MNC");
    if (!issueText(d.issues, d.otherIssue)) missing.push("issue");
    if (!d.rows.length) missing.push("samples");
    if (missing.length) {
      askConfirm("Some fields are empty", "Still missing: " + missing.join(", ") + ". Copy the email anyway?", "Copy anyway", doCopyEmail);
      return;
    }
    doCopyEmail();
  };

  const doCopyEmail = async () => {
    const ok = await copyHTML(html, paperRef.current?.innerText || "", paperRef.current);
    if (ok) {
      if (mode === "sms") rememberOp(d.destination, d.mccmnc);
      toast.success("Email copied. Paste it into a new Outlook message.");
    } else toast.error("Couldn't copy. Select the email preview and press Ctrl+C.");
  };

  const resetFromTicket = () => {
    askConfirm("Reset from ticket", "Discard this draft and rebuild the email from the ticket fields?", "Reset", () => {
      setD({ ...fromTicket(mode, ticket), _key: draftKey(mode, ticket) });
      setPaste("");
      setPasteMsg({ text: "", warn: false });
    });
  };

  const inputCls = "bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white";
  const panelCls = "rounded-lg border border-gray-200 dark:border-zinc-700 p-4 space-y-3";
  const stListId = `vendor-email-statuses-${mode}`;
  const trunkListId = `vendor-email-trunks-${mode}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10 text-gray-900 dark:text-white max-w-[1400px] w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" /> Vendor Issue Email - {ticket?.ticket_number} <span className="text-sm font-normal text-zinc-500">({M.label})</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 xl:grid-cols-2">
          {/* ----- Editor ----- */}
          <div className="space-y-4 min-w-0">
            <div className={panelCls}>
              <h3 className="font-semibold text-sm">Route <span className="font-normal text-zinc-500">Taken from the ticket, edit if needed</span></h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-500">Destination</Label>
                  <Input
                    value={d.destination}
                    onChange={(e) => {
                      const destination = e.target.value;
                      const mcc = mode === "sms" ? lookupMcc(destination) : "";
                      set(mcc ? { destination, mccmnc: mcc } : { destination });
                    }}
                    className={inputCls}
                    placeholder="Egypt-Etisalat"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-500">Vendor Trunk</Label>
                  <Input value={d.trunk} onChange={(e) => set({ trunk: e.target.value })} list={trunkListId} className={inputCls} placeholder="Vendor trunk" />
                  <datalist id={trunkListId}>{trunks.map((t) => <option key={t} value={t} />)}</datalist>
                  {trunks.length > 1 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {trunks.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => set({ trunk: t })}
                          className={`text-xs rounded-full px-2 py-0.5 border ${d.trunk === t ? "bg-emerald-500 border-emerald-500 text-black" : "border-gray-300 dark:border-zinc-600 hover:border-emerald-500"}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {mode === "sms" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-zinc-500">MCC-MNC</Label>
                    <Input value={d.mccmnc} onChange={(e) => set({ mccmnc: e.target.value })} className={`${inputCls} font-mono`} placeholder="602003" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs text-zinc-500">Greeting</Label>
                  <Input value={d.greeting} onChange={(e) => set({ greeting: e.target.value })} className={inputCls} placeholder="Dear Partner," />
                </div>
              </div>
            </div>

            <div className={panelCls}>
              <h3 className="font-semibold text-sm">Issue <span className="font-normal text-zinc-500">Pre-selected from the ticket</span></h3>
              <div className="flex flex-wrap gap-2">
                {issueOptions.map((i) => (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={d.issues.includes(i)}
                    onClick={() => toggleIssue(i)}
                    className={`text-xs rounded-full px-3 py-1 border transition-colors ${d.issues.includes(i) ? "bg-red-600 border-red-600 text-white" : "border-gray-300 dark:border-zinc-600 bg-gray-50 dark:bg-zinc-800 hover:border-red-500"}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">Custom issue (optional)</Label>
                <Input value={d.otherIssue} onChange={(e) => set({ otherIssue: e.target.value })} className={inputCls} placeholder="Anything not listed above" />
              </div>
            </div>

            <div className={panelCls}>
              <h3 className="font-semibold text-sm flex justify-between">
                <span>Samples</span>
                <span className="font-normal text-zinc-500">{d.rows.length} sample{d.rows.length === 1 ? "" : "s"}</span>
              </h3>
              <Textarea
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  if (text && !paste.trim() && addFromText(text)) e.preventDefault();
                }}
                className={`${inputCls} font-mono text-xs min-h-[90px]`}
                placeholder={M.placeholder}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => { if (addFromText(paste)) setPaste(""); }}>Add samples</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => set({ rows: [...d.rows, blankRow(mode)] })}><Plus className="h-4 w-4 mr-1" />Empty row</Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const clear = () => { set({ rows: [] }); setPasteMsg({ text: "", warn: false }); };
                    if (!d.rows.length) clear();
                    else askConfirm("Clear samples", `Remove all ${d.rows.length} sample${d.rows.length === 1 ? "" : "s"}?`, "Clear", clear);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-1" />Clear
                </Button>
                {pasteMsg.text && <span className={`text-xs ${pasteMsg.warn ? "text-red-500" : "text-emerald-600 dark:text-emerald-400"}`} role="status">{pasteMsg.text}</span>}
              </div>

              <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-zinc-700">
                <table className="w-full min-w-[860px] text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-zinc-800">
                      {M.cols.map((c) => (
                        <th key={c.k} className="p-1 border-b border-gray-200 dark:border-zinc-700 text-left font-medium">
                          <input
                            value={d.labels[c.k] ?? c.label}
                            onChange={(e) => set({ labels: { ...d.labels, [c.k]: e.target.value } })}
                            title="Click to rename this column in the email"
                            aria-label={`${c.label} column name`}
                            className="w-full bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-zinc-600 focus:border-emerald-500 rounded px-1.5 py-1 text-zinc-500 dark:text-zinc-400 outline-none"
                          />
                        </th>
                      ))}
                      <th className="border-b border-gray-200 dark:border-zinc-700" />
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-200 dark:border-zinc-700 last:border-0">
                        {M.cols.map((c) => (
                          <td key={c.k} className="p-0.5">
                            <input
                              value={r[c.k] || ""}
                              onChange={(e) => updateCell(i, c.k, e.target.value)}
                              onBlur={(e) => { if (c.k === "status" && mode === "sms") updateCell(i, c.k, e.target.value.toUpperCase()); }}
                              list={c.k === "status" ? stListId : undefined}
                              placeholder={cellPlaceholder(mode, d, c.k)}
                              aria-label={`${d.labels[c.k] || c.label} row ${i + 1}`}
                              className={`w-full bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-zinc-600 focus:border-emerald-500 focus:bg-gray-50 dark:focus:bg-zinc-800 rounded px-1.5 py-1 font-mono outline-none ${c.k === "status" ? statusClass(r[c.k]) : ""}`}
                            />
                          </td>
                        ))}
                        <td className="p-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => set({ rows: d.rows.filter((_, idx) => idx !== i) })}
                            className="p-1 rounded text-zinc-500 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-zinc-800"
                            aria-label={`Remove row ${i + 1}`}
                            title="Remove row"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!d.rows.length && <div className="p-5 text-center text-sm text-zinc-500">No samples yet. Paste rows above or add an empty row.</div>}
              </div>
              <datalist id={stListId}>{M.statuses.map((s) => <option key={s} value={s} />)}</datalist>
              <p className="text-xs text-zinc-500">Column names are editable (e.g. rename "Sender ID" to "SRC ADDR"). Blank {mode === "sms" ? "MCCMNC cells use the MCC-MNC above" : "Routing Zone / Vendor Interconnect cells use the destination and trunk above"}.</p>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={d.showOpt} onCheckedChange={(v) => set({ showOpt: !!v })} />
                {M.optLabel}
              </label>
            </div>

            <div className={panelCls}>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">Extra note (optional, appears above the closing line)</Label>
                <Textarea value={d.note} onChange={(e) => set({ note: e.target.value })} rows={2} className={inputCls} placeholder="e.g. Issue started around 09:00 GMT+2 and affects ~40% of traffic." />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-zinc-500">Closing line</Label>
                <Input value={d.closing} onChange={(e) => set({ closing: e.target.value })} className={inputCls} />
              </div>
            </div>
          </div>

          {/* ----- Preview ----- */}
          <div className="space-y-3 min-w-0 xl:sticky xl:top-0 self-start">
            <div className="space-y-1">
              <Label className="text-xs text-zinc-500">Subject</Label>
              <div className="flex gap-2">
                <Input value={subject} onChange={(e) => set({ subject: e.target.value, subjectEdited: true })} className={`${inputCls} flex-1`} />
                {d.subjectEdited && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set({ subject: "", subjectEdited: false })} title="Rebuild subject from the fields">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={copySubject}><Copy className="h-4 w-4 mr-1" />Copy</Button>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 p-3 overflow-x-auto">
              <div ref={paperRef} className="bg-white text-[#222] rounded p-5 w-max min-w-full" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={copyEmail} className="bg-emerald-500 text-black hover:bg-emerald-400"><Copy className="h-4 w-4 mr-2" />Copy email</Button>
              <Button type="button" variant="outline" onClick={resetFromTicket}><RotateCcw className="h-4 w-4 mr-2" />Reset from ticket</Button>
            </div>
            <p className="text-xs text-zinc-500">After copying, open a new message in Outlook and paste (Ctrl+V). Formatting and colors carry over. Your draft is saved for this ticket.</p>
          </div>
        </div>
      </DialogContent>

      <AlertDialog open={!!confirmState} onOpenChange={(o) => { if (!o) setConfirmState(null); }}>
        <AlertDialogContent className="bg-white dark:bg-zinc-900 border-black/10 dark:border-white/10">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">{confirmState?.title}</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-zinc-400">{confirmState?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-zinc-800">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { const fn = confirmState?.onConfirm; setConfirmState(null); fn?.(); }}
              className="bg-emerald-500 text-black hover:bg-emerald-400"
            >
              {confirmState?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
