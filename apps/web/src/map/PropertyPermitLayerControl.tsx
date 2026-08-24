import type { JSX } from "react";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * Props for the long-open roofing permit map layer toggle.
 */
export interface PropertyPermitLayerControlProps {
  /** Whether the long-open roofing permit layer is active. */
  propertyPermitLayerEnabled: boolean;
  /** Optional element ids for supplementary screen-reader copy. */
  describedBy?: string;
  /** Called when the user toggles the permit layer. */
  onPropertyPermitLayerEnabledChange: (enabled: boolean) => void;
}

/**
 * Checkbox control for the long-open roofing permit layer.
 *
 * Pair with an external label (e.g. open-years slider copy) for visible text
 * and accessible naming.
 */
export function PropertyPermitLayerControl({
  propertyPermitLayerEnabled,
  describedBy,
  onPropertyPermitLayerEnabledChange,
}: PropertyPermitLayerControlProps): JSX.Element {
  return (
    <div data-testid="property-permit-layer-control">
      <Checkbox
        id="property-permit-layer"
        checked={propertyPermitLayerEnabled}
        onCheckedChange={(checked) => {
          onPropertyPermitLayerEnabledChange(checked === true);
        }}
        aria-describedby={describedBy}
      />
    </div>
  );
}
