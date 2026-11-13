/**
 * The permit API as the CRM uses it: the data API's permits.longOpen and permits.forParcel, typed by the
 * vendored @oracle-la/api-client (its AppRouter and contract types; no cast).
 *
 * Permit descriptions are never requested, typed or shown: the API serves no description field.
 */
import type {
  ApiClient,
  LongOpenResult,
  ParcelPermits,
} from "@oracle-la/api-client";

export type {
  JoinMethod,
  LongOpenItem,
  LongOpenResult,
  ParcelPermit,
  ParcelPermits,
  PermitContractor,
  PermitStatusClass,
} from "@oracle-la/api-client";

/** permits.longOpen input, as the router declares it (the server fills in defaults for omitted keys). */
export type LongOpenInput = Parameters<
  ApiClient["permits"]["longOpen"]["query"]
>[0];
/** permits.forParcel input: a 10-digit parcel ID (AIN). */
export type ForParcelInput = Parameters<
  ApiClient["permits"]["forParcel"]["query"]
>[0];

/** The permit procedures, typed. */
export interface PermitsApi {
  longOpen(input: LongOpenInput): Promise<LongOpenResult>;
  forParcel(input: ForParcelInput): Promise<ParcelPermits>;
}

/**
 * The permit procedures of an API client. Against an API without the routes a call fails (a rejected
 * promise, also when a call throws before any request), and the caller shows that error inside its permits
 * section only.
 */
export function permitsApi(api: ApiClient): PermitsApi {
  return {
    longOpen: async (input) => api.permits.longOpen.query(input),
    forParcel: async (input) => api.permits.forParcel.query(input),
  };
}
