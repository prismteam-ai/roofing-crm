namespace RoofingCrm.Models.Responses;

public sealed class SearchPromptResponse
{
    public bool Received { get; init; } = true;
    public string Prompt { get; init; } = "";
    public string Answer { get; init; } = "";
    public IReadOnlyList<string> RetrievedContext { get; init; } = [];
    public IReadOnlyList<MatchedPropertyLocation> MatchedProperties { get; init; } = [];
}