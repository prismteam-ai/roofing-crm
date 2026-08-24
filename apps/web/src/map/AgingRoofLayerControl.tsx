import type { JSX } from "react";

import { Checkbox } from "@/components/ui/checkbox";

/**
 * Props for the aging-roof map layer toggle (structure-year proxy).
 */
export interface AgingRoofLayerControlProps {
  /** Whether the aging-roof layer filter is active. */
  agingRoofLayerEnabled: boolean;
  /** Called when the user toggles the aging-roof layer. */
  onAgingRoofLayerEnabledChange: (enabled: boolean) => void;
}

/**
 * Checkbox control for the aging-roof layer.
 *
 * Pair with an external label (e.g. structure-age slider copy) for visible text
 * and accessible naming.
 */
export function AgingRoofLayerControl({
  agingRoofLayerEnabled,
  onAgingRoofLayerEnabledChange,
}: AgingRoofLayerControlProps): JSX.Element {
  return (
    <div data-testid="aging-roof-layer-control">
      <Checkbox
        id="aging-roof-layer"
        checked={agingRoofLayerEnabled}
        onCheckedChange={(checked) => {
          onAgingRoofLayerEnabledChange(checked === true);
        }}
      />
    </div>
  );
}
