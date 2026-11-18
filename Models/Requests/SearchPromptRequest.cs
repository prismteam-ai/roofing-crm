namespace RoofingCrm.Models.Requests;

public sealed class SearchPromptRequest
{
    public string Prompt { get; set; } = "";

    public double? Latitude { get; set; }

    public double? Longitude { get; set; }

    public double? RadiusMiles { get; set; }
}