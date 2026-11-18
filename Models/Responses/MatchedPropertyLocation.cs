namespace RoofingCrm.Models.Responses;

public sealed class MatchedPropertyLocation
{
    public string PropertyId { get; init; } = "";
    public string Address { get; init; } = "";
    public double Latitude { get; init; }
    public double Longitude { get; init; }
    public double Score { get; init; }
}