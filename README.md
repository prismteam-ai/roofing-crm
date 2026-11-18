## Live Runtime
https://roofingcrm-gge5f4h4f9c6ecem.westus3-01.azurewebsites.net/

## Demo Video
https://www.loom.com/share/c450afb1118c42cf8b31b580db7b7010

## Requirements

Map-based CRM for roofing companies to find and qualify residential and
commercial roofing leads. Data ingestion is out of scope; the app consumes
pre-existing property and permit data.

- Map and search default to a specific county
- Center search on current GPS location and/or a dropped pin
- Configurable search radius
- Show properties with roofs older than a configurable threshold (default 15 years)
- Show properties with open roofing permits, emphasizing long-open permits
- Permit details in the UI: status, open duration, contractor name, BBB rating (when available)
- Browsable list of matching lead candidates from the map/radius filters
- Create and manage CRM lead records from properties and permits
- RAG-backed agent answering natural-language roofing opportunity queries
- Disabled/placeholder sections for future CRM expansion

## Setup Instructions

**Quickest option:** use the Live Runtime link above. No setup is needed, and the OpenAI key is already configured there.

**Running locally**

Prerequisites:
- .NET 10 SDK
- A working OpenAI API key with access to the configured LLM and embedding models: `gpt-4o-mini` and `text-embedding-3-small`, set in an environment variable named `OPENAI_API_KEY`. 
  This is required for the natural-language (RAG agent) search. 
  The rest of the app (map, filters, permits, leads) works without it.

Steps:
```bash
git clone https://github.com/KakhaberTezelashvili/roofing-crm
cd roofing-crm

# Set the OpenAI key (required for natural-language search)
# macOS/Linux:
export OPENAI_API_KEY="<your-key>"
# Windows PowerShell:
# $env:OPENAI_API_KEY="<your-key>"

dotnet run
```

Then open: http://localhost:5271/