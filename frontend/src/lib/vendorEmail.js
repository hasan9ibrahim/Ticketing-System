// Helpers for the vendor issue email builder: column definitions, sample parsing
// (pasted from the system, Excel or CSV) and the Outlook-friendly email HTML.

export const EMAIL_MODES = {
  sms: {
    label: "SMS",
    cols: [
      { k: "id", label: "Message ID" },
      { k: "start", label: "Start Time" },
      { k: "status", label: "Status" },
      { k: "sender", label: "Sender ID" },
      { k: "dest", label: "Destination Number" },
      { k: "mcc", label: "MCCMNC" },
      { k: "delay", label: "Delivery Delay" },
    ],
    opt: "delay",
    optLabel: "Include Delivery Delay column (only when at least one row has a value)",
    statuses: ["DELIVRD", "UNDELIV", "SENT", "PENDING", "EXPIRED", "REJECTD", "ENROUTE", "UNKNOWN"],
    thStyle: "color:#8B2E2E;font-weight:normal;",
    placeholder:
      "Paste rows from the system, Excel or a CSV here and they're added automatically. Headers are optional (SRC ADDR / DST ADDR headers are recognised).\n\nYou can also type a sample on one line, then press Add samples:\n1ce50b7e-da71-4654-8afc-44ea4db259d8  2026-09-15 09:14:07  UNDELIV  Apple  201152326487  602003  45s",
  },
  voice: {
    label: "Voice",
    cols: [
      { k: "zone", label: "Routing Zone" },
      { k: "time", label: "Date-Time" },
      { k: "from", label: "From" },
      { k: "to", label: "To" },
      { k: "vendor", label: "Vendor Interconnect" },
      { k: "duration", label: "Duration (s)" },
      { k: "status", label: "Status Code" },
      { k: "pdd", label: "PDD" },
    ],
    opt: "pdd",
    optLabel: "Include PDD column (only when at least one row has a value)",
    statuses: ["200", "404", "408", "480", "486", "487", "503", "603"],
    thStyle: "color:#1A1A1A;font-weight:bold;",
    placeholder:
      "Paste rows from the system, Excel or a CSV here and they're added automatically. Headers are optional.\n\nYou can also type a sample on one line, then press Add samples:\nFRANCE MOBILE ORANGE  2026.05.22 09:01:57  33662043170  33632000007  ChatLink_CC  12  200  4.2",
  },
};

export const PRESET_OPS = [
  ["Egypt-Etisalat", "602003"],
  ["Egypt-Vodafone", "602002"],
  ["Egypt-Orange", "602001"],
  ["Egypt-WE", "602004"],
  ["France Mobile Orange", "20801"],
];

export const blankRow = (mode) => Object.fromEntries(EMAIL_MODES[mode].cols.map((c) => [c.k, ""]));
export const defaultLabels = (mode) => Object.fromEntries(EMAIL_MODES[mode].cols.map((c) => [c.k, c.label]));

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- shared parsing helpers ---------- */
const DATE_RE = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/;
const DMY_RE = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ T,]*(\d{1,2}):(\d{2})(?::(\d{2}))?/;
const DATE_ONLY = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})$/;
const TIME_ONLY = /^\d{1,2}:\d{2}(:\d{2})?(\.\d+)?$/;
const DELAY_RE = /^(\d+(\.\d+)?\s*(ms|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)(\s*\d+(\.\d+)?\s*(s|sec|secs|m|min|mins))?|\d{1,2}:\d{2}(:\d{2})?)$/i;

