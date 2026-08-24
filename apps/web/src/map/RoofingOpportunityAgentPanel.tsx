/**
 * Agent panel for natural-language roofing opportunity questions.
 */
import { ArrowUp, Loader2Icon } from "lucide-react";
import {
  useCallback,
  useState,
  type FormEvent,
  type JSX,
  type KeyboardEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  AgentAskApiClient,
  AgentAskResult,
} from "./create-http-agent-ask-api-client";
import { formatAgentAskFreshnessCopy } from "./format-agent-ask-freshness-copy";
import {
  SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY,
  SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_COVERAGE_COPY,
  SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY,
} from "./search-in-radius-query-status-copy";

export const AGENT_PANEL_NOT_CONNECTED_COPY = "RoofRadar AI is not connected yet.";

export const AGENT_PANEL_EMPTY_INVITE_HEADING = "Which doors here are worth knocking?";

export const AGENT_PANEL_EMPTY_INVITE_BODY =
  "Ask about aging roofs or permits that sat open in this radius and our AI will show you opportunities on the map.";

export const AGENT_PANEL_ASKING_COPY = "Asking this radius…";

export const AGENT_PANEL_ASK_FAILED_COPY =
  "Couldn't ask RoofRadar AI. Try again in a moment.";

/**
 * Props for the roofing opportunity agent panel.
 */
export interface RoofingOpportunityAgentPanelProps {
  county: string;
  center: { lat: number; lng: number };
  radiusMiles: number;
  mapSearchReady?: boolean;
  agentAskApiClient?: AgentAskApiClient;
  selectedPropertyId?: string | null;
  onCitationPropertySelect?: (propertyId: string) => void;
  onAgentAskResult?: (result: AgentAskResult | null) => void;
  onSwitchToMapReadyCounty?: () => void;
  onApplyStructuredSearchFallback?: (arguments_: {
    minStructureAgeYears?: number;
    minOpenPermitYears?: number;
  }) => void;
}

/**
 * Renders ask-about-this-radius UI with citations and honest indexed state.
 */
