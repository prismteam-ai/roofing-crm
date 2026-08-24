/**
 * Street-first label for a published property in list and drawer chrome.
 *
 * Sales think in addresses; propertyId stays tertiary, not the row title.
 */
export function formatPublishedPropertyStreetLabel(arguments_: {
  addressStreet: string | null;
  fallbackLabel: string;
}): string {
  const street = arguments_.addressStreet?.trim();
  if (street === undefined || street.length === 0) {
    return arguments_.fallbackLabel;
  }
  return street;
}
