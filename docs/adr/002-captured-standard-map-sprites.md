# Captured Standard map sprite paths

The first actual AWS map proof received a successful Standard descriptor but failed before tile, glyph or sprite loading. Both the proof helper and the application had assumed sprites lived directly under `/v2/styles/Standard/sprites`; that synthetic path had never established actual street-map rendering.

The root's one bounded authenticated-origin descriptor capture returned version 8, 160 layers and the sprite base `/v2/styles/4_1_0-beta_1/Standard/Light/Default/sprites/sprites`. Its SHA256 is `e2d05a3e11a0eac115ef3e1d7bdcd5eaed7737fe55da032b6f78e39bb4b5914d`. The path-only fixture excludes every key value and the raw descriptor. AWS documents the unversioned style/color/variant sprite shape in [GetSprites](https://docs.aws.amazon.com/location/latest/APIReference/API_geomaps_GetSprites.html).

The resource guard admits that captured version prefix and the documented unversioned Standard/Light/Default form, including PNG/JSON and normal/double density. Unknown version prefixes, styles, color schemes, variants, formats, hosts and query parameters remain rejected. Tile and glyph paths retain their existing boundaries; key attachment, region, origin-only referrer policy and finite-expiry configuration checks are unchanged.

Offline tests establish path compatibility and negative guards. Actual AWS resource loading, WebGL rendering and the masked street-map image remain separate hosted gates; this repair alone does not claim visual success. A future provider descriptor version must be captured and reviewed before extending this finite allowlist.
