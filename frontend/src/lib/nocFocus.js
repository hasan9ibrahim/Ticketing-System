// NOC members pick which ticket type they're handling (SMS, Voice or both)
// from the top bar. A department limited to one type always wins over that
// pick. Everything type-specific (pages, tickets, requests, alerts,
// notifications) is filtered through getEffectiveTicketType.

export const NOC_FOCUS_OPTIONS = [
  { value: "sms", label: "SMS" },
  { value: "voice", label: "Voice" },
  { value: "both", label: "Both" },
];

export const NOC_FOCUS_LABELS = { sms: "SMS", voice: "Voice", both: "SMS and Voice" };

// Whether this user gets the SMS / Voice / Both switch.
export function canPickNocFocus(user) {
  return user?.role === "noc" && user?.department_type !== "sms" && user?.department_type !== "voice";
}

// "sms", "voice" or "all" - the ticket type(s) this user should currently see.
export function getEffectiveTicketType(user) {
  const deptType = user?.department_type;
  if (deptType === "sms" || deptType === "voice") return deptType;
  if (canPickNocFocus(user) && (user.noc_focus === "sms" || user.noc_focus === "voice")) {
    return user.noc_focus;
  }
  return "all";
}

// Whether an item of `type` ("sms"/"voice", any case) is visible for the
// effective ticket type. Items without a type are always shown.
export function matchesTicketType(effectiveType, type) {
  if (effectiveType === "all" || !type) return true;
  return String(type).toLowerCase() === effectiveType;
}
