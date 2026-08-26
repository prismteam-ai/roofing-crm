/**
 * Maps a properties.get API payload into published-property drawer detail.
 */
import type { PropertiesGetResult } from "./create-http-properties-get-api-client";
import type { PublishedPropertyDrawerDetail } from "./PublishedPropertyDrawer";

/**
 * Converts properties.get output into drawer detail for the map shell.
 */
export function mapPropertiesGetResultToPublishedPropertyDrawerDetail(
  propertiesGetResult: PropertiesGetResult,
): PublishedPropertyDrawerDetail {
  return {
    propertyId: propertiesGetResult.propertyId,
    addressStreet: propertiesGetResult.addressStreet,
    addressCity: propertiesGetResult.addressCity,
    addressZip: propertiesGetResult.addressZip,
    builtYear: propertiesGetResult.builtYear,
    builtYearSource: propertiesGetResult.builtYearSource ?? null,
    hasBbbContractor: propertiesGetResult.hasBbbContractor,
    bbb: propertiesGetResult.bbb,
  };
}
