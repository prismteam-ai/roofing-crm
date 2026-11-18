namespace RoofingCrm.Data;

/// <summary>
/// Property and permit facts for vector search (aligned with map demo properties).
/// </summary>
public static class RoofingKnowledgeSeed
{
    public sealed record Entry(
        string PropertyId,
        double Latitude,
        double Longitude,
        string Address,
        int RoofAgeYears,
        bool PermitOpen,
        int PermitOpenYears,
        string Text);

    public static readonly Entry[] Records =
    [
        new(
            "p1",
            30.2634,
            -97.7712,
            "1204 Barton Springs Rd",
            22,
            true,
            6,
            "1204 Barton Springs Rd, Austin: roof ~22 years; open roofing permit open 6 years (status Open); contractor Lone Star Roofing LLC; BBB B+; roofing opportunity — aging roof and long-open permit."),
        new(
            "p2",
            30.2981,
            -97.7265,
            "810 E 41st St",
            18,
            false,
            0,
            "810 E 41st St, Austin: roof ~18 years; no open roofing permit (status Closed); contractor unavailable; BBB unavailable."),
        new(
            "p3",
            30.3068,
            -97.7341,
            "4517 Avenue G",
            12,
            true,
            3,
            "4517 Avenue G, Austin: roof ~12 years; open roofing permit open 3 years (status Open); contractor Capitol City Roof Co.; BBB A-; roofing opportunity — open permit."),
        new(
            "p4",
            30.2612,
            -97.7148,
            "2300 E 7th St",
            25,
            false,
            0,
            "2300 E 7th St, Austin: roof ~25 years; no open roofing permit; aging roof lead; roofing opportunity — aging roof."),
        new(
            "p5",
            30.2124,
            -97.8401,
            "9901 Brodie Ln",
            16,
            true,
            8,
            "9901 Brodie Ln, Austin: roof ~16 years; open roofing permit open 8 years (status Open); contractor Hill Country Exteriors; BBB C; roofing opportunity — long-open stalled permit."),
        new(
            "p6",
            30.2888,
            -97.7435,
            "711 W 23rd St",
            8,
            false,
            0,
            "711 W 23rd St, Austin: roof ~8 years; no open roofing permit; newer roof."),
        new(
            "p7",
            30.2245,
            -97.835,
            "5205 Brodie Ln",
            14,
            true,
            7,
            "5205 Brodie Ln, Austin: roof ~14 years; open roofing permit open 7 years (status Open); contractor Summit Shield Roofing; BBB B; roofing opportunity — long-open permit."),
    ];
}