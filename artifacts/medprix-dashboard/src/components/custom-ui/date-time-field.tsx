import { DateInputField, type DateFieldProps } from "./date-field";

export type DateTimeFieldProps = DateFieldProps;

/** A local date and time, with native form values and validation. */
export function DateTimeField(props: DateTimeFieldProps) {
  return <DateInputField {...props} inputKind="datetime-local" />;
}
