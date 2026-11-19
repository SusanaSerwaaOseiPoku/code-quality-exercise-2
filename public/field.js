export function Field({
  id,
  label,
  name,
  type = "text",
  value = "",
  required = false,
  min,
  max,
  step,
  options = [],
  autocomplete,
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "form-field";

  const labelElement = document.createElement("label");
  labelElement.htmlFor = id;
  labelElement.textContent = label;

  const control =
    type === "select"
      ? document.createElement("select")
      : document.createElement("input");
  control.id = id;
  control.name = name;
  control.required = required;
  control.value = value;
  if (type !== "select") {
    control.type = type;
  }
  if (min !== undefined) control.min = String(min);
  if (max !== undefined) control.max = String(max);
  if (step !== undefined) control.step = String(step);
  if (autocomplete) control.autocomplete = autocomplete;

  if (type === "select") {
    for (const option of options) {
      const optionElement = document.createElement("option");
      optionElement.value = option.value;
      optionElement.textContent = option.label;
      control.append(optionElement);
    }
    control.value = value;
  }

  const errorElement = document.createElement("p");
  errorElement.className = "field-error";
  errorElement.id = `${id}-error`;
  errorElement.setAttribute("role", "alert");
  errorElement.hidden = true;
  control.setAttribute("aria-describedby", errorElement.id);

  wrapper.append(labelElement, control, errorElement);

  return {
    element: wrapper,
    control,
    setValue(nextValue) {
      control.value = nextValue;
    },
    setError(message) {
      errorElement.textContent = message;
      errorElement.hidden = !message;
      control.setAttribute("aria-invalid", String(Boolean(message)));
    },
  };
}
