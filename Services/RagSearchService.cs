using Microsoft.Extensions.AI;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.VectorData;
using Microsoft.SemanticKernel.Connectors.InMemory;
using RoofingCrm.Data;
using RoofingCrm.Models;
using RoofingCrm.Models.Requests;
using RoofingCrm.Models.Responses;

namespace RoofingCrm.Services;

public sealed class RagSearchService : IRagSearchService
{
    private readonly InMemoryVectorStore _store;
    private readonly IEmbeddingGenerator<string, Embedding<float>> _embedder;
    private readonly IChatClient _chat;
    private readonly RagIndexState _indexState;
    private readonly ILogger<RagSearchService> _logger;
    private readonly int _topK;

    public RagSearchService(
        InMemoryVectorStore store,
        IEmbeddingGenerator<string, Embedding<float>> embedder,
        IChatClient chat,
        RagIndexState indexState,
        IOptions<RagSearchOptions> options,
        ILogger<RagSearchService> logger)
    {
        _store = store;
        _embedder = embedder;
        _chat = chat;
        _indexState = indexState;
        _logger = logger;
        _topK = Math.Max(1, options.Value.TopK);
    }

    public async Task<SearchPromptResponse> SearchAsync(
        SearchPromptRequest request,
        CancellationToken cancellationToken = default)
    {
        await _indexState.WaitUntilReadyAsync(cancellationToken);

        var question = request.Prompt.Trim();
        VectorStoreCollection<int, KnowledgeDoc> docs =
            _store.GetCollection<int, KnowledgeDoc>(KnowledgeDoc.CollectionName);

        await docs.EnsureCollectionExistsAsync(cancellationToken);

        Embedding<float> queryVector = await _embedder.GenerateAsync(question, cancellationToken: cancellationToken);

        List<string> retrieved = [];
        var scoresByPropertyId = new Dictionary<string, double>();

        await foreach (VectorSearchResult<KnowledgeDoc> hit in docs.SearchAsync(
                           queryVector.Vector,
                           top: _topK,
                           cancellationToken: cancellationToken))
        {
            retrieved.Add(hit.Record.Text);
            scoresByPropertyId[hit.Record.PropertyId] = hit.Score ?? 0;
            _logger.LogInformation("[{Score:F3}] {Text}", hit.Score ?? 0, hit.Record.Text);
        }

        var constraints = OpportunityQueryConstraints.Parse(question);

        IEnumerable<RoofingKnowledgeSeed.Entry> candidates = constraints.HasRules
            ? RoofingKnowledgeSeed.Records.Where(e => constraints.Matches(e))
            : RoofingKnowledgeSeed.Records.Where(e => scoresByPropertyId.ContainsKey(e.PropertyId));

        var matched = new List<MatchedPropertyLocation>();
        foreach (var meta in candidates)
        {
            if (!IsWithinRadius(meta, request))
            {
                continue;
            }

            matched.Add(new MatchedPropertyLocation
            {
                PropertyId = meta.PropertyId,
                Address = meta.Address,
                Latitude = meta.Latitude,
                Longitude = meta.Longitude,
                Score = scoresByPropertyId.GetValueOrDefault(meta.PropertyId),
            });
        }

        matched = matched
            .OrderByDescending(m => m.Score)
            .ThenBy(m => m.Address)
            .ToList();

        if (retrieved.Count == 0)
        {
            return new SearchPromptResponse
            {
                Prompt = question,
                Answer = "No similar property or permit records were found.",
                RetrievedContext = retrieved,
                MatchedProperties = matched,
            };
        }

        string context = string.Join("\n", retrieved);
        ChatResponse answer = await _chat.GetResponseAsync(
            $"""
             Answer using only these facts:
             {context}

             Question: {question}
             """,
            cancellationToken: cancellationToken);

        return new SearchPromptResponse
        {
            Prompt = question,
            Answer = answer.Text?.Trim() ?? "",
            RetrievedContext = retrieved,
            MatchedProperties = matched,
        };
    }

    private static bool IsWithinRadius(RoofingKnowledgeSeed.Entry entry, SearchPromptRequest request)
    {
        if (request.Latitude is not double lat
            || request.Longitude is not double lng
            || request.RadiusMiles is not double radius
            || radius <= 0)
        {
            return true;
        }

        return HaversineMiles(lat, lng, entry.Latitude, entry.Longitude) <= radius;
    }

    private static double HaversineMiles(double lat1, double lon1, double lat2, double lon2)
    {
        const double R = 3958.8;
        static double ToRad(double deg) => deg * Math.PI / 180.0;

        var dLat = ToRad(lat2 - lat1);
        var dLon = ToRad(lon2 - lon1);
        var a =
            Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
            Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * R * Math.Asin(Math.Sqrt(a));
    }
}