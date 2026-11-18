(() => {
  const filtersTop = document.querySelector(".filters-top");
  const askAiFilter = document.querySelector("#ask-ai-filter");
  const promptForm = document.querySelector("#search-prompt-form");
  const promptField = document.querySelector("#search-prompt");
  const submitBtn = document.querySelector("#search-prompt-submit");
  const promptStatusEl = document.querySelector("#search-prompt-status");

  function setStatus(message, visible = true) {
    if (!promptStatusEl) return;
    promptStatusEl.textContent = message;
    promptStatusEl.hidden = !visible || !message;
  }

  function setAiFilterActive(active) {
    filtersTop?.classList.toggle("has-ai-filter", Boolean(active));
  }

  function clearAskAiSearch({ clearPrompt = true } = {}) {
    if (clearPrompt && promptField) promptField.value = "";
    setStatus("");
    setAiFilterActive(false);
    window.MapLeads?.clearRagPropertyFilter?.();
  }

  window.MapLeads = window.MapLeads || {};
  window.MapLeads.clearAskAiSearch = clearAskAiSearch;

  async function submitPrompt(event) {
    event.preventDefault();

    const prompt = promptField?.value.trim() ?? "";
    if (!prompt) {
      setStatus("Enter a search prompt.");
      promptField?.focus();
      return;
    }

    const mapCtx = window.MapLeads?.getSearchState?.() ?? {};

    setStatus("Searching…");
    submitBtn.disabled = true;

    try {
      const response = await fetch("/api/search/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          latitude: mapCtx.latitude,
          longitude: mapCtx.longitude,
          radiusMiles: mapCtx.radiusMiles,
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus(typeof payload.error === "string" ? payload.error : "Search failed.");
        return;
      }

      const matches = Array.isArray(payload.matchedProperties) ? payload.matchedProperties : [];
      const ids = [...new Set(matches.map((m) => m.propertyId).filter(Boolean))];

      if (ids.length && window.MapLeads?.applyRagSearchResults) {
        window.MapLeads.applyRagSearchResults(ids);
        setAiFilterActive(true);
        setStatus("");
      } else {
        window.MapLeads?.applyRagSearchResults?.([]);
        setAiFilterActive(false);
        setStatus(
          "No properties match that query within your search radius. Widen the radius or click Clear filters."
        );
      }
    } catch (err) {
      console.error(err);
      setStatus("Network error. Is the app running?");
    } finally {
      submitBtn.disabled = false;
    }
  }

  promptForm?.addEventListener("submit", submitPrompt);
})();