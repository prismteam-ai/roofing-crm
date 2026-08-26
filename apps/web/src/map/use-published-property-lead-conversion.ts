/**
 * Lead conversion state for the published-property drawer.
 *
 * Owns list refresh, convert pending/status, and Escape-to-close so the map
 * search shell stays a layout coordinator.
 */
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { LeadRecord } from "@roofing-crm-challenge/shared";

import type { LeadRecordApiClient, LeadRecordManageableStatus } from "../leads";
import { CONVERT_PUBLISHED_PROPERTY_ALREADY_ON_LIST_COPY } from "./PublishedPropertyDrawer";

/**
 * Arguments for the published-property lead conversion hook.
 */
export interface UsePublishedPropertyLeadConversionArguments {
  defaultCountyKey: string;
  leadRecordApiClient: LeadRecordApiClient | undefined;
  selectedPropertyId: string | null;
  setSelectedPropertyId: Dispatch<SetStateAction<string | null>>;
  selectedAddressStreet: string | null;
  selectedPermitIds?: string[];
}

/**
 * Lead list + convert handlers for the map shell.
 */
export interface UsePublishedPropertyLeadConversionResult {
  leadRecords: LeadRecord[];
  archivedLeadRecords: LeadRecord[];
  leadRecordListStatusMessage: string | null;
  convertPublishedPropertyToLeadPending: boolean;
  convertPublishedPropertyToLeadStatusMessage: string | null;
  /** Increments after a successful save so the floating bar can stamp the Leads icon. */
  leadLandedPulseToken: number;
  handleConvertPublishedPropertyToLead: () => void;
  handlePublishedPropertyDrawerClose: () => void;
  handleArchiveLeadRecord: (leadId: string) => void;
  archiveLeadRecordPendingLeadId: string | null;
  handleUpdateLeadRecord: (leadId: string, status: LeadRecordManageableStatus) => void;
  updateLeadRecordPendingLeadId: string | null;
}

/**
 * Loads LeadRecords and converts the selected published property via the API client.
 */
