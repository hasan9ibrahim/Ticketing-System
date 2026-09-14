// Small red note shown under an invalid form field, e.g. a missing required field.
export const FieldError = ({ children = "This field shouldn't be empty" }) => (
  <p className="text-red-500 text-xs mt-1">{children}</p>
);

// Red asterisk to mark a mandatory field's label.
export const RequiredAsterisk = () => <span className="text-red-500 ml-0.5">*</span>;

export default FieldError;