export function RoofingOpportunityAgentPanel({
  county,
  center,
  radiusMiles,
  mapSearchReady = true,
  agentAskApiClient,
  selectedPropertyId = null,
  onCitationPropertySelect,
  onAgentAskResult,
  onSwitchToMapReadyCounty,
  onApplyStructuredSearchFallback,
}: RoofingOpportunityAgentPanelProps): JSX.Element {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AgentAskResult | null>(null);

  const askConnected = agentAskApiClient !== undefined && mapSearchReady;
  const threadIsEmpty = result === null && errorMessage === null && !pending;
  const canSubmit = !pending && askConnected && message.trim().length > 0;

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (
        agentAskApiClient === undefined ||
        mapSearchReady === false ||
        message.trim().length === 0
      ) {
        return;
      }
      setPending(true);
      setErrorMessage(null);
      onAgentAskResult?.(null);
      try {
        const response = await agentAskApiClient.ask({
          county,
          message: message.trim(),
          center,
          radiusMiles,
        });
        setResult(response);
        onAgentAskResult?.(response);
      } catch (error) {
        const nextMessage =
          error instanceof Error ? error.message : AGENT_PANEL_ASK_FAILED_COPY;
        if (/OPENSEARCH_ENDPOINT|not indexed|agent\.ask requires/i.test(nextMessage)) {
          setResult({
            answer: SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY,
            indexed: false,
            citations: [],
            confidence: 0,
            coverageNote: SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_COVERAGE_COPY,
          });
          onAgentAskResult?.({
            answer: SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_USE_RADIUS_COPY,
            indexed: false,
            citations: [],
            confidence: 0,
            coverageNote: SEARCH_IN_RADIUS_AGENT_NOT_INDEXED_COVERAGE_COPY,
          });
          setErrorMessage(null);
        } else {
          setErrorMessage(nextMessage);
          setResult(null);
          onAgentAskResult?.(null);
        }
      } finally {
        setPending(false);
      }
    },
    [
      agentAskApiClient,
      center,
      county,
      mapSearchReady,
      message,
      onAgentAskResult,
      radiusMiles,
    ],
  );

  const handleMessageKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
        return;
      }
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    },
    [],
  );

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="roofing-opportunity-agent-panel"
    >
      <div
        className={
          threadIsEmpty
            ? "flex min-h-0 flex-1 flex-col overflow-auto"
            : "min-h-0 flex-1 overflow-auto px-3 py-2"
        }
      >
        {mapSearchReady === false ? (
          <div
            className="flex flex-col gap-2 px-3 py-3"
            data-testid="roofing-opportunity-agent-county-not-map-ready"
            role="status"
          >
            <p className="font-heading text-base font-bold tracking-wide text-foreground uppercase">
              {SEARCH_IN_RADIUS_COUNTY_NOT_MAP_READY_EMPTY_COPY.split(". ")[0]}.
            </p>
            {onSwitchToMapReadyCounty !== undefined ? (
              <Button
                type="button"
                variant="outline"
                className="w-fit rounded-none border-foreground/70 bg-card font-heading text-xs tracking-wide uppercase"
                data-testid="roofing-opportunity-agent-switch-to-lee"
                onClick={onSwitchToMapReadyCounty}
              >
                Walk Lee County
              </Button>
            ) : null}
          </div>
        ) : null}

        {mapSearchReady && threadIsEmpty ? (
          <div
            className="flex min-h-40 w-full flex-1 flex-col items-center justify-end px-5 pt-10 pb-5"
            data-testid="roofing-opportunity-agent-empty-invite"
          >
            <div className="flex w-full max-w-[20rem] flex-col gap-2 text-left">
              <h3 className="font-heading text-base font-bold tracking-wide text-foreground uppercase">
                {AGENT_PANEL_EMPTY_INVITE_HEADING}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {AGENT_PANEL_EMPTY_INVITE_BODY}
              </p>
            </div>
          </div>
        ) : null}

        {mapSearchReady && pending && result === null && errorMessage === null ? (
          <p className="text-xs text-muted-foreground" role="status">
            {AGENT_PANEL_ASKING_COPY}
          </p>
        ) : null}

        {mapSearchReady && errorMessage !== null ? (
          <p
            className="text-xs text-destructive"
            role="alert"
            data-testid="roofing-opportunity-agent-error"
          >
            {errorMessage}
          </p>
        ) : null}

        {mapSearchReady && result !== null ? (
          <div
            className="flex flex-col gap-2 rounded-sm border border-foreground/40 bg-muted/30 p-2.5"
            data-testid="roofing-opportunity-agent-result"
            role={!result.indexed ? "status" : undefined}
          >
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {result.answer}
            </p>
            {result.freshness !== undefined ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="roofing-opportunity-agent-freshness"
              >
                {formatAgentAskFreshnessCopy(result.freshness)}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{result.coverageNote}</p>
            {result.citations.length > 0 ? (
              <div className="flex flex-col gap-1.5 border-t border-foreground/20 pt-2">
                <p className="font-heading text-[0.65rem] font-semibold tracking-wide text-foreground uppercase">
                  On the map
                </p>
                <div className="flex flex-wrap gap-1">
                  {result.citations.map((citation) => {
                    const isSelected = selectedPropertyId === citation.propertyId;
                    return (
                      <Button
                        key={`${citation.propertyId}-${citation.sourceUri}`}
                        type="button"
                        variant="secondary"
                        size="xs"
                        className={cn(
                          "rounded-full",
                          isSelected &&
                            "bg-[#c4a574]/40 text-foreground ring-1 ring-foreground/30",
                        )}
                        data-testid={`roofing-opportunity-agent-citation-${citation.propertyId}`}
                        aria-pressed={isSelected}
                        title={citation.reason}
                        onClick={() => {
                          onCitationPropertySelect?.(citation.propertyId);
                        }}
                      >
                        {citation.propertyId}
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {result.indexed &&
            result.confidence < 0.2 &&
            result.fallback !== undefined ? (
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  data-testid="roofing-opportunity-agent-structured-fallback"
                  onClick={() => {
                    onApplyStructuredSearchFallback?.({
                      minStructureAgeYears:
                        result.fallback?.searchInRadiusInput.minStructureAgeYears,
                      minOpenPermitYears:
                        result.fallback?.searchInRadiusInput.minOpenPermitYears,
                    });
                  }}
                >
                  Show matching roofs
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <form
        className="shrink-0 px-3 pt-1 pb-3"
        onSubmit={handleSubmit}
        hidden={mapSearchReady === false}
      >
        <div className="rounded-sm border border-foreground/50 bg-background focus-within:border-foreground focus-within:ring-2 focus-within:ring-ring/60">
          <textarea
            id="roofing-opportunity-agent-message"
            aria-label="Question for RoofRadar AI"
            className="min-h-16 w-full resize-none bg-transparent px-2.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
            }}
            onKeyDown={handleMessageKeyDown}
            placeholder="e.g. open roofing permits older than five years"
            data-testid="roofing-opportunity-agent-message"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            {!askConnected ? (
              <p
                id="roofing-opportunity-agent-connection-status"
                className="min-w-0 flex-1 font-heading text-[0.65rem] font-semibold leading-snug tracking-wide text-muted-foreground uppercase"
                role="status"
                data-testid="roofing-opportunity-agent-connection-status"
              >
                {AGENT_PANEL_NOT_CONNECTED_COPY}
              </p>
            ) : null}
            <Button
              type="submit"
              size="icon-sm"
              className="ml-auto rounded-sm"
              disabled={!canSubmit}
              aria-label={pending ? "Asking" : "Send"}
              aria-describedby={
                askConnected ? undefined : "roofing-opportunity-agent-connection-status"
              }
              data-testid="roofing-opportunity-agent-submit"
            >
              {pending ? (
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowUp className="size-3.5" strokeWidth={2.25} aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
