using Microsoft.Extensions.VectorData;

namespace RoofingCrm.Models;

public sealed class KnowledgeDoc
{
    public const int VectorDimensions = 1536;
    public const string CollectionName = "roofing-opportunities";

    [VectorStoreKey]
    public int Id { get; set; }

    [VectorStoreData]
    public required string Text { get; set; }

    [VectorStoreData]
    public string PropertyId { get; set; } = "";

    [VectorStoreVector(VectorDimensions, DistanceFunction = DistanceFunction.CosineSimilarity)]
    public ReadOnlyMemory<float> Vector { get; set; }
}