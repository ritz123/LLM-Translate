import type { SelectProps } from "@mui/material";

/** Wider list surface so long labels (languages, models) are not clipped. */
const defaultPaperSx = {
  maxHeight: 420,
  minWidth: 280,
};

/** Pass to MUI `<Select MenuProps={...} />` for consistent dropdown sizing. */
export function selectMenuProps(minWidth = 280): NonNullable<SelectProps["MenuProps"]> {
  return {
    slotProps: {
      paper: {
        sx: {
          ...defaultPaperSx,
          minWidth,
        },
      },
    },
    disableAutoFocusItem: true,
  };
}
