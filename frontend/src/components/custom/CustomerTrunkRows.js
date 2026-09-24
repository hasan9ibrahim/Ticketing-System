import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError, RequiredAsterisk } from "@/components/ui/field-error";
import SearchableSelect from "@/components/custom/SearchableSelect";

// Normalize a ticket (or form data) into the editable customer rows list,
// falling back to the legacy single customer_id/customer_trunk pair.
export const getTicketCustomerRows = (ticket) => {
  const rows = (ticket?.customers || [])
    .filter((c) => c && c.customer_id)
    .map((c) => ({ customer_id: c.customer_id, customer_trunk: c.customer_trunk || "" }));
  if (rows.length > 0) return rows;
  if (ticket?.customer_id) return [{ customer_id: ticket.customer_id, customer_trunk: ticket.customer_trunk || "" }];
  return [{ customer_id: "", customer_trunk: "" }];
};

// Rows being edited in the form - unlike getTicketCustomerRows this keeps
// blank rows the user just added.
export const getFormCustomerRows = (formData) =>
  formData?.customers && formData.customers.length > 0 ? formData.customers : getTicketCustomerRows(formData);

// Every customer trunk on a ticket, for display in lists and copy templates.
export const getTicketCustomerTrunksText = (ticket) => {
  const trunks = (ticket?.customers || []).map((c) => c.customer_trunk).filter(Boolean);
  if (trunks.length > 0) return [...new Set(trunks)].join(", ");
  return ticket?.customer_trunk || "";
};

export const getTicketCustomerIds = (ticket) => {
  const ids = (ticket?.customers || []).map((c) => c.customer_id).filter(Boolean);
  if (ids.length > 0) return ids;
  return ticket?.customer_id ? [ticket.customer_id] : [];
};

export const getTicketCustomerTrunks = (ticket) => {
  const trunks = (ticket?.customers || []).map((c) => c.customer_trunk).filter(Boolean);
  if (trunks.length > 0) return trunks;
  return ticket?.customer_trunk ? [ticket.customer_trunk] : [];
};

// Form state patch for a new rows list: keeps the legacy single fields in
// sync with the first row so existing checks (duplicates, validation) work.
export const customerRowsPatch = (rows) => ({
  customers: rows,
  customer_id: rows[0]?.customer_id || "",
  customer_trunk: rows[0]?.customer_trunk || "",
});

export const CustomerTrunkRows = ({
  rows,
  onChange,
  enterprises,
  isDisabled = false,
  showErrors = false,
  customerPlaceholder = "Search customer...",
}) => {
  const options = enterprises.map((e) => ({ value: e.id, label: e.name }));

  const updateRow = (index, patch) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Customers &amp; Trunks <RequiredAsterisk /></Label>
        {!isDisabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...rows, { customer_id: "", customer_trunk: "" }])}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" /> Add Customer
          </Button>
        )}
      </div>
      {rows.map((row, index) => {
        const enterprise = enterprises.find((e) => e.id === row.customer_id);
        const trunkOptions = [...(enterprise?.customer_trunks || [])];
        // Keep a saved trunk visible even if it no longer belongs to this
        // customer, instead of rendering an empty select.
        const trunkIsForeign = row.customer_trunk && !trunkOptions.includes(row.customer_trunk);
        if (trunkIsForeign) trunkOptions.unshift(row.customer_trunk);
        const customerError = showErrors && !row.customer_id;
        const trunkError = showErrors && !row.customer_trunk;
        return (
          <div key={index} className="rounded-md border border-gray-200 dark:border-zinc-700 p-2 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  options={options}
                  value={row.customer_id}
                  onChange={(value) => updateRow(index, { customer_id: value, customer_trunk: "" })}
                  placeholder={customerPlaceholder}
                  isRequired={true}
                  isDisabled={isDisabled}
                  hasError={customerError}
                />
              </div>
              {!isDisabled && rows.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  className="h-10 w-10 text-red-500 hover:text-red-600 shrink-0"
                  title="Remove customer"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Select
              value={row.customer_trunk || ""}
              onValueChange={(value) => updateRow(index, { customer_trunk: value })}
              disabled={isDisabled || !row.customer_id}
            >
              <SelectTrigger className={`bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700 text-gray-900 dark:text-white ${trunkError ? "border-red-500 focus:ring-red-500" : ""}`}>
                <SelectValue placeholder={row.customer_id ? "Select customer trunk" : "Select customer first"} />
              </SelectTrigger>
              <SelectContent className="bg-gray-100 dark:bg-zinc-800 border-gray-200 dark:border-zinc-700">
                {trunkOptions.map((trunk) => (
                  <SelectItem key={trunk} value={trunk} className="text-gray-900 dark:text-white">{trunk}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {trunkIsForeign && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                "{row.customer_trunk}" is not a trunk of this customer - pick the right customer or trunk.
              </p>
            )}
            {customerError && <FieldError>Please select a customer</FieldError>}
            {!customerError && trunkError && <FieldError>Please select a customer trunk</FieldError>}
          </div>
        );
      })}
    </div>
  );
};

export default CustomerTrunkRows;

// Read-only, full-width list of a ticket's customer -> trunk pairs (used in
// the AM details dialog). Wraps long names instead of truncating them.
export const TicketCustomersTile = ({ ticket }) => {
  const entries = (ticket?.customers || []).filter((c) => c && (c.customer || c.customer_trunk));
  const rows = entries.length > 0
    ? entries
    : [{ customer: ticket?.customer || ticket?.enterprise, customer_trunk: ticket?.customer_trunk }];
  return (
    <div className="bg-gray-100/30 dark:bg-zinc-800/30 p-2 rounded">
      <span className="text-zinc-500 text-[10px] uppercase">
        {rows.length > 1 ? `Customers & Trunks (${rows.length})` : "Customer & Trunk"}
      </span>
      <div className="mt-1 space-y-1">
        {rows.map((row, index) => (
          <div key={index} className="flex flex-wrap items-baseline gap-x-2 text-sm break-words">
            <span className="text-gray-900 dark:text-white font-medium break-all">{row.customer || "-"}</span>
            <span className="text-zinc-500">→</span>
            <span className="text-gray-700 dark:text-zinc-300 break-all">{row.customer_trunk || "-"}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
