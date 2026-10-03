# Limitations

A gap on the page is a record the pipeline branch does not contain. Each reason below is a file in that GitHub branch: [candidate-solution](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/tree/candidate-solution).

## Roof age

[san-jose-reroof-roof-age.json](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/fixtures/santa-clara-permits/san-jose-reroof-roof-age.json) is the San Jose re-roof extract. [santa-clara-limitations.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-limitations.md) records 6,955 parcels, 59 completed replacements, and five roofs at 15 years or older, and records that public GIS has no year built. San Jose’s year-built file is for large buildings, and year built is not a roof date.

## Permits outside San Jose

[santa-clara-county-findings.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-county-findings.md) lists the other city portals and records that no harvester was added. There is no single county permit archive. Unincorporated Accela is an application intake. Campbell and Monte Sereno are marked without historical records. Gilroy’s online file starts 2023-06-19. Sunnyvale’s portal splits around 2024-10-07. Mountain View’s older permits are in person. Saratoga’s portal is account-oriented. San Jose is the published roofing extract.

## BBB rating

[santa-clara-limitations.md](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/santa-clara-limitations.md) records no free BBB bulk file. The official API needs approval and does not allow public display of complaints. A contractor name on a San Jose permit is not a score.

## Owner, ten-year hold, and out-of-area owner

The same limitations file records a null owner name. Public GIS `ubcd-cewv` has no owner, mailing address, or sale date. The free Assessor sheet omits the assessee name under Government Code 6254.21 and prohibits resale. The Clerk-Recorder index has been offline since 2018. The paid Secured Master File was not purchased. BizFile does not collect property owners, and an unattended request returns Incapsula.

## Example IPFS gateways

[santa-clara-run-manifest.json](https://github.com/qschachl-creator/oracle-property-intelligence-platform-pipeline-santa-clara-ca/blob/candidate-solution/docs/publication/santa-clara-run-manifest.json) records Filebase and Pinata under `independentGatewayChecks.gateways`. `independentGatewayChecks.notUsed` records HTTP 429 or 403 from `ipfs.io` and `dweb.link` on 2026-10-02.
