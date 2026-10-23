import { Button, ButtonProps } from "components/scn-ui/Button";

export const LabeledIconButton = ({
  label,
  ...props
}: ButtonProps & { label: string }) => (
  <Button
    size="icon"
    variant="ghost"
    aria-label={label}
    title={label}
    {...props}
  />
);
