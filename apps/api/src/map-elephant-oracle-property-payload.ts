/**
 * Maps flat or nested Elephant `getOracleProperty` JSON into the CRM contract.
 */
import type {
  OraclePropertyBusinessReputationProfile,
  OraclePropertyPermitRecord,
  OraclePropertyRecord,
} from "./routers/properties.js";

function coerceNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function coerceNullableInt(value: unknown): number | null {
  const numberValue = coerceNullableNumber(value);
  return numberValue === null ? null : Math.trunc(numberValue);
}

function readNestedRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapBbbProfiles(payload: unknown): OraclePropertyBusinessReputationProfile[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((item) => {
    if (item === null || typeof item !== "object") {
      return {};
    }
    const profile = item as Record<string, unknown>;
    const ratingLetter =
      typeof profile.ratingLetter === "string"
        ? profile.ratingLetter
        : typeof profile.bbbRating === "string"
          ? profile.bbbRating
          : null;
    return {
      bbbRating:
        typeof profile.bbbRating === "string" ? profile.bbbRating : ratingLetter,
      ratingScore: coerceNullableNumber(profile.ratingScore),
      ratingLetter,
    };
  });
}

function mapPermits(payload: unknown): OraclePropertyPermitRecord[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload as OraclePropertyPermitRecord[];
}

function mapFlatOraclePropertyRecord(
  record: Record<string, unknown>,
): OraclePropertyRecord {
  if (typeof record.propertyId !== "string") {
    throw new Error("getOracleProperty payload missing propertyId");
  }

  return {
    propertyId: record.propertyId,
    parcelIdentifier:
      typeof record.parcelIdentifier === "string" ? record.parcelIdentifier : null,
    addressStreet:
      typeof record.addressStreet === "string" ? record.addressStreet : null,
    addressCity: typeof record.addressCity === "string" ? record.addressCity : null,
    addressZip: typeof record.addressZip === "string" ? record.addressZip : null,
    latitude: coerceNullableNumber(record.latitude),
    longitude: coerceNullableNumber(record.longitude),
    builtYear: coerceNullableInt(record.builtYear),
    hasPermits: typeof record.hasPermits === "boolean" ? record.hasPermits : null,
    permitCount: coerceNullableInt(record.permitCount),
    hasBbbContractor:
      typeof record.hasBbbContractor === "boolean" ? record.hasBbbContractor : null,
    permits: mapPermits(record.permits),
    businessReputationProfiles: mapBbbProfiles(
      record.businessReputationProfiles ?? record.bbbProfiles,
    ),
  };
}

/**
 * Maps live Elephant consolidated JSON into `OraclePropertyRecord`.
 *
 * Echoes `requestedPropertyId` so list, drawer, and lead keys stay aligned with
 * query-table search rows even when consolidated JSON uses a different parcel id.
 */
export function mapElephantOraclePropertyPayload(
  payload: unknown,
  requestedPropertyId: string,
): OraclePropertyRecord {
  if (payload === null || typeof payload !== "object") {
    throw new Error("getOracleProperty returned a non-object payload");
  }

  const record = payload as Record<string, unknown>;
  if (typeof record.propertyId === "string") {
    return mapFlatOraclePropertyRecord(record);
  }

  const address = readNestedRecord(record.address);
  const parcel = readNestedRecord(record.parcel);
  const property = readNestedRecord(record.property);
  const geometry = readNestedRecord(record.geometry);
  const permits = mapPermits(record.permits);
  const businessReputationProfiles = mapBbbProfiles(
    record.bbbProfiles ?? record.businessReputationProfiles,
  );

  const latitude =
    coerceNullableNumber(address.latitude) ??
    coerceNullableNumber(geometry.latitude) ??
    coerceNullableNumber(record.latitude);
  const longitude =
    coerceNullableNumber(address.longitude) ??
    coerceNullableNumber(geometry.longitude) ??
    coerceNullableNumber(record.longitude);

  return {
    propertyId: requestedPropertyId,
    parcelIdentifier:
      typeof parcel.parcelIdentifier === "string"
        ? parcel.parcelIdentifier
        : typeof record.parcelIdentifier === "string"
          ? record.parcelIdentifier
          : null,
    addressStreet:
      typeof address.street === "string"
        ? address.street
        : typeof record.addressStreet === "string"
          ? record.addressStreet
          : null,
    addressCity:
      typeof address.city === "string"
        ? address.city
        : typeof record.addressCity === "string"
          ? record.addressCity
          : null,
    addressZip:
      typeof address.postalCode === "string"
        ? address.postalCode
        : typeof record.addressZip === "string"
          ? record.addressZip
          : null,
    latitude,
    longitude,
    builtYear: coerceNullableInt(property.builtYear ?? record.builtYear),
    hasPermits:
      typeof record.hasPermits === "boolean"
        ? record.hasPermits
        : permits.length > 0
          ? true
          : null,
    permitCount:
      coerceNullableInt(record.permitCount) ??
      (permits.length > 0 ? permits.length : null),
    hasBbbContractor:
      typeof record.hasBbbContractor === "boolean"
        ? record.hasBbbContractor
        : businessReputationProfiles.length > 0
          ? true
          : null,
    permits,
    businessReputationProfiles,
  };
}