function parseDate(s) {
  s = String(s).trim();
  let m = s.match(DATE_RE);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  m = s.match(DMY_RE);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0));
  return null;
}
const pad = (n) => String(n).padStart(2, "0");
function fmtDate(d, sep) {
  return `${d.getFullYear()}${sep}${pad(d.getMonth() + 1)}${sep}${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function fmtDelay(sec) {
  if (sec < 0) return "";
  sec = Math.round(sec);
  if (sec < 60) return sec + "s";
  if (sec < 3600) return Math.floor(sec / 60) + "m " + pad(sec % 60) + "s";
  if (sec < 86400) return Math.floor(sec / 3600) + "h " + pad(Math.floor((sec % 3600) / 60)) + "m";
  return Math.floor(sec / 86400) + "d " + Math.floor((sec % 86400) / 3600) + "h";
}
function splitCSV(line, d) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}
function splitWS(line) {
  const t = line.trim().split(/\s+/), out = [];
  for (let i = 0; i < t.length; i++) {
    if (DATE_ONLY.test(t[i]) && t[i + 1] && TIME_ONLY.test(t[i + 1])) { out.push(t[i] + " " + t[i + 1]); i++; }
    else out.push(t[i]);
  }
  return out;
}
function mapHeader(cells, rules) {
  const used = new Set();
  const map = cells.map((c) => {
    const n = String(c).toLowerCase().trim();
    for (const [k, re] of rules) {
      if (!used.has(k) && re.test(n)) { used.add(k); return k; }
    }
    return null;
  });
  return used.size >= 2 ? map : null;
}
function tokenize(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  let splitter, ws = false;
  if (lines.some((l) => l.includes("\t"))) splitter = (l) => l.split("\t").map((x) => x.trim());
  else if (lines.some((l) => l.includes(";")) && !lines.some((l) => /,/.test(l))) splitter = (l) => splitCSV(l, ";");
  else if (lines.some((l) => l.includes(","))) splitter = (l) => splitCSV(l, ",");
  else { splitter = splitWS; ws = true; }
  return { rows: lines.map(splitter), ws };
}

/* ---------- SMS parsing ---------- */
const OK_SMS = new Set(["DELIVRD", "DELIVERED", "DELIVRED"]);
const SMS_STATUSES = new Set(["DELIVRD", "DELIVERED", "UNDELIV", "UNDELIVERED", "UNDELIVERABLE", "SENT", "PENDING", "ENROUTE", "EXPIRED", "REJECTD", "REJECTED", "FAILED", "ACCEPTD", "ACCEPTED", "UNKNOWN", "DELETED", "SUBMITTED", "SUBMITD", "ACK", "NACK", "BUFFERED"]);
const SRC_ADDR_RE = /^src\b|src[\s_.-]*addr|source[\s_.-]*addr/;
const SMS_RULES = [
  ["done", /(done|dlr|deliver(ed|y)?|receipt|report|end)[\s_-]*(time|date|ts|at)|delivered[\s_-]*on/],
  ["delay", /delay|latency|duration|elapsed/],
  ["id", /message[\s_-]*id|msg[\s_-]*id|sms[\s_-]*id|^id$|messageid|uuid|^ref/],
  ["start", /start|submit|sent[\s_-]*(time|date|at)|created|send[\s_-]*time|^date|^time|timestamp|received/],
  ["status", /status|state|^dlr$|result/],
  ["sender", /sender|source|originator|^from$|^oa$|^tpoa$|^src\b|src[\s_.-]*addr/],
  ["dest", /dest|msisdn|recipient|number|phone|^to$|b[\s_-]?num|^da$|mobile|^dst\b|dst[\s_.-]*addr/],
  ["mcc", /mcc|mnc|network|operator|plmn/],
];
function smsFinish(r, done) {
  const sd = parseDate(r.start);
  if (sd) r.start = fmtDate(sd, "-");
  if (!r.delay && done && sd) {
    const dd = parseDate(done);
    if (dd) { r.delay = fmtDelay((dd - sd) / 1000); r._calc = true; }
  }
  r.status = (r.status || "").toUpperCase();
  return r;
}
function smsClassify(cells) {
  const r = blankRow("sms");
  let done = "";
  for (let c of cells) {
    c = String(c).trim();
    if (!c) continue;
    const up = c.toUpperCase();
    if (parseDate(c)) { if (!r.start) r.start = c; else if (!done) done = c; continue; }
    if (SMS_STATUSES.has(up) && !r.status) { r.status = up; continue; }
    if (/^\+?\d{5,6}$/.test(c) && !r.mcc && (r.dest || r.id)) { r.mcc = c; continue; }
    if (/^\+?\d{8,15}$/.test(c) && !r.dest) { r.dest = c.replace(/^\+/, ""); continue; }
    if (DELAY_RE.test(c) && !r.delay) { r.delay = c; continue; }
    if (!r.id && (/^[0-9a-f][0-9a-f-]{15,}$/i.test(c) || /^\d{16,}$/.test(c) || (/^[A-Za-z0-9_-]{16,}$/.test(c) && /\d/.test(c)))) { r.id = c; continue; }
    if (!r.sender) { r.sender = c; continue; }
    if (/^\+?\d{5,6}$/.test(c) && !r.mcc) { r.mcc = c; continue; }
  }
  return smsFinish(r, done);
}
function parseSMS(text) {
  let { rows } = tokenize(text);
  if (!rows.length) return { rows: [], calc: 0, labels: {} };
  const header = rows[0];
  const map = mapHeader(header, SMS_RULES);
  const labels = {};
  if (map) {
    rows = rows.slice(1);
    // Keep the partner's wording when the sender column comes in as SRC ADDR
    const si = map.indexOf("sender");
    if (si >= 0 && SRC_ADDR_RE.test(String(header[si]).toLowerCase().trim())) labels.sender = "SRC ADDR";
  }
  const out = rows.map((cells) => {
    if (!map) return smsClassify(cells);
    const r = blankRow("sms");
    let done = "";
    map.forEach((k, i) => {
      if (!k) return;
      const v = (cells[i] || "").trim();
      if (k === "done") done = v; else r[k] = v;
    });
    return smsFinish(r, done);
  });
  return { ...wrap(out, "sms"), labels };
}

/* ---------- Voice parsing ---------- */
const VOICE_ORDER = ["zone", "time", "from", "to", "vendor", "duration", "status", "pdd"];
const VOICE_RULES = [
  ["pdd", /pdd|post[\s_-]*dial/],
  ["duration", /duration|^dur|billsec|bill[\s_-]*sec|seconds|call[\s_-]*length/],
  // Only the disconnect code is the status - other "... Code" columns are ignored
  ["status", /discnt|disc[\s_.-]*code|disconnect/],
  ["vendor", /vendor|interconnect|carrier|supplier|trunk|route[\s_-]*name|gateway/],
  ["to", /^to$|^to\b|b[\s_-]?num|called|dnis|dialed|dest[\s_-]*num/],
  ["from", /^from|a[\s_-]?num|^cli|caller|calling|^ani|source/],
  ["zone", /zone|destination|country|breakout|^route/],
  ["time", /date|time|start|setup|timestamp/],
];
function voiceFinish(r) {
  const d = parseDate(r.time);
  if (d) r.time = fmtDate(d, ".");
  ["from", "to"].forEach((k) => (r[k] = (r[k] || "").replace(/^\+/, "")));
  return r;
}
function voicePositional(cells, ws) {
  const r = blankRow("voice");
  cells = cells.map((c) => String(c).trim());
  let keys = VOICE_ORDER, rest = cells;
  const di = cells.findIndex((c) => parseDate(c));
  if (di >= 0) {
    // everything before the date is the routing zone (joins "FRANCE MOBILE ORANGE" when typed)
    const zone = cells.slice(0, di).filter(Boolean);
    r.zone = ws ? zone.join(" ") : zone[zone.length - 1] || "";
    r.time = cells[di];
    keys = VOICE_ORDER.slice(2);
    rest = cells.slice(di + 1);
  }
  rest.forEach((v, i) => { if (keys[i]) r[keys[i]] = v; });
  return voiceFinish(r);
}
function parseVoice(text) {
  let { rows, ws } = tokenize(text);
  if (!rows.length) return { rows: [], calc: 0, labels: {} };
  const map = mapHeader(rows[0], VOICE_RULES);
  if (map) rows = rows.slice(1);
  const out = rows.map((cells) => {
    if (!map) return voicePositional(cells, ws);
    const r = blankRow("voice");
    map.forEach((k, i) => { if (k) r[k] = (cells[i] || "").trim(); });
    return voiceFinish(r);
  });
  return { ...wrap(out, "voice"), labels: {} };
}
function wrap(out, m) {
  out = out.filter((r) => EMAIL_MODES[m].cols.some((c) => r[c.k]));
  const calc = out.filter((r) => r._calc).length;
  out.forEach((r) => delete r._calc);
  return { rows: out, calc };
}

export function parseSamples(mode, text) {
  return mode === "sms" ? parseSMS(text) : parseVoice(text);
}

/* ---------- status colors ---------- */
export function statusOk(mode, v) {
  v = String(v || "").trim().toUpperCase();
  if (!v) return null;
  return mode === "sms" ? OK_SMS.has(v) : /^2\d\d$/.test(v);
}

/* ---------- email ---------- */
export function issueText(issues, otherIssue) {
  const list = [...(issues || [])];
  if ((otherIssue || "").trim()) list.push(otherIssue.trim());
  return list.join(" / ");
}

export function buildSubject(ticketNumber, destination, trunk) {
  return [ticketNumber || "[Ticket #]", (destination || "").trim() || "[Destination]", (trunk || "").trim() || "[Vendor Trunk]"].join(" || ");
}

// Columns that make it into the email: the optional one (delay / PDD) only when enabled and filled in.
export function emailCols(mode, d) {
  const M = EMAIL_MODES[mode];
  return M.cols.filter((c) => c.k !== M.opt || (d.showOpt && d.rows.some((r) => String(r[c.k] || "").trim())));
}

// Default a blank cell to the ticket-level value so the table reads fully filled in.
function cellValue(mode, d, r, k) {
  const v = r[k] || "";
  if (v) return v;
  if (mode === "sms" && k === "mcc") return d.mccmnc;
  if (mode === "voice" && k === "vendor") return d.trunk;
  if (mode === "voice" && k === "zone") return d.destination;
  return "";
}
export function cellPlaceholder(mode, d, k) {
  return cellValue(mode, d, {}, k);
}

// Inline-styled HTML so the formatting survives pasting into Outlook.
export function buildEmailHTML(mode, d) {
  const M = EMAIL_MODES[mode];
  const F = "font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;";
  const P = `margin:0 0 12px 0;${F}color:#333333;`;
  const RED = "#C00000";
  const cols = emailCols(mode, d);
  const dest = esc(d.destination.trim() || "[Destination]");
  const trunk = esc(d.trunk.trim() || "[Vendor Trunk]");
  const th = cols
    .map((c) => `<th bgcolor="#3A9E8F" style="background:#3A9E8F;border:1px solid #000000;padding:5px 12px;${F}${M.thStyle}text-align:center;white-space:nowrap;">${esc(d.labels[c.k] || c.label)}</th>`)
    .join("");
  const rows = d.rows.length ? d.rows : [blankRow(mode)];
  const trs = rows
    .map(
      (r) =>
        "<tr>" +
        cols
          .map((c) => {
            const v = cellValue(mode, d, r, c.k);
            let st = `border:1px solid #000000;padding:5px 12px;${F}color:#222222;text-align:center;white-space:nowrap;`;
            if (c.k === "status" && v) st += `font-weight:bold;color:${statusOk(mode, v) ? "#3AA53A" : "#E00000"};`;
            if (c.k === M.opt && v) st += "font-weight:bold;color:#C55A11;";
            return `<td style="${st}">${esc(v) || "&nbsp;"}</td>`;
          })
          .join("") +
        "</tr>"
    )
    .join("");
  const mc = mode === "sms" ? d.mccmnc.trim() : "";
  const mccLine = mode === "sms" ? `<p style="${P}"><b><u>MCC-MNC:</u></b> <b style="color:${RED};">${esc(mc || "[MCC-MNC]")}</b></p>` : "";
  const note = d.note.trim() ? `<p style="${P}">${esc(d.note.trim()).replace(/\n/g, "<br>")}</p>` : "";
  const closing = d.closing.trim() ? `<p style="${P}">${esc(d.closing.trim()).replace(/\n/g, "<br>")}</p>` : "";
  return (
    `<div style="${F}color:#333333;">` +
    `<p style="${P}">${esc(d.greeting.trim() || "Dear Partner,")}</p>` +
    `<p style="${P}">Kindly be informed that we are facing issues towards <b>${dest}</b> via your route set on <b>${trunk}</b>.</p>` +
    mccLine +
    `<p style="${P}"><b><u>Issue:</u></b>&nbsp; <b style="color:${RED};">${esc(issueText(d.issues, d.otherIssue) || "[Issue]")}</b></p>` +
    `<p style="${P}">Please find the samples below:</p>` +
    `<table cellpadding="0" cellspacing="0" border="1" style="border-collapse:collapse;border:1px solid #000000;margin:0 0 16px 0;"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>` +
    note +
    closing +
    `</div>`
  );
}
