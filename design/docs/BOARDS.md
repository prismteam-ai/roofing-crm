# Board index

259 boards: 106 CountyLens, 153 Roofing CRM. Round CRM-R1 added 18 Crm boards (CrmAppsMenu, CrmShellApps1440/768 and the NoAddress / NoContractor boards for map, candidates, property, triage, agent, Leads and Lead). NoAddress and NoContractor boards are the state the first build ships; address and “as printed on permit” boards are the field-present state. Open any of them at `http://localhost:8765/<file>` once the prototype is served (see CLAUDE.md).

| File | Product | Size | What it shows (screen · state) | Data state |
|---|---|---|---|---|
| `Main.dc.html` | CountyLens | 1840×2960 | Site map · both apps: CountyLens, the Apps hub and the Roofing CRM (start here) |  |
| `Flows.dc.html` | CountyLens | 1928×1456 | Main user flows |  |
| `Shell390Location.dc.html` | CountyLens | 390×844 | Shell · 390 · location picker |  |
| `Shell390ComingSoon.dc.html` | CountyLens | 390×844 | Shell · 390 · coming soon |  |
| `Shell390More.dc.html` | CountyLens | 390×844 | Shell · 390 · More and footer |  |
| `Shell1440.dc.html` | CountyLens | 1440×900 | Help menu open over Explore · 1440 |  |
| `ShellStates.dc.html` | CountyLens | 880×760 | Shell · header states |  |
| `Extensions.dc.html` | CountyLens | 1440×3840 | Extensions log |  |
| `Welcome390.dc.html` | CountyLens | 390×844 | First visit · 390 · “What can I ask?” card |  |
| `Welcome1440.dc.html` | CountyLens | 1440×900 | First visit · 1440 · Explore with the “What can I ask?” card |  |
| `LegalTerms1440.dc.html` | CountyLens | 1440×1000 | Terms · 1440 |  |
| `LegalData1440.dc.html` | CountyLens | 1440×1000 | Data use and licences · 1440 |  |
| `LegalPrivacy1440.dc.html` | CountyLens | 1440×1000 | Privacy · 1440 |  |
| `LegalData390.dc.html` | CountyLens | 390×1200 | Data use and licences · 390 |  |
| `EmptyHints.dc.html` | CountyLens | 960×900 | Empty-state hints |  |
| `Explore1440.dc.html` | CountyLens | 1440×900 | Explore · 1440 · one workspace: Filters / Builder (prototype, coming soon) / SQL / AI · List view, Map · Soon (map: CRM preview toggle) · Area + radius in the query panel |  |
| `Explore768.dc.html` | CountyLens | 768×1024 | Explore · 768 · same workspace, tablet layout: query overlay, full-width table |  |
| `Explore390.dc.html` | CountyLens | 390×844 | Explore · 390 · same workspace, mobile layout: results are the page, Edit query FAB opens the query sheet |  |
| `ExploreStates.dc.html` | CountyLens | 1440×760 | Explore · results pane states |  |
| `PropertyDetail.dc.html` | CountyLens | 560×3200 | Property detail · drawer, full length (shared component) |  |
| `Property1440.dc.html` | CountyLens | 1440×900 | Property · 1440 · drawer over Explore · drawer over the List view (map backdrop: CRM preview only) |  |
| `Property390.dc.html` | CountyLens | 390×844 | Property · 390 · full sheet |  |
| `Property390Full.dc.html` | CountyLens | 390×4056 | Property · 390 · full length |  |
| `Property390NoImagery.dc.html` | CountyLens | 390×844 | Property · 390 · Street View coming soon |  |
| `PropertyStates.dc.html` | CountyLens | 1440×760 | Property · states |  |
| `SearchStates.dc.html` | CountyLens | 1440×720 | Search · states |  |
| `Runs1440.dc.html` | CountyLens | 1440×1940 | Runs · 1440 · run picker first (every run with its timestamp), pipeline, timeline, what the run changed |  |
| `RunsCompare1440.dc.html` | CountyLens | 1440×960 | Runs · compare Run 3 vs Run 2 (D-7) |  |
| `RunsLog1440.dc.html` | CountyLens | 1440×960 | Runs · pipeline history log |  |
| `Runs390.dc.html` | CountyLens | 390×4874 | Runs · 390 |  |
| `RunsStates.dc.html` | CountyLens | 1440×720 | Runs · states, incl. stale data |  |
| `Coverage1440.dc.html` | CountyLens | 1440×3220 | Coverage · 1440 (D-3) · six record kinds, reconciliation, cost |  |
| `Coverage390.dc.html` | CountyLens | 390×8844 | Coverage · 390 |  |
| `CoverageStates.dc.html` | CountyLens | 1440×720 | Coverage · states |  |
| `DataManifest1440.dc.html` | CountyLens | 1440×1000 | Data · run chain and manifest (D-5) |  |
| `DataVerify1440.dc.html` | CountyLens | 1440×900 | Data · gateway race (D-6), press Verify |  |
| `DataCatalog1440.dc.html` | CountyLens | 1440×1100 | Data · catalog |  |
| `Data390.dc.html` | CountyLens | 390×1500 | Data · 390 |  |
| `DataStates.dc.html` | CountyLens | 1440×900 | Data · lane and screen states |  |
| `SqlStates.dc.html` | CountyLens | 1440×820 | SQL · states and plain-language errors |  |
| `Activity1440.dc.html` | CountyLens | 1440×1160 | Activity · 1440 (nice to have) |  |
| `Activity390.dc.html` | CountyLens | 390×4556 | Activity · 390 |  |
| `ActivityStates.dc.html` | CountyLens | 1440×720 | Activity · states, incl. not enough activity |  |
| `HelperStates.dc.html` | CountyLens | 1440×1109 | AI mode · states: working, empty, error, partial, rate-limited, can't answer, took too long (populated state: Explore in AI mode) |  |
| `A11yAudit.dc.html` | CountyLens | 1440×2190 | Accessibility check · results, specimens, reduced motion, fix log |  |
| `ProtoBar.dc.html` | CountyLens | 280×440 | Prototype controls (on every board) · includes the prototype-only “Map view (CRM preview)” switch, off by default · do not ship |  |
| `SearchBox.dc.html` | CountyLens | 720×696 | Search box · opens in place on every screen (Suggested starting points, Recent, Saved, typed matches) |  |
| `ExploreQ-roof15.dc.html` | CountyLens | 1440×900 | Explore opened from search · Roofs ≥ 15 yrs near Pflugerville · Filters · List (map off) (D-8) |  |
| `ExploreQ-ooa78753.dc.html` | CountyLens | 1440×900 | Explore opened from search · Out-of-area owners with tenure > 10 yrs · Filters (SC-5) |  |
| `ExploreQ-stalled78753.dc.html` | CountyLens | 1440×900 | Explore opened from search · Stalled reroof permits · Filters |  |
| `ExploreQ-permits5.dc.html` | CountyLens | 1440×900 | Explore opened from search · Open or stalled permits, open ≥ 5 yrs, roof ≥ 15, near Pflugerville · Filters (D-9) |  |
| `ExploreQ-sqlperm.dc.html` | CountyLens | 1440×900 | Explore opened from search · Contractors with most open permits · SQL |  |
| `ExploreQ-aicontractor.dc.html` | CountyLens | 1440×900 | Explore opened from search · Sample Roofing Co. and long-open permits · AI |  |
| `ExploreQ-aiooa.dc.html` | CountyLens | 1440×900 | Explore opened from search · Out-of-area owners, roof ≥ 20 · AI |  |
| `ExploreQ-builder.dc.html` | CountyLens | 1440×900 | Explore opened from search · Builder · prototype (coming soon) |  |
| `ExploreQ-sql.dc.html` | CountyLens | 1440×900 | Explore opened from search · SQL · empty start |  |
| `ExploreQ-ai.dc.html` | CountyLens | 1440×900 | Explore · AI · D-10 answered (populated) |  |
| `ExploreQ390-roof15.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · roof15 |  |
| `ExploreQ390-ooa78753.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · ooa78753 |  |
| `ExploreQ390-stalled78753.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · stalled78753 |  |
| `ExploreQ390-permits5.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · Open or stalled permits, open ≥ 5 yrs · Filters (D-9) |  |
| `ExploreQ390-sqlperm.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · sqlperm |  |
| `ExploreQ390-aicontractor.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · aicontractor |  |
| `ExploreQ390-aiooa.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · aiooa |  |
| `ExploreQ390-builder.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · Builder · prototype (coming soon) |  |
| `ExploreQ390-sql.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · sql |  |
| `ExploreQ390-ai.dc.html` | CountyLens | 390×844 | Explore 390 opened from search · ai |  |
| `Pager.dc.html` | CountyLens | 420×48 | Pager · numbered page navigation (shared by every paged list) |  |
| `HelpMcp1440.dc.html` | CountyLens | 1440×1440 | Help · MCP and API docs (D-12) · try a tool |  |
| `HelpMcp390.dc.html` | CountyLens | 390×3220 | Help · MCP and API docs · 390 |  |
| `Hub1440.dc.html` | CountyLens | 1440×900 | Apps hub · suite landing page |  |
| `Hub390.dc.html` | CountyLens | 390×1420 | Apps hub · 390 |  |
| `AdminSignIn1440.dc.html` | CountyLens | 1440×900 | Admin sign-in (from Help menu, admins only) |  |
| `AdminSignIn390.dc.html` | CountyLens | 390×844 | Admin sign-in · 390 |  |
| `RunsAdmin1440.dc.html` | CountyLens | 1440×1940 | Runs · signed in as admin: Start / Stop / Retry, Activity in nav |  |
| `Welcome768.dc.html` | CountyLens | 768×1024 | First visit · 768 · “What can I ask?” card |  |
| `Property768.dc.html` | CountyLens | 768×3140 | Property · 768 · drawer over Explore |  |
| `Runs768.dc.html` | CountyLens | 768×3506 | Runs · 768 |  |
| `RunsCompare768.dc.html` | CountyLens | 768×1578 | Runs · compare · 768 |  |
| `RunsLog768.dc.html` | CountyLens | 768×1207 | Runs · history log · 768 |  |
| `Coverage768.dc.html` | CountyLens | 768×5177 | Coverage · 768 |  |
| `DataManifest768.dc.html` | CountyLens | 768×1345 | Data · manifest · 768 |  |
| `DataVerify768.dc.html` | CountyLens | 768×1231 | Data · verify · 768 |  |
| `DataCatalog768.dc.html` | CountyLens | 768×2266 | Data · catalog · 768 |  |
| `Activity768.dc.html` | CountyLens | 768×3548 | Activity · 768 (admin only) |  |
| `HelpMcp768.dc.html` | CountyLens | 768×2620 | Help · MCP docs · 768 |  |
| `Hub768.dc.html` | CountyLens | 768×1200 | Apps hub · 768 |  |
| `AdminSignIn768.dc.html` | CountyLens | 768×1024 | Admin sign-in · 768 |  |
| `LegalTerms768.dc.html` | CountyLens | 768×1161 | Terms · 768 |  |
| `LegalData768.dc.html` | CountyLens | 768×1228 | Data use and licences · 768 |  |
| `LegalPrivacy768.dc.html` | CountyLens | 768×1208 | Privacy · 768 |  |
| `ExploreQ-ailimit.dc.html` | CountyLens | 1440×900 | Explore · AI · 10 questions used this session · Open this question in Filters; sign-in for more: coming soon (#58, #66, #79) |  |
| `ExploreQ-aipaused.dc.html` | CountyLens | 1440×900 | Explore · AI · daily budget reached, AI paused (#58) |  |
| `UserSignIn1440.dc.html` | CountyLens | 1440×900 | Coming soon · Sign in to keep asking · AI users (#58) |  |
| `UserSignIn768.dc.html` | CountyLens | 768×1024 | Coming soon · Sign in to keep asking · 768 |  |
| `UserSignIn390.dc.html` | CountyLens | 390×844 | Coming soon · Sign in to keep asking · 390 |  |
| `ExploreQ-crmmap.dc.html` | CountyLens | 1440×900 | CRM preview · Explore and Search with Map, Filters and AI (CRM first release) · prototype only, not in CountyLens |  |
| `RunChain.dc.html` | CountyLens | 1296×260 | Run chain · manifests newest first, each linked to the previous (AD-03, E-41) |  |
| `ContractorBadge.dc.html` | CountyLens | 1296×648 | Contractor badge · five identity states plus “No contractor printed on permit”, 390 key–value example (AD-05, AD-06, E-42) |  |
| `ExploreQ-aiworking.dc.html` | CountyLens | 1440×900 | Explore · AI · Working… with timer and Cancel, one response, no streaming (AD-09, E-43) |  |
| `ExploreQ-aislow.dc.html` | CountyLens | 1440×900 | Explore · AI · Took too long at 25 s: Try again or Use Filters instead (AD-09, E-43) |  |
| `ExploreQ390-aiworking.dc.html` | CountyLens | 390×844 | Explore 390 · AI · Working… (AD-09) |  |
| `ExploreQ390-aislow.dc.html` | CountyLens | 390×844 | Explore 390 · AI · Took too long (AD-09) |  |
| `ExploreQ768-aiworking.dc.html` | CountyLens | 768×1024 | Explore 768 · AI · Working… (AD-09) |  |
| `ExploreQ768-aislow.dc.html` | CountyLens | 768×1024 | Explore 768 · AI · Took too long (AD-09) |  |
| `RunsCompare390.dc.html` | CountyLens | 390×1427 | Runs · compare · 390 (D-7): run cards, new manifest linked to the old one, resolve pill, CAR; six states |  |
| `CrmFlows.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · flows |  |
| `CrmMapStates.dc.html` | Roofing CRM · not Task A | 1440×760 | Roofing CRM · Map and candidate states |  |
| `CrmAgentStates.dc.html` | Roofing CRM · not Task A | 1440×760 | Roofing CRM · Agent states |  |
| `CrmSignIn390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Sign in · email and password, admin test user · 390 |  |
| `CrmMap390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map, home · whole Travis County until you pick a centre · 390 |  |
| `CrmMapLocating390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · GPS: finding your location · 390 |  |
| `CrmMapGps390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · GPS on, 5 mi around you · 390 |  |
| `CrmMapGpsDenied390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · GPS: location off, drop a pin instead · 390 |  |
| `CrmMapGpsOutside390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · GPS: outside Travis County · 390 |  |
| `CrmMapPinMode390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · Drop a pin: tap the map · 390 |  |
| `CrmMapPin390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · Pin dropped, results around it · 390 |  |
| `CrmTriage390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Field triage · one card per property, swipe or buttons (signature moment #3) · 390 |  |
| `CrmCandidates390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Candidate list · 390 |  |
| `CrmProperty390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Property drawer (PropertyDetail, CRM order) · Create lead · 390 |  |
| `CrmLeadCreate390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Create lead · one tap from a card: created, Undo, Open lead, Add a note · 390 |  |
| `CrmLeadDup390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Create lead · already a lead, refused (never created twice) · 390 |  |
| `CrmAgent390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Agent · answer, citations ↔ pins, Create lead · 390 |  |
| `CrmAgentWorking390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Agent · Working… (AD-09) · 390 |  |
| `CrmAgentSlow390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Agent · Took too long at 25 s (AD-09) · 390 |  |
| `CrmAgentLimit390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Agent · 10 questions used (rate-limited) · 390 |  |
| `CrmAgentPaused390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Agent · daily budget reached, AI paused · 390 |  |
| `CrmLeads390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Leads · 390 |  |
| `CrmLeadDetail390.dc.html` | Roofing CRM · not Task A | 390×1800 | Roofing CRM · Lead detail · 390 |  |
| `CrmComingSoon390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Coming-soon section page (?section=) · 390 |  |
| `CrmLeadsLoading390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Leads · loading · 390 |  |
| `CrmLeadsEmpty390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Leads · empty (no leads yet) · 390 |  |
| `CrmLeadsError390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Leads · error · 390 |  |
| `CrmLeadsPartial390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Leads · partial data · 390 |  |
| `CrmLeadDetailLoading390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Lead detail · loading · 390 |  |
| `CrmLeadDetailError390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Lead detail · error · 390 |  |
| `CrmLeadDetailPartial390.dc.html` | Roofing CRM · not Task A | 390×1800 | Roofing CRM · Lead detail · partial data · 390 |  |
| `CrmLeadDetailMissing390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Lead detail · not found (empty) · 390 |  |
| `CrmSignInLoading390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Sign in · signing in · 390 |  |
| `CrmSignInError390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Sign in · wrong email or password · 390 |  |
| `CrmSignInLocked390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Sign in · too many attempts, try again later · 390 |  |
| `CrmSignIn768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Sign in · 768 |  |
| `CrmMap768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Map, home · whole Travis County until you pick a centre · 768 |  |
| `CrmMapGps768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Map · GPS on, 5 mi around you · 768 |  |
| `CrmCandidates768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Candidate list · 768 |  |
| `CrmProperty768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Property drawer (PropertyDetail, CRM order) · Create lead · 768 |  |
| `CrmLeadCreate768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Create lead · one tap: created snackbar · 768 |  |
| `CrmAgent768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Agent · answer, citations ↔ pins, Create lead · 768 |  |
| `CrmLeads768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Leads · 768 |  |
| `CrmLeadDetail768.dc.html` | Roofing CRM · not Task A | 768×1400 | Roofing CRM · Lead detail · 768 |  |
| `CrmComingSoon768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Coming-soon section page · 768 |  |
| `CrmSignIn1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Sign in · email and password, admin test user · 1440 |  |
| `CrmMap1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Map, home · whole Travis County until you pick a centre · 1440 |  |
| `CrmMapGps1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Map · GPS on, 5 mi around you · 1440 |  |
| `CrmMapPinMode1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Map · Drop a pin: tap the map · 1440 |  |
| `CrmMapPin1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Map · Pin dropped, results around it · 1440 |  |
| `CrmCandidates1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Candidate list · same matches as the map, select rows, Create n leads · 1440 |  |
| `CrmProperty1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Property drawer (PropertyDetail, CRM order) · Create lead · 1440 |  |
| `CrmLeadCreate1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Create lead · one tap: created snackbar · 1440 |  |
| `CrmLeadDup1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Create lead · already a lead, refused · 1440 |  |
| `CrmAgent1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Agent · answer, citations ↔ pins, Create lead · 1440 |  |
| `CrmAgentWorking1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Agent · Working… (AD-09) · 1440 |  |
| `CrmAgentSlow1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Agent · Took too long at 25 s (AD-09) · 1440 |  |
| `CrmLeads1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Leads |  |
| `CrmLeadDetail1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Lead detail |  |
| `CrmComingSoon1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Coming-soon section page (?section=) · 1440 |  |
| `CrmSignInExpired390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Sign in · session expired, returns to the filtered Leads link · 390 |  |
| `CrmSignInSignedOut390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Sign in · signed out by the user · 390 |  |
| `CrmShell390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Shell · bottom bar with More open (Coming soon, Apps, Sign out) · 390 |  |
| `CrmShell1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Shell · top bar, rail with Coming soon, account menu open · 1440 |  |
| `CrmShellData1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Shell · data source panel (newer run available) · 1440 |  |
| `CrmDataChip.dc.html` | Roofing CRM · not Task A | 380×300 | Roofing CRM · Data source chip and panel (component) |  |
| `CrmAccount.dc.html` | Roofing CRM · not Task A | 320×220 | Roofing CRM · Account menu (component) |  |
| `CrmBottomNav.dc.html` | Roofing CRM · not Task A | 390×80 | Roofing CRM · Bottom bar and More sheet, 390 (component) |  |
| `CrmGpsStates.dc.html` | Roofing CRM · not Task A | 1440×960 | Roofing CRM · GPS and pin states |  |
| `CrmMapGpsExplain390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · GPS: explain before the browser asks · 390 |  |
| `CrmMapGpsLow390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · GPS: low accuracy (over 500 m) · 390 |  |
| `CrmMapGpsUnavailable390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · GPS: unavailable or timed out · 390 |  |
| `CrmMapPinOutside390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map · Pin outside Travis County · 390 |  |
| `CrmMapTiles390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map state · tiles loading · 390 |  |
| `CrmMapFailed390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map state · map failed, results below · 390 |  |
| `CrmMapNoResults390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map state · no results in the ring · 390 |  |
| `CrmMapPartial390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map state · partial: ring overlaps a permit coverage gap · 390 |  |
| `CrmMapIndexDown390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Map state · lead index unavailable · 390 |  |
| `CrmMapPinMove1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Map · Pin dropped: drag it or use the arrow keys · 1440 |  |
| `CrmPropertyCreating390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Property drawer · creating the lead · 390 |  |
| `CrmPropertyCreated390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Property drawer · lead created, Add a note open · 390 |  |
| `CrmPropertyDup390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Property drawer · already a lead (Open lead) · 390 |  |
| `CrmPropertyFailed390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Property drawer · create failed, offline · 390 |  |
| `CrmPropertyPartial390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Property drawer · partial data: roof age unknown, no permit data · 390 |  |
| `CrmCandidatesConfirm390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Candidate list · Create 3 leads? confirmation (1 already a lead, skipped) · 390 |  |
| `CrmCandidatesCreated390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Candidate list · 2 leads created · 1 already a lead (Undo, Open Leads) · 390 |  |
| `CrmCandidatesConfirm1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Candidate list · Create leads confirmation · 1440 |  |
| `CrmCandidatesHide1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Candidate list · Hide existing leads on · 1440 |  |
| `CrmPropertyFailed1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Property drawer · create failed, Try again · 1440 |  |
| `CrmTriageSwipe390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Field triage · swiping right: Create lead · 390 |  |
| `CrmTriageLead390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Field triage · already a lead: Skip or Open lead · 390 |  |
| `CrmTriageLoading390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Field triage · loading the next card · 390 |  |
| `CrmTriageFailed390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Field triage · create failed, the card returns with Try again · 390 |  |
| `CrmTriageOffline390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Field triage · offline · 390 |  |
| `CrmTriageEnd390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Field triage · end of stack: n created, m skipped · 390 |  |
| `CrmTriageEmpty390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Field triage · empty: no candidates in the ring · 390 |  |
| `CrmLeadsStates.dc.html` | Roofing CRM · not Task A | 1440×760 | Roofing CRM · Leads states |  |
| `CrmLeadsAllReps390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Leads · All reps (sales manager) · 390 |  |
| `CrmLeadsNoMatch390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Leads · no leads match these filters · 390 |  |
| `CrmLeadsFiltered1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Leads · combined filters from the URL · 1440 |  |
| `CrmLeadsPaged1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Leads · paged: page 2 of 4, all reps (team sample) · 1440 |  |
| `CrmLeadsPaged390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Leads · paged with combined filters: New + Contacted, roof 15+, page 2 of 6 · 390 |  |
| `CrmLead1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Lead (list + detail) |  |
| `CrmLead768.dc.html` | Roofing CRM · not Task A | 768×1490 | Roofing CRM · Lead · 768 |  |
| `CrmLeadStates.dc.html` | Roofing CRM · not Task A | 1440×760 | Roofing CRM · Lead states |  |
| `CrmLead390.dc.html` | Roofing CRM · not Task A | 390×2000 | Roofing CRM · Lead · 390 |  |
| `CrmLeadChanged390.dc.html` | Roofing CRM · not Task A | 390×2000 | Roofing CRM · Lead · signal changed since creation (Now column) · 390 |  |
| `CrmLeadSaving390.dc.html` | Roofing CRM · not Task A | 390×2000 | Roofing CRM · Lead · saving · 390 |  |
| `CrmLeadSaveFailed390.dc.html` | Roofing CRM · not Task A | 390×2000 | Roofing CRM · Lead · save failed, change undone · 390 |  |
| `CrmLeadStale390.dc.html` | Roofing CRM · not Task A | 390×2000 | Roofing CRM · Lead · property not in Run 4 · 390 |  |
| `CrmLeadElsewhere390.dc.html` | Roofing CRM · not Task A | 390×2000 | Roofing CRM · Lead · changed elsewhere · 390 |  |
| `CrmLeadLoading390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Lead · loading · 390 |  |
| `CrmLeadDeleted390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Lead · deleted · 390 |  |
| `CrmAsk390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask the agent · answer, numbered pins, Create lead per row · 390 |  |
| `CrmAsk768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Ask the agent · 768 |  |
| `CrmAsk1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Ask the agent · answer, numbered pins, Create lead per row · 1440 |  |
| `CrmAskConfirm1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Ask · “make leads of the top 3”: confirm first · 1440 |  |
| `CrmAskConfirm390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · confirm before creating leads · 390 |  |
| `CrmAskCreated390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · 1 lead created, 2 already leads · 390 |  |
| `CrmAskCreateFailed390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · create failed from chat · 390 |  |
| `CrmAskNoResults390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · no results, chips to widen · 390 |  |
| `CrmAskLowConf390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · low confidence · 390 |  |
| `CrmAskOutside390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · place outside Travis County · 390 |  |
| `CrmAskNotFound390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · place not found · 390 |  |
| `CrmAskWorking390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · Working… with timer and Cancel · 390 |  |
| `CrmAskSlow390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · Took too long (25 s) · 390 |  |
| `CrmAskThrottled390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · rate-limited · 390 |  |
| `CrmAskPaused390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Ask · AI paused (daily budget) · 390 |  |
| `CrmCandidatesStates.dc.html` | Roofing CRM · not Task A | 1440×760 | Roofing CRM · Candidate list and property drawer states |  |
| `CrmTriageStates.dc.html` | Roofing CRM · not Task A | 1440×760 | Roofing CRM · Field triage states |  |
| `CrmAskStates.dc.html` | Roofing CRM · not Task A | 1440×760 | Roofing CRM · Ask the agent states |  |
| `CrmCandidatesLoading390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Candidate list · loading (skeleton) · 390 |  |
| `CrmCandidatesEmpty390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Candidate list · empty: nothing in the ring · 390 |  |
| `CrmCandidatesError390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Candidate list · error: lead index unavailable, Retry · 390 |  |
| `CrmCandidatesPartial390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Candidate list · partial: no permit data in part of the ring · 390 |  |
| `CrmMapNoAddress390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Address not published · map card (TCAD id, near place, lat/lon) · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmCandidatesNoAddress390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Address not published · candidate row · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmPropertyNoAddress390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Address not published · drawer header · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmPropertyNoAddress1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Address not published · drawer header · 1440 | ships first (contract v1: no address / no contractor name) |
| `CrmTriageNoAddress390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Address not published · triage card · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmAskNoAddress390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Address not published · agent answer row · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmLeadsNoAddress390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Address not published · Leads row · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmLeadsNoAddress1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Address not published · Leads row · 1440 | ships first (contract v1: no address / no contractor name) |
| `CrmLeadNoAddress390.dc.html` | Roofing CRM · not Task A | 390×2000 | Roofing CRM · Address not published · Lead header · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmPropertyNoContractor390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Contractor not published · drawer permits · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmTriageNoContractor390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Contractor not published · triage card · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmAskNoContractor390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Contractor not published · agent rows · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmLeadNoContractor390.dc.html` | Roofing CRM · not Task A | 390×2000 | Roofing CRM · Contractor not published · Lead signals · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmLeadsNoContractor390.dc.html` | Roofing CRM · not Task A | 390×844 | Roofing CRM · Contractor not published · Leads cards · 390 | ships first (contract v1: no address / no contractor name) |
| `CrmLeadsNoContractor1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Contractor not published · Leads column · 1440 | ships first (contract v1: no address / no contractor name) |
| `CrmShellApps1440.dc.html` | Roofing CRM · not Task A | 1440×900 | Roofing CRM · Shell · App switcher menu open (CountyLens, Roofing CRM ✓, Landing page) · 1440 |  |
| `CrmShellApps768.dc.html` | Roofing CRM · not Task A | 768×1024 | Roofing CRM · Shell · App switcher menu open (CountyLens, Roofing CRM ✓, Landing page) · 768 |  |
| `CrmAppsMenu.dc.html` | Roofing CRM · not Task A | 320×220 | Roofing CRM · App switcher menu (component) · CountyLens, Roofing CRM ✓, Landing page |  |
