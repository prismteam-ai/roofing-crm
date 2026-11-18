using Microsoft.Extensions.AI;
using Microsoft.Extensions.VectorData;
using Microsoft.SemanticKernel.Connectors.InMemory;
using RoofingCrm.Data;
using RoofingCrm.Models;

namespace RoofingCrm.Services;

public sealed class RagKnowledgeIndexHostedService : IHostedService
{
    private readonly InMemoryVectorStore _store;
    private readonly IEmbeddingGenerator<string, Embedding<float>> _embedder;
    private readonly RagIndexState _indexState;
    private readonly ILogger<RagKnowledgeIndexHostedService> _logger;

    public RagKnowledgeIndexHostedService(
        InMemoryVectorStore store,
        IEmbeddingGenerator<string, Embedding<float>> embedder,
        RagIndexState indexState,
        ILogger<RagKnowledgeIndexHostedService> logger)
    {
        _store = store;
        _embedder = embedder;
        _indexState = indexState;
        _logger = logger;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        VectorStoreCollection<int, KnowledgeDoc> docs =
            _store.GetCollection<int, KnowledgeDoc>(KnowledgeDoc.CollectionName);

        await docs.EnsureCollectionExistsAsync(cancellationToken);

        var records = RoofingKnowledgeSeed.Records;
        _logger.LogInformation(
            "Seeding in-memory vector store with {Count} property/permit records.",
            records.Length);

        for (var i = 0; i < records.Length; i++)
        {
            var entry = records[i];
            Embedding<float> embedding = await _embedder.GenerateAsync(entry.Text, cancellationToken: cancellationToken);

            await docs.UpsertAsync(
                new KnowledgeDoc
                {
                    Id = i,
                    Text = entry.Text,
                    PropertyId = entry.PropertyId,
                    Vector = embedding.Vector,
                },
                cancellationToken);
        }

        _indexState.MarkReady();
        _logger.LogInformation("Vector index ready for semantic search.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}