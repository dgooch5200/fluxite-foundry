import { ComponentProps } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/scn-ui/Select";
import { cn } from "utils/utils";

// Radix reserves the empty string for "nothing selected".
const EMPTY_VALUE = "\u0000empty";
const itemValue = (value: string) => (value === "" ? EMPTY_VALUE : value);

interface SelectFieldProps {
  values: string[];
  displayValues?: string[];
  selectedValue?: string;
  onSelectionChanged: (newValue: string) => void;
}

export const SelectField = ({
  values,
  displayValues,
  selectedValue,
  onSelectionChanged,
  className,
  ...props
}: SelectFieldProps & ComponentProps<typeof SelectTrigger>) => {
  return (
    <Select
      onValueChange={(newValue) =>
        onSelectionChanged(newValue === EMPTY_VALUE ? "" : newValue)
      }
      value={selectedValue === undefined ? undefined : itemValue(selectedValue)}
    >
      <SelectTrigger className={cn("w-xs bg-background", className)} {...props}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {values.map((value, index) => {
          return (
            <SelectItem key={index} value={itemValue(value)}>
              {displayValues && index < displayValues.length
                ? displayValues[index]
                : value}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
};

export interface SelectTableRowProps extends SelectFieldProps {
  label: string;
}

export const SelectTableRow = (props: SelectTableRowProps) => {
  return (
    <tr>
      <td style={{ verticalAlign: "middle" }}>{props.label}</td>
      <td>
        <SelectField {...props} />
      </td>
    </tr>
  );
};