export function usePublishedPropertyLeadConversion({
  defaultCountyKey,
  leadRecordApiClient,
  selectedPropertyId,
  setSelectedPropertyId,
  selectedAddressStreet,
  selectedPermitIds,
}: UsePublishedPropertyLeadConversionArguments): UsePublishedPropertyLeadConversionResult {
  const [leadRecords, setLeadRecords] = useState<LeadRecord[]>([]);
  const [archivedLeadRecords, setArchivedLeadRecords] = useState<LeadRecord[]>([]);
  const [leadRecordListStatusMessage, setLeadRecordListStatusMessage] = useState<
    string | null
  >(null);
  const [
    convertPublishedPropertyToLeadPending,
    setConvertPublishedPropertyToLeadPending,
  ] = useState(false);
  const [
    convertPublishedPropertyToLeadStatusMessage,
    setConvertPublishedPropertyToLeadStatusMessage,
  ] = useState<string | null>(null);
  const [archiveLeadRecordPendingLeadId, setArchiveLeadRecordPendingLeadId] = useState<
    string | null
  >(null);
  const [updateLeadRecordPendingLeadId, setUpdateLeadRecordPendingLeadId] = useState<
    string | null
  >(null);
  const [leadLandedPulseToken, setLeadLandedPulseToken] = useState(0);

  const refreshLeadRecords = useCallback(async () => {
    if (leadRecordApiClient === undefined) {
      setLeadRecords([]);
      setArchivedLeadRecords([]);
      setLeadRecordListStatusMessage(null);
      return;
    }

    try {
      const [listedLeadRecords, listedArchivedLeadRecords] = await Promise.all([
        leadRecordApiClient.listLeadRecords({
          county: defaultCountyKey,
        }),
        leadRecordApiClient.listLeadRecords({
          county: defaultCountyKey,
          status: "archived",
        }),
      ]);
      setLeadRecords(listedLeadRecords);
      setArchivedLeadRecords(listedArchivedLeadRecords);
      setLeadRecordListStatusMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load leads.";
      setLeadRecordListStatusMessage(message);
    }
  }, [defaultCountyKey, leadRecordApiClient]);

  useEffect(() => {
    void refreshLeadRecords();
  }, [refreshLeadRecords]);

  const handlePublishedPropertyDrawerClose = useCallback(() => {
    setSelectedPropertyId(null);
    setConvertPublishedPropertyToLeadStatusMessage(null);
  }, [setSelectedPropertyId]);

  const handleConvertPublishedPropertyToLead = useCallback(() => {
    if (
      leadRecordApiClient === undefined ||
      selectedPropertyId === null ||
      convertPublishedPropertyToLeadPending
    ) {
      return;
    }

    const alreadyConvertedLeadRecord = leadRecords.find(
      (leadRecord) =>
        leadRecord.propertyId === selectedPropertyId &&
        leadRecord.status !== "archived",
    );
    if (alreadyConvertedLeadRecord !== undefined) {
      setConvertPublishedPropertyToLeadStatusMessage(
        CONVERT_PUBLISHED_PROPERTY_ALREADY_ON_LIST_COPY,
      );
      return;
    }

    setConvertPublishedPropertyToLeadPending(true);
    setConvertPublishedPropertyToLeadStatusMessage(null);
    void (async () => {
      try {
        await leadRecordApiClient.createLeadRecord({
          propertyId: selectedPropertyId,
          county: defaultCountyKey,
          ...(selectedPermitIds !== undefined && selectedPermitIds.length > 0
            ? { permitIds: selectedPermitIds }
            : {}),
          addressSnapshot:
            selectedAddressStreet !== null && selectedAddressStreet.length > 0
              ? selectedAddressStreet
              : undefined,
        });
        setConvertPublishedPropertyToLeadStatusMessage(
          CONVERT_PUBLISHED_PROPERTY_ALREADY_ON_LIST_COPY,
        );
        setLeadLandedPulseToken((token) => token + 1);
        await refreshLeadRecords();
      } catch {
        setConvertPublishedPropertyToLeadStatusMessage(
          "Could not save this door. Try again.",
        );
      } finally {
        setConvertPublishedPropertyToLeadPending(false);
      }
    })();
  }, [
    convertPublishedPropertyToLeadPending,
    defaultCountyKey,
    leadRecordApiClient,
    leadRecords,
    refreshLeadRecords,
    selectedAddressStreet,
    selectedPermitIds,
    selectedPropertyId,
  ]);

  const handleUpdateLeadRecord = useCallback(
    (leadId: string, status: LeadRecordManageableStatus) => {
      if (
        leadRecordApiClient === undefined ||
        updateLeadRecordPendingLeadId !== null ||
        archiveLeadRecordPendingLeadId !== null
      ) {
        return;
      }

      setUpdateLeadRecordPendingLeadId(leadId);
      void (async () => {
        try {
          await leadRecordApiClient.updateLeadRecord(leadId, status);
          await refreshLeadRecords();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not update lead.";
          setLeadRecordListStatusMessage(message);
        } finally {
          setUpdateLeadRecordPendingLeadId(null);
        }
      })();
    },
    [
      archiveLeadRecordPendingLeadId,
      leadRecordApiClient,
      refreshLeadRecords,
      updateLeadRecordPendingLeadId,
    ],
  );

  const handleArchiveLeadRecord = useCallback(
    (leadId: string) => {
      if (
        leadRecordApiClient === undefined ||
        archiveLeadRecordPendingLeadId !== null
      ) {
        return;
      }

      setArchiveLeadRecordPendingLeadId(leadId);
      void (async () => {
        try {
          await leadRecordApiClient.archiveLeadRecord(leadId);
          setConvertPublishedPropertyToLeadStatusMessage(
            "Removed from your leads list. Save it again if you still want it.",
          );
          await refreshLeadRecords();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Could not archive lead.";
          setLeadRecordListStatusMessage(message);
        } finally {
          setArchiveLeadRecordPendingLeadId(null);
        }
      })();
    },
    [archiveLeadRecordPendingLeadId, leadRecordApiClient, refreshLeadRecords],
  );

  useEffect(() => {
    const closeDrawerOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && selectedPropertyId !== null) {
        handlePublishedPropertyDrawerClose();
      }
    };
    window.addEventListener("keydown", closeDrawerOnEscape);
    return () => {
      window.removeEventListener("keydown", closeDrawerOnEscape);
    };
  }, [handlePublishedPropertyDrawerClose, selectedPropertyId]);

  return {
    leadRecords,
    archivedLeadRecords,
    leadRecordListStatusMessage,
    convertPublishedPropertyToLeadPending,
    convertPublishedPropertyToLeadStatusMessage,
    leadLandedPulseToken,
    handleConvertPublishedPropertyToLead,
    handlePublishedPropertyDrawerClose,
    handleArchiveLeadRecord,
    archiveLeadRecordPendingLeadId,
    handleUpdateLeadRecord,
    updateLeadRecordPendingLeadId,
  };
}
